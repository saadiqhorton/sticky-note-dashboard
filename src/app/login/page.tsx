"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.signIn.email({
      email,
      password,
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Could not sign in");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-chrome p-8 sticky-shadow"
      >
        <p className="font-display text-3xl text-ink">Stickyboard</p>
        <p className="mt-2 text-sm text-ink-muted">
          Sign in to your team sticky-note board.
        </p>

        <label className="mt-8 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-cork/40 bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-amber"
          />
        </label>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-cork/40 bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-amber"
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-lg border border-amber bg-paper px-3 py-2 text-sm text-ink-muted">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-sticky-yellow disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
