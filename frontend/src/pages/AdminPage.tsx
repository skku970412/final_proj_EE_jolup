import React, { useEffect, useMemo, useState } from "react";
import { Activity, Calendar, LogIn, PlusCircle, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";

const API_BASE_URL =
  (typeof window !== "undefined" && (window as any).__API_BASE_URL__) ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8000";

type ReservationStatus = "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type ReservationRow = {
  id: string;
  sessionId: number;
  plate: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  ownerEmail?: string | null;
};

type SessionReservations = {
  sessionId: number;
  name: string;
  reservations: ReservationRow[];
};

type AdminPageProps = {
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

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    const message = (data as any).detail ?? (data as any).message ?? "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }

  return data as T;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(value: number): string {
  const h = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const m = (value % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function buildSlotCandidates(reservations: ReservationRow[], durationMin: number): string[] {
  const occupied = reservations.map((item) => [toMinutes(item.startTime), toMinutes(item.endTime)] as const);
  const result: string[] = [];
  for (let minutes = 9 * 60; minutes <= (21 * 60); minutes += 30) {
    const start = minutes;
    const end = start + durationMin;
    if (end > 22 * 60) continue;
    const conflict = occupied.some(([s, e]) => !(end <= s || start >= e));
    if (!conflict) {
      result.push(minutesToTime(start));
    }
  }
  return result;
}

function insertReservationSorted(reservations: ReservationRow[], record: ReservationRow): ReservationRow[] {
  return [...reservations, record].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export default function AdminPage({ initialToken, initialEmail }: AdminPageProps): JSX.Element {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [email, setEmail] = useState(initialEmail ?? "admin@demo.dev");
  const [password, setPassword] = useState("admin123");
  const [token, setToken] = useState<string | null>(initialToken ?? null);

  const [date, setDate] = useState(today);
  const [sessions, setSessions] = useState<SessionReservations[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [addSessionId, setAddSessionId] = useState(1);
  const [addDuration, setAddDuration] = useState(60);
  const [addStartTime, setAddStartTime] = useState("09:00");
  const [addPlate, setAddPlate] = useState("관리자 블록");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchSessions = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await request<{ sessions: SessionReservations[] }>(`/api/admin/sessions?date=${date}`);
        if (cancelled) return;
        setSessions(response.sessions);
        setInfo(`${response.sessions.reduce((sum, s) => sum + s.reservations.length, 0)}건의 예약이 로드되었습니다.`);
      } catch (err: unknown) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchSessions();

    if (!autoRefresh) {
      return () => {
        cancelled = true;
      };
    }

    const interval = window.setInterval(fetchSessions, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, date, autoRefresh]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await request<{ token: string; admin: { email: string } }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(result.token);
      setEmail(result.admin.email);
      setInfo(`관리자 로그인 성공: ${result.admin.email}`);
    } catch (err: unknown) {
      setError((err as Error).message);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await request<{ sessions: SessionReservations[] }>(`/api/admin/sessions?date=${date}`);
      setSessions(response.sessions);
      setInfo(`${response.sessions.reduce((sum, s) => sum + s.reservations.length, 0)}건의 예약이 로드되었습니다.`);
      setError("");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReservation = async (reservationId: string, sessionId: number) => {
    if (!token) {
      setError("관리자 로그인이 필요합니다.");
      return;
    }
    if (!window.confirm("해당 예약을 삭제하시겠습니까?")) {
      return;
    }
    try {
      setError("");
      await request<unknown>(`/api/admin/reservations/${reservationId}?date=${date}&sessionId=${sessionId}`, {
        method: "DELETE",
      });
      setSessions((prev) =>
        prev.map((session) =>
          session.sessionId === sessionId
            ? {
                ...session,
                reservations: session.reservations.filter((reservation) => reservation.id !== reservationId),
              }
            : session,
        ),
      );
      setInfo("예약을 삭제했습니다.");
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const availableForAdd = useMemo(() => {
    const session = sessions.find((item) => item.sessionId === addSessionId);
    if (!session) return [];
    return buildSlotCandidates(session.reservations, addDuration);
  }, [sessions, addSessionId, addDuration]);

  useEffect(() => {
    if (availableForAdd.length > 0) {
      setAddStartTime(availableForAdd[0]);
    } else {
      setAddStartTime("");
    }
  }, [availableForAdd]);

  const handleCreateReservation = async () => {
    if (!token) {
      setError("관리자 로그인이 필요합니다.");
      return;
    }
    if (!addStartTime) {
      setError("가능한 시작 시간을 선택해주세요.");
      return;
    }
    try {
      setCreating(true);
      setError("");
      const payload = {
        date,
        sessionId: addSessionId,
        startTime: addStartTime,
        durationMin: addDuration,
        plate: addPlate || "관리자 블록",
      };
      const created = await request<ReservationRow>("/api/admin/reservations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSessions((prev) =>
        prev.map((session) =>
          session.sessionId === created.sessionId
            ? {
                ...session,
                reservations: insertReservationSorted(session.reservations, created),
              }
            : session,
        ),
      );
      setInfo("새 예약을 추가했습니다.");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const totalReservations = sessions.reduce((sum, session) => sum + session.reservations.length, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">관리자 모니터링</h2>
          <p className="text-sm text-slate-600">날짜별 세션 예약 현황과 상태를 실시간으로 조회합니다.</p>
        </div>
      </header>

      {!token ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <LogIn className="h-5 w-5 text-indigo-600" /> 관리자 로그인
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-slate-600">이메일</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                className="rounded-lg border border-slate-200 px-4 py-2"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-slate-600">비밀번호</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="rounded-lg border border-slate-200 px-4 py-2"
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
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">조회 날짜</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="rounded-lg border border-slate-200 px-4 py-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                  className="h-4 w-4"
                />
                30초 자동 새로고침
              </label>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                <RefreshCcw className="h-4 w-4" /> 새로고침
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <SummaryCard icon={<Calendar className="h-4 w-4" />} title="조회 날짜" value={date} />
            <SummaryCard icon={<Activity className="h-4 w-4" />} title="총 예약 수" value={`${totalReservations}`} />
            <SummaryCard icon={<ShieldCheck className="h-4 w-4" />} title="세션 수" value={`${sessions.length}`} />
          </div>

          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <PlusCircle className="h-5 w-5 text-indigo-600" /> 일정 추가
            </h3>
            <div className="grid gap-3 sm:grid-cols-5">
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">세션</span>
                <select
                  value={addSessionId}
                  onChange={(event) => setAddSessionId(Number(event.target.value))}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                >
                  {[1, 2, 3, 4].map((sid) => (
                    <option key={sid} value={sid}>{`세션 ${sid}`}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">소요 시간(분)</span>
                <select
                  value={addDuration}
                  onChange={(event) => setAddDuration(Number(event.target.value))}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                >
                  {[30, 60, 90, 120].map((minutes) => (
                    <option key={minutes} value={minutes}>{minutes}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-600">시작 시간</span>
                <select
                  value={addStartTime}
                  onChange={(event) => setAddStartTime(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  disabled={availableForAdd.length === 0}
                >
                  {availableForAdd.length === 0 ? (
                    <option value="">가능한 시간 없음</option>
                  ) : (
                    availableForAdd.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))
                  )}
                </select>
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-sm text-slate-600">표시할 차량/메모</span>
                <input
                  value={addPlate}
                  onChange={(event) => setAddPlate(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="관리자 블록"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleCreateReservation}
                disabled={creating || availableForAdd.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-50"
              >
                <PlusCircle className="h-4 w-4" /> 일정 추가
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {sessions.map((session) => (
              <div key={session.sessionId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">{session.name}</h4>
                    <p className="text-sm text-slate-600">
                      예약 {session.reservations.length}건 · 진행 중 {session.reservations.filter((r) => r.status === "IN_PROGRESS").length}건
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2">시간</th>
                        <th className="px-3 py-2">차량/메모</th>
                        <th className="px-3 py-2">상태</th>
                        <th className="px-3 py-2">예약 ID</th>
                        <th className="px-3 py-2 text-right">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {session.reservations.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                            예약이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        session.reservations.map((reservation) => (
                          <tr key={reservation.id}>
                            <td className="whitespace-nowrap px-3 py-2">
                              {reservation.startTime} ~ {reservation.endTime}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              <div>{reservation.plate}</div>
                              {reservation.ownerEmail && (
                                <div className="text-xs text-slate-500">{reservation.ownerEmail}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={reservation.status} />
                            </td>
                            <td className="px-3 py-2 text-slate-600">{reservation.id}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteReservation(reservation.id, session.sessionId)}
                                disabled={loading}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> 삭제
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(info || error) && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm">
          {info && <p className="text-indigo-600">ℹ️ {info}</p>}
          {error && <p className="text-rose-600">⚠️ {error}</p>}
        </section>
      )}
    </div>
  );
}

type SummaryCardProps = {
  icon: React.ReactNode;
  title: string;
  value: string;
};

function SummaryCard({ icon, title, value }: SummaryCardProps): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-700 shadow">{icon}</span>
        {title}
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
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
