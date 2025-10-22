import React, { useMemo, useState } from "react";
import AdminPage from "./pages/AdminPage";
import UserFront from "./pages/UserFront";

type SessionState =
  | { mode: "login" }
  | { mode: "admin"; token: string; email: string }
  | { mode: "user"; token: string; email: string };

const API_BASE_URL =
  (typeof window !== "undefined" && (window as any).__API_BASE_URL__) ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8000";

type LoginResult =
  | { success: true; role: "admin" | "user"; token: string; email: string }
  | { success: false; message: string };

async function tryLogin(email: string, password: string): Promise<LoginResult> {
  const payload = { email, password };

  const adminResponse = await fetch(`${API_BASE_URL}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const adminData = await adminResponse
    .json()
    .catch(() => ({}));
  if (adminResponse.ok) {
    return {
      success: true,
      role: "admin",
      token: (adminData as any).token,
      email: (adminData as any).admin?.email ?? email,
    };
  }

  const userResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const userData = await userResponse
    .json()
    .catch(() => ({}));
  if (userResponse.ok) {
    return {
      success: true,
      role: "user",
      token: (userData as any).token,
      email: (userData as any).user?.email ?? email,
    };
  }

  const detail =
    (adminData as any).detail ??
    (userData as any).detail ??
    (userData as any).message ??
    "아이디 또는 비밀번호를 확인해주세요.";

  return { success: false, message: detail };
}

export default function App(): JSX.Element {
  const [session, setSession] = useState<SessionState>({ mode: "login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await tryLogin(email.trim(), password);
      if (result.success) {
        if (result.role === "admin") {
          setSession({ mode: "admin", token: result.token, email: result.email });
        } else {
          setSession({ mode: "user", token: result.token, email: result.email });
        }
        setPassword("");
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? "로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setSession({ mode: "login" });
    setPassword("");
  };

  const heading = useMemo(() => {
    if (session.mode === "admin") {
      return `관리자 (${session.email})`;
    }
    if (session.mode === "user") {
      return `사용자 (${session.email})`;
    }
    return "로그인";
  }, [session]);

  if (session.mode === "login") {
    return (
      <div className="min-h-screen bg-slate-100 py-10">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-semibold text-slate-900">EV 무선충전 통합 로그인</h1>
          <p className="mt-2 text-sm text-slate-600">아이디/비밀번호에 따라 사용자 또는 관리자 화면으로 이동합니다.</p>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-1">
              <span className="text-sm text-slate-600">아이디 (이메일)</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-lg border border-slate-200 px-4 py-2"
                placeholder="you@example.com"
                disabled={loading}
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
                disabled={loading}
              />
            </label>
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "확인 중..." : "로그인"}
            </button>
            {error && <p className="text-sm text-rose-600">⚠️ {error}</p>}
            <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600">
              <p className="font-medium text-slate-700">테스트 계정</p>
              <p>• 관리자: admin@demo.dev / admin123</p>
              <p>• 사용자: 아무 이메일 / 임의 비밀번호</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="mx-auto max-w-6xl px-4">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">EV 무선충전 데모</h1>
            <p className="text-slate-600">현재 세션: {heading}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="self-start rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow hover:bg-slate-100"
          >
            로그아웃
          </button>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-lg">
          {session.mode === "admin" ? (
            <AdminPage
              key={`admin-${session.token}`}
              initialEmail={session.email}
              initialToken={session.token}
            />
          ) : (
            <UserFront
              key={`user-${session.token}`}
              initialEmail={session.email}
              initialToken={session.token}
            />
          )}
        </div>
      </div>
    </div>
  );
}
