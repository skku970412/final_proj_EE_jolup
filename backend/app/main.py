"""FastAPI backend that powers the admin and user JSX frontends."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, create_engine, select, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

USER_TOKEN = "demo-user-token"
ADMIN_TOKEN = "admin-demo-token"
ADMIN_EMAIL = "admin@demo.dev"
ADMIN_PASSWORD = "admin123"
START_HOUR = 9
END_HOUR = 22

DATABASE_PATH = Path(__file__).resolve().parent / "reservations.db"
engine = create_engine(f"sqlite:///{DATABASE_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


class ReservationStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ReservationORM(Base):
    __tablename__ = "reservations"

    id = Column(String, primary_key=True)
    session_id = Column(Integer, nullable=False, index=True)
    plate = Column(String, nullable=False)
    date = Column(String, nullable=False, index=True)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    status = Column(String, nullable=False, default=ReservationStatus.CONFIRMED.value)
    owner_email = Column(String, nullable=True)
    source = Column(String, nullable=False, default="seed")


def ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        existing_columns = {
            row[1] for row in conn.execute(text("PRAGMA table_info(reservations)"))
        }
        if "owner_email" not in existing_columns:
            conn.execute(text("ALTER TABLE reservations ADD COLUMN owner_email TEXT"))
        if "source" not in existing_columns:
            conn.execute(text("ALTER TABLE reservations ADD COLUMN source TEXT DEFAULT 'seed'"))
            conn.execute(text("UPDATE reservations SET source='seed' WHERE source IS NULL"))
        if "source" in existing_columns:
            conn.execute(text("UPDATE reservations SET source='seed' WHERE source IS NULL"))
        if "owner_email" in existing_columns:
            conn.execute(text("UPDATE reservations SET owner_email=NULL WHERE owner_email IS NULL"))


ensure_schema()

app = FastAPI(title="EV Wireless Charging Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: str
    password: str


class VerifyPlateRequest(BaseModel):
    token: str
    plate: str


class ReservationPayload(BaseModel):
    plate: str
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    startTime: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    durationMin: int = Field(..., gt=0)
    sessionId: int = Field(..., ge=1, le=4)


class ReservationRecord(BaseModel):
    id: str
    sessionId: int
    plate: str
    date: str
    startTime: str
    endTime: str
    status: ReservationStatus
    ownerEmail: Optional[str] = None


class SessionReservations(BaseModel):
    sessionId: int
    name: str
    reservations: List[ReservationRecord]


class SessionsResponse(BaseModel):
    sessions: List[SessionReservations]


class SessionSlots(BaseModel):
    id: int
    name: str
    slots: List[str]


class SessionSlotsResponse(BaseModel):
    sessions: List[SessionSlots]


class LoginResponse(BaseModel):
    token: str
    user: Dict[str, str]


class AdminLoginResponse(BaseModel):
    token: str
    admin: Dict[str, str]


class VerifyPlateResponse(BaseModel):
    registered: bool


class ReservationCreateResponse(BaseModel):
    reservationId: str
    status: ReservationStatus


class AdminReservationCreate(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    sessionId: int = Field(..., ge=1, le=4)
    startTime: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    durationMin: int = Field(..., gt=0)
    plate: str = Field(default="관리자 블록")
    status: ReservationStatus = ReservationStatus.CONFIRMED



class UserReservationsResponse(BaseModel):
    reservations: List[ReservationRecord]



@contextmanager
def db_session() -> Session:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/user/login", response_model=LoginResponse)
def login_user(payload: LoginRequest) -> LoginResponse:
    email = payload.email.strip()
    if not email or not payload.password:
        raise HTTPException(status_code=400, detail="이메일과 비밀번호를 모두 입력해주세요.")
    return LoginResponse(token=USER_TOKEN, user={"email": email})


@app.post("/api/user/verify-plate", response_model=VerifyPlateResponse)
def verify_plate(payload: VerifyPlateRequest) -> VerifyPlateResponse:
    if payload.token != USER_TOKEN:
        raise HTTPException(status_code=401, detail="인증 정보가 올바르지 않습니다.")
    cleaned = "".join(ch for ch in payload.plate if ch.isdigit())
    registered = bool(cleaned) and int(cleaned[-1]) % 2 == 0
    return VerifyPlateResponse(registered=registered)


@app.get("/api/user/sessions", response_model=SessionSlotsResponse)
def get_available_sessions(
    date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$"),
    durationMin: int = Query(60, ge=30, le=180),
) -> SessionSlotsResponse:
    ensure_valid_date(date)
    if durationMin % 30 != 0:
        raise HTTPException(status_code=400, detail="durationMin은 30분 단위여야 합니다.")
    seed_reservations_if_needed(date)
    sessions: List[SessionSlots] = []
    with db_session() as session:
        for sid in range(1, 5):
            records = (
                session.query(ReservationORM)
                .filter(ReservationORM.date == date, ReservationORM.session_id == sid)
                .order_by(ReservationORM.start_time)
                .all()
            )
            slots = available_start_times(records, durationMin)
            sessions.append(SessionSlots(id=sid, name=f"세션 {sid}", slots=slots))
    return SessionSlotsResponse(sessions=sessions)


@app.get("/api/user/reservations", response_model=UserReservationsResponse)
def list_user_reservations(token: str = Query(...), email: str = Query(...)) -> UserReservationsResponse:
    if token != USER_TOKEN:
        raise HTTPException(status_code=401, detail="인증 정보가 올바르지 않습니다.")
    with db_session() as session:
        records = (
            session.query(ReservationORM)
            .filter(ReservationORM.owner_email == email)
            .order_by(ReservationORM.date, ReservationORM.start_time)
            .all()
        )
        reservations = [orm_to_schema(record, record.date) for record in records]
    return UserReservationsResponse(reservations=reservations)


@app.post("/api/user/reservations", response_model=ReservationCreateResponse)
def create_reservation(payload: ReservationPayload) -> ReservationCreateResponse:
    reservation_date = ensure_valid_date(payload.date)
    seed_reservations_if_needed(reservation_date)

    start_minutes = ensure_valid_time(payload.startTime)
    if payload.durationMin % 30 != 0:
        raise HTTPException(status_code=400, detail="durationMin은 30분 단위여야 합니다.")
    end_minutes = start_minutes + payload.durationMin
    if end_minutes > END_HOUR * 60:
        raise HTTPException(status_code=400, detail="운영 시간(22:00)을 초과할 수 없습니다.")
    if payload.startTime not in slots_of_day():
        raise HTTPException(status_code=400, detail="지원하지 않는 시작 시간입니다.")

    with db_session() as session:
        existing = (
            session.query(ReservationORM)
            .filter(
                ReservationORM.date == reservation_date,
                ReservationORM.session_id == payload.sessionId,
            )
            .all()
        )
        for record in existing:
            existing_start = ensure_valid_time(record.start_time)
            existing_end = ensure_valid_time(record.end_time)
            if not (end_minutes <= existing_start or start_minutes >= existing_end):
                raise HTTPException(status_code=409, detail="해당 시간에는 이미 예약이 존재합니다.")

        reservation_id = generate_reservation_id(payload.sessionId)
        end_time = minutes_to_hhmm(end_minutes)
        session.add(
            ReservationORM(
                id=reservation_id,
                session_id=payload.sessionId,
                plate=payload.plate.strip(),
                date=reservation_date,
                start_time=payload.startTime,
                end_time=end_time,
                status=ReservationStatus.CONFIRMED.value,
                owner_email=(payload.userEmail or "").strip() or None,
                source="user",
            )
        )

    return ReservationCreateResponse(reservationId=reservation_id, status=ReservationStatus.CONFIRMED)


@app.post("/api/admin/login", response_model=AdminLoginResponse)
def login_admin(payload: LoginRequest) -> AdminLoginResponse:
    if payload.email != ADMIN_EMAIL or payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="관리자 인증에 실패했습니다.")
    return AdminLoginResponse(token=ADMIN_TOKEN, admin={"email": payload.email})


@app.post("/api/admin/reservations", response_model=ReservationRecord, status_code=201)
def admin_create_reservation(payload: AdminReservationCreate) -> ReservationRecord:
    ensure_valid_date(payload.date)
    if payload.durationMin % 30 != 0:
        raise HTTPException(status_code=400, detail="durationMin은 30분 단위여야 합니다.")
    seed_reservations_if_needed(payload.date)
    start_minutes = ensure_valid_time(payload.startTime)
    end_minutes = start_minutes + payload.durationMin
    if end_minutes > END_HOUR * 60:
        raise HTTPException(status_code=400, detail="운영 시간(22:00)을 초과할 수 없습니다.")
    with db_session() as session:
        existing = (
            session.query(ReservationORM)
            .filter(
                ReservationORM.date == payload.date,
                ReservationORM.session_id == payload.sessionId,
            )
            .all()
        )
        for record in existing:
            record_start = ensure_valid_time(record.start_time)
            record_end = ensure_valid_time(record.end_time)
            if not (end_minutes <= record_start or start_minutes >= record_end):
                raise HTTPException(status_code=409, detail="해당 시간에는 이미 예약이 존재합니다.")
        reservation_id = f"ADM-{payload.sessionId}-{uuid4().hex[:8].upper()}"
        db_obj = ReservationORM(
            id=reservation_id,
            session_id=payload.sessionId,
            plate=payload.plate.strip(),
            date=payload.date,
            start_time=payload.startTime,
            end_time=minutes_to_hhmm(end_minutes),
            status=payload.status.value,
            owner_email=None,
            source="admin",
        )
        session.add(db_obj)
        session.flush()
        created = orm_to_schema(db_obj, payload.date)
    return created


@app.get("/api/admin/sessions", response_model=SessionsResponse)
def list_reservations_by_session(date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$")) -> SessionsResponse:
    ensure_valid_date(date)
    seed_reservations_if_needed(date)

    sessions: List[SessionReservations] = []
    with db_session() as session:
        for sid in range(1, 5):
            records = (
                session.query(ReservationORM)
                .filter(ReservationORM.date == date, ReservationORM.session_id == sid)
                .order_by(ReservationORM.start_time)
                .all()
            )
            reservations = [
                orm_to_schema(record, date)
                for record in records
            ]
            sessions.append(
                SessionReservations(
                    sessionId=sid,
                    name=f"세션 {sid}",
                    reservations=reservations,
                )
            )
    return SessionsResponse(sessions=sessions)


@app.delete("/api/admin/reservations/{reservation_id}", status_code=204)
def delete_reservation(
    reservation_id: str,
    date: str = Query(..., regex=r"^\d{4}-\d{2}-\d{2}$"),
    sessionId: int = Query(..., ge=1, le=4),
) -> Response:
    ensure_valid_date(date)
    with db_session() as session:
        record = (
            session.query(ReservationORM)
            .filter(
                ReservationORM.id == reservation_id,
                ReservationORM.date == date,
                ReservationORM.session_id == sessionId,
            )
            .first()
        )
        if not record:
            raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
        session.delete(record)
    return Response(status_code=204)


def ensure_valid_date(date_str: str) -> str:
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as exc:  # pragma: no cover - fastfail
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD이어야 합니다.") from exc
    return date_str


def ensure_valid_time(time_str: str) -> int:
    try:
        hour, minute = map(int, time_str.split(":"))
    except ValueError as exc:  # pragma: no cover - fastfail
        raise HTTPException(status_code=400, detail="시간 형식은 HH:MM이어야 합니다.") from exc
    if hour < START_HOUR or hour > END_HOUR or minute not in (0, 30):
        raise HTTPException(status_code=400, detail="운영 시간 외의 요청입니다.")
    return hour * 60 + minute


def minutes_to_hhmm(total_minutes: int) -> str:
    hour = total_minutes // 60
    minute = total_minutes % 60
    return f"{hour:02d}:{minute:02d}"


def slots_of_day() -> List[str]:
    slots: List[str] = []
    for hour in range(START_HOUR, END_HOUR):
        slots.append(f"{hour:02d}:00")
        slots.append(f"{hour:02d}:30")
    return slots


def seed_reservations_if_needed(date_str: str) -> None:
    with db_session() as session:
        existing_ids = {
            row[0]
            for row in session.execute(
                select(ReservationORM.id).where(ReservationORM.date == date_str)
            )
        }
        for sid in range(1, 5):
            generated = generate_base_reservations_for_session(date_str, sid)
            for record in generated:
                if record.id in existing_ids:
                    continue
                session.add(
                    ReservationORM(
                        id=record.id,
                        session_id=record.sessionId,
                        plate=record.plate,
                        date=record.date,
                        start_time=record.startTime,
                        end_time=record.endTime,
                        status=record.status.value,
                        owner_email=None,
                        source="seed",
                    )
                )
                existing_ids.add(record.id)


def seed_current_day_once() -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    seed_reservations_if_needed(today)


def generate_base_reservations_for_session(date_str: str, session_id: int) -> List[ReservationRecord]:
    from random import Random

    seed_value = hash(f"{date_str}#{session_id}") & 0xFFFFFFFF
    rng = Random(seed_value)
    reservations: List[ReservationRecord] = []
    slots = slots_of_day()
    i = 0
    while i < len(slots):
        if rng.random() < 0.28:
            start = slots[i]
            duration_slots = rng.choice([1, 2, 3])
            start_minutes = ensure_valid_time(start)
            end_minutes = min(END_HOUR * 60, start_minutes + duration_slots * 30)
            reservations.append(
                ReservationRecord(
                    id=f"RSV-{session_id}-{start.replace(':', '')}",
                    sessionId=session_id,
                    plate=random_plate(rng),
                    date=date_str,
                    startTime=start,
                    endTime=minutes_to_hhmm(end_minutes),
                    status=ReservationStatus.CONFIRMED,
                )
            )
            i += duration_slots
        else:
            i += 1
    return reservations


def orm_to_schema(record: ReservationORM, date_str: str) -> ReservationRecord:
    status = ReservationStatus(record.status)
    now = datetime.now()
    if same_date(date_str, now):
        start = ensure_valid_time(record.start_time)
        end = ensure_valid_time(record.end_time)
        now_minutes = now.hour * 60 + now.minute
        if start <= now_minutes < end:
            status = ReservationStatus.IN_PROGRESS
        elif now_minutes >= end:
            status = ReservationStatus.COMPLETED
    return ReservationRecord(
        id=record.id,
        sessionId=record.session_id,
        plate=record.plate,
        date=record.date,
        startTime=record.start_time,
        endTime=record.end_time,
        status=status,
    )


def same_date(date_str: str, reference: datetime) -> bool:
    return reference.strftime("%Y-%m-%d") == date_str


def reservation_intervals(records):
    intervals: list[tuple[int, int]] = []
    for record in records:
        start = ensure_valid_time(record.start_time)
        end = ensure_valid_time(record.end_time)
        intervals.append((start, end))
    return intervals


def available_start_times(records, duration_min: int) -> list[str]:
    occupied = reservation_intervals(records)
    result: list[str] = []
    for slot in slots_of_day():
        start = ensure_valid_time(slot)
        end = start + duration_min
        if end > END_HOUR * 60:
            continue
        if any(not (end <= s or start >= e) for s, e in occupied):
            continue
        result.append(slot)
    return result


def random_plate(rng) -> str:
    regions = ["서울", "경기", "부산", "인천", "대전"]
    hangul = "가나다라마"
    region = regions[int(rng.random() * len(regions)) % len(regions)]
    num3 = int(rng.random() * 900) + 100
    letter = hangul[int(rng.random() * len(hangul)) % len(hangul)]
    num4 = int(rng.random() * 9000) + 1000
    return f"{region}{num3}{letter}{num4}"


def generate_reservation_id(session_id: int) -> str:
    return f"RSV-{session_id}-{uuid4().hex[:8].upper()}"


seed_current_day_once()
