"use client";

import type { ReactNode } from "react";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { cardClass, inputClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";

type AuthGateProps = {
  children: ReactNode;
};

type AuthMode = "signin" | "signup" | "verify";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Something went wrong.";
}

export function AuthGate({ children }: AuthGateProps) {
  const session = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    const result = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: "/",
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Could not create account.");
      return;
    }

    setMode("verify");
    setMessage("Account created. Check the Next.js server console for the verification code.");
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/",
      rememberMe: true,
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Could not sign in. If the email is not verified, check the server console for a code.");
      setMode("verify");
      return;
    }

    await session.refetch();
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    const result = await authClient.emailOtp.verifyEmail({
      email,
      otp,
    });

    if (result.error) {
      setPending(false);
      setError(result.error.message ?? "Verification failed.");
      return;
    }

    const signInResult = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/",
      rememberMe: true,
    });

    setPending(false);

    if (signInResult.error) {
      setMode("signin");
      setMessage("Email verified. Sign in to continue.");
      return;
    }

    await session.refetch();
  }

  async function resendCode() {
    setPending(true);
    setError(null);
    setMessage(null);

    const result = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });

    setPending(false);

    if (result.error) {
      setError(errorMessage(result.error));
      return;
    }

    setMessage("New verification code printed to the server console.");
  }

  if (session.isPending) {
    return (
      <main className="min-h-screen bg-[#120b16] px-4 py-10 text-[#fff8fb]">
        <section className={`${cardClass} mx-auto max-w-xl p-8`}>
          <p className={mutedClass}>Checking session…</p>
        </section>
      </main>
    );
  }

  if (session.data?.user) return <>{children}</>;

  return (
    <main className="min-h-screen bg-[#120b16] bg-[radial-gradient(circle_at_top_left,rgba(255,79,145,0.28),transparent_36rem),radial-gradient(circle_at_top_right,rgba(255,184,107,0.18),transparent_34rem)] px-4 py-10 text-[#fff8fb] sm:px-6 lg:px-8">
      <section className={`${cardClass} mx-auto grid max-w-xl gap-5 p-8`}>
        <div>
          <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffb86b]">PaidPolitely SaaS</span>
          <h1 className="mt-2 mb-2 text-4xl font-black tracking-[-0.05em]">{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Verify email"}</h1>
          <p className={mutedClass}>Email/password auth is powered by Better Auth. Dev verification codes are printed to the server console.</p>
        </div>

        {error ? <div className="rounded-2xl border border-[#ff6b8a]/40 bg-[#ff6b8a]/10 p-3 text-[#ffd7df]">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-[#7affbc]/30 bg-[#7affbc]/10 p-3 text-[#d9ffe9]">{message}</div> : null}

        {mode === "signin" ? (
          <form className="grid gap-3" onSubmit={signIn}>
            <input className={inputClass} type="email" placeholder="Email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input className={inputClass} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className={primaryButtonClass} disabled={pending} type="submit">Sign in</button>
            <button className="text-sm font-extrabold text-[#ffe6f0] underline decoration-white/25 underline-offset-4" type="button" onClick={() => setMode("signup")}>Create an account</button>
          </form>
        ) : null}

        {mode === "signup" ? (
          <form className="grid gap-3" onSubmit={signUp}>
            <input className={inputClass} type="text" placeholder="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
            <input className={inputClass} type="email" placeholder="Email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input className={inputClass} type="password" placeholder="Password, minimum 8 characters" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className={primaryButtonClass} disabled={pending} type="submit">Create account</button>
            <button className="text-sm font-extrabold text-[#ffe6f0] underline decoration-white/25 underline-offset-4" type="button" onClick={() => setMode("signin")}>Already have an account?</button>
          </form>
        ) : null}

        {mode === "verify" ? (
          <form className="grid gap-3" onSubmit={verify}>
            <input className={inputClass} type="email" placeholder="Email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input className={inputClass} inputMode="numeric" placeholder="Verification code from server console" value={otp} onChange={(event) => setOtp(event.target.value)} required />
            <button className={primaryButtonClass} disabled={pending} type="submit">Verify and continue</button>
            <button className="text-sm font-extrabold text-[#ffe6f0] underline decoration-white/25 underline-offset-4" type="button" onClick={resendCode} disabled={pending}>Print a new code</button>
            <button className="text-sm font-extrabold text-[#ffe6f0] underline decoration-white/25 underline-offset-4" type="button" onClick={() => setMode("signin")}>Back to sign in</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
