import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Car, CheckCircle2, Clock, LogIn, Power } from "lucide-react";

const API_BASE_URL =
  (typeof window !== "undefined" && (window as any).__API_BASE_URL__) ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8000";

type ReservationStatus = "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type SessionSlots = {
  id: number;
  name: string;
  slots: string[];
};

type ReservationPayload = {
  plate: string;
  date: string;
  startTime: string;
  durationMin: number;
  sessionId: number;
  userEmail: string | null;
};

type UserReservation = {
  id: string;
  sessionId: number;
  plate: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
};

type UserFrontProps = {
  initialToken?: string;
  initialEmail?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    const message = (data as any).detail ?? (data as any).message ?? "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }

  return data as T;
}

const DURATION_OPTIONS = [30, 60, 90, 120];

export default function UserFront({ initialToken, initialEmail }: UserFrontProps): JSX.Element {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(initialToken ?? null);

  const [plate, setPlate] = useState("");
  const [plateChecked, setPlateChecked] = useState<null | boolean>(null);

  const [date, setDate] = useState(today);
  const [sessions, setSessions] = useState<SessionSlots[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<string>("09:00");
  const [duration, setDuration] = useState<number>(60);

  const [reservationId, setReservationId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const [myReservations, setMyReservations] = useState<UserReservation[]>([]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? sessions[0],
    [sessions, selectedSessionId],
  );

  const availableSlots = selectedSession?.slots ?? [];

  const refreshSessions = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError("");
      const response = await request<{ sessions: SessionSlots[] }>(
        `/api/user/sessions?date=${date}&durationMin=${duration}`,
      );
      setSessions(response.sessions);
      const defaultSession = response.sessions.find((session) => session.id === selectedSessionId) ?? response.sessions[0];
      if (defaultSession) {
        setSelectedSessionId(defaultSession.id);
        setStartTime(defaultSession.slots[0] ?? "");
      } else {
        setSelectedSessionId(null);
        setStartTime("");
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, date, duration, selectedSessionId]);

  const refreshMyReservations = useCallback(async () => {
    if (!token || !email) return;
    try {
      const response = await request<{ reservations: UserReservation[] }>(
        `/api/user/reservations?token=${token}&email=${encodeURIComponent(email)}`,
      );
      setMyReservations(response.reservations);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, [token, email]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    void refreshMyReservations();
  }, [refreshMyReservations]);

  useEffect(() => {
    if (!token) return;
    if (!availableSlots.includes(startTime)) {
      setStartTime(availableSlots[0] ?? "");
    }
  }, [availableSlots, token, startTime]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await request<{ token: string; user: { email: string } }>("/api/user/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(result.token);
      setEmail(result.user.email);
      setStatusMessage(`로그인 성공: ${result.user.email}`);
      setReservationId(null);
      await refreshSessions();
      await refreshMyReservations();
    } catch (err: unknown) {
      setError((err as Error).message);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPlate = async () => {
    if (!token) {
      setError("먼저 로그인해주세요.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const result = await request<{ registered: boolean }>("/api/user/verify-plate", {
        method: "POST",
        body: JSON.stringify({ token, plate }),
      });
      setPlateChecked(result.registered);
      setStatusMessage(result.registered ? "등록된 차량번호입니다." : "등록되지 않은 차량번호입니다.");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReservation = async () => {
    if (!token) {
      setError("먼저 로그인해주세요.");
      return;
    }
    if (!plate) {
      setError("차량 번호를 입력해주세요.");
      return;
    }
    if (!selectedSession) {
      setError("예약 가능한 세션이 없습니다.");
      return;
    }
    if (!startTime) {
      setError("가능한 시작 시간이 없습니다.");
      return;
    }

    const payload: ReservationPayload = {
      plate,
      date,
      startTime,
      durationMin: duration,
      sessionId: selectedSession.id,
      userEmail: email || null,
    };

    try {
      setLoading(true);
      setError("");
      const result = await request<{ reservationId: string; status: string }>("/api/user/reservations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setReservationId(result.reservationId);
      setStatusMessage(`예약이 완료되었습니다. 예약 ID: ${result.reservationId}`);
      await refreshSessions();
      await refreshMyReservations();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow">
          <Power className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">무선충전 사용자 화면</h2>
          <p className="text-sm text-slate-600">로그인 → 번호판 확인 → 예약 생성까지 순서대로 진행하세요.</p>
        </div>
      </header>

      {!token ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <LogIn className="h-5 w-5 text-indigo-600" /> 사용자 로그인
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-slate-600">이메일</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-2"
                placeholder="you@example.com"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-slate-600">비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-2"
                placeholder="••••••••"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading || !email || !password}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-50"
            >
              로그인
            </button>
          </div>
        </section>
      ) : null}

      {token ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Car className="h-5 w-5 text-indigo-600" /> 번호판 확인
            </h3>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={plate}
                onChange={(event) => {
                  setPlate(event.target.value);
                  setPlateChecked(null);
                }}
                className="w-full rounded-lg border border-slate-200 px-4 py-2"
                placeholder="예: 서울12가3456"
              />
              <button
                type="button"
                onClick={handleVerifyPlate}
                disabled={loading || !plate}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                확인
              </button>
              {plateChecked !== null && (
                <span className={plateChecked ? "text-emerald-600" : "text-rose-600"}>
                  {plateChecked ? "등록 차량" : "미등록 차량"}
                </span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock className="h-5 w-5 text-indigo-600" /> 예약 설정
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">예약 날짜</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">세션 선택</span>
                <select
                  value={selectedSession?.id ?? ""}
                  onChange={(event) => setSelectedSessionId(Number(event.target.value))}
                  className="rounded-lg border border-slate-200 px-4 py-2"
                >
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">시작 시간</span>
                <select
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-2"
                  disabled={availableSlots.length === 0}
                >
                  {availableSlots.length === 0 ? (
                    <option value="">가능한 시간 없음</option>
                  ) : (
                    availableSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">사용 시간(분)</span>
                <select
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="rounded-lg border border-slate-200 px-4 py-2"
                >
                  {DURATION_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes}분
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCreateReservation}
                disabled={loading || !startTime || availableSlots.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-50"
              >
                예약 생성
              </button>
              {reservationId && (
                <span className="text-sm text-emerald-600">예약 ID: {reservationId}</span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CheckCircle2 className="h-5 w-5 text-indigo-600" /> 나의 예약 목록
            </h3>
            {myReservations.length === 0 ? (
              <p className="text-sm text-slate-500">현재 예약이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-3 py-2">날짜</th>
                      <th className="px-3 py-2">세션</th>
                      <th className="px-3 py-2">시간</th>
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2">예약 ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myReservations.map((reservation) => (
                      <tr key={reservation.id}>
                        <td className="px-3 py-2">{reservation.date}</td>
                        <td className="px-3 py-2">세션 {reservation.sessionId}</td>
                        <td className="px-3 py-2">
                          {reservation.startTime} ~ {reservation.endTime}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={reservation.status} />
                        </td>
                        <td className="px-3 py-2 text-slate-600">{reservation.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {(statusMessage || error) && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm">
          {statusMessage && <p className="text-emerald-700">✅ {statusMessage}</p>}
          {error && <p className="text-rose-600">⚠️ {error}</p>}
        </section>
      )}
    </div>
  );
}

type StatusBadgeProps = {
  status: ReservationStatus;
};

function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const styles: Record<ReservationStatus, string> = {
    CONFIRMED: "bg-indigo-100 text-indigo-700",
    IN_PROGRESS: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-slate-100 text-slate-600",
    CANCELLED: "bg-rose-100 text-rose-600",
  };

  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status]}`}>{status}</span>;
}
