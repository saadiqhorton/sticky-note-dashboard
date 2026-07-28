"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch(`/api/invites/${params.token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setPending(false);
      setError(data.error ?? "Invite could not be accepted");
      return;
    }

    const signIn = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signIn.error) {
      setError(signIn.error.message ?? "Account created; please sign in");
      router.push("/login");
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
        <p className="font-display text-3xl text-ink">Join Stickyboard</p>
        <p className="mt-2 text-sm text-ink-muted">
          Accept your invite and choose a password.
        </p>

        <label className="mt-8 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-cork/40 bg-paper px-3 py-2.5 text-sm outline-none focus:border-amber"
          />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-cork/40 bg-paper px-3 py-2.5 text-sm outline-none focus:border-amber"
          />
        </label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-cork/40 bg-paper px-3 py-2.5 text-sm outline-none focus:border-amber"
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
          {pending ? "Joining…" : "Create account"}
        </button>
      </form>
    </main>
  );
}
