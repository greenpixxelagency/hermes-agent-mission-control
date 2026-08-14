"use client";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    if (mode === "signin") { const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/" }); if (result?.error) setMessage("Email or password is incorrect."); else window.location.assign(result?.url || "/"); return; }
    const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await response.json(); setMessage(response.ok ? (mode === "signup" ? "Account created. You can now sign in." : data.message) : data.error);
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--bg)" }}>
      <div className="hq-ambient" aria-hidden />
      <div className="relative z-10 panel hq-rise w-full max-w-sm p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-11 h-11 rounded-[var(--r-md)] bg-white flex items-center justify-center text-[19px] font-bold text-[#0a0b0d]">
            M
          </div>
          <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.015em] text-[var(--text)]">
            Hermy HQ
          </h1>
          <p className="eyebrow mt-2">Sign in to continue</p>
        </div>

        <div className="rule my-7" />

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="btn-primary w-full py-3 text-[13px] flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
          Continue with Google
        </button>
        <div className="rule my-5" />
        <form onSubmit={submit} className="space-y-3">
          <input className="w-full rounded border border-[var(--line)] bg-transparent p-3 text-sm" required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          {mode !== "forgot" && <input className="w-full rounded border border-[var(--line)] bg-transparent p-3 text-sm" required minLength={12} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />}
          <button className="btn-primary w-full py-3 text-[13px]" type="submit">{mode === "signup" ? "Create account" : mode === "forgot" ? "Request reset" : "Sign In"}</button>
        </form>
        {message && <p role="alert" className="mt-3 text-sm">{message}</p>}
        <div className="mt-5 flex justify-between text-sm"><button onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Sign in" : "Create account"}</button><button onClick={() => setMode(mode === "forgot" ? "signin" : "forgot")}>{mode === "forgot" ? "Back" : "Forgot password?"}</button></div>
      </div>
    </div>
  );
}
