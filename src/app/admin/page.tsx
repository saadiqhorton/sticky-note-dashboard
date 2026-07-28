import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createInvite, deactivateUser } from "./actions";

export default async function AdminPage() {
  const { user } = await requireAdmin();
  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <main className="min-h-screen bg-paper px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">Admin</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Signed in as {user.email}. Create copy-link invites and manage people.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-sticky-yellow"
        >
          ← Board
        </Link>
      </div>

      <section className="mb-10 rounded-2xl border border-cork/30 bg-chrome/60 p-6">
        <h2 className="font-display text-xl text-ink">Create invite</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Copy the link and send it via Slack/email yourself (no SMTP in v1).
        </p>
        <form action={createInvite} className="mt-4 flex flex-wrap gap-3">
          <input
            name="email"
            type="email"
            placeholder="optional email hint"
            className="rounded-lg border border-cork/40 bg-paper px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-sticky-yellow">
            Generate invite link
          </button>
        </form>

        <ul className="mt-6 space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="rounded-lg border border-cork/25 bg-paper px-3 py-2 text-sm"
            >
              <code className="break-all">
                {appUrl}/invite/{invite.token}
              </code>
              <span className="ml-2 text-ink-muted">
                {invite.usedAt
                  ? `(used ${invite.usedAt.toLocaleDateString()})`
                  : `(expires ${invite.expiresAt.toLocaleDateString()})`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl text-ink">People</h2>
        <ul className="mt-4 space-y-2">
          {users.map((person) => (
            <li
              key={person.id}
              className="flex items-center justify-between rounded-xl border border-cork/30 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-ink">
                  {person.name}{" "}
                  <span className="text-xs text-ink-muted">({person.role})</span>
                </p>
                <p className="text-sm text-ink-muted">{person.email}</p>
              </div>
              {person.id !== user.id ? (
                <form action={deactivateUser.bind(null, person.id)}>
                  <button
                    className="rounded-lg border border-cork/40 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={!person.active}
                  >
                    {person.active ? "Deactivate" : "Inactive"}
                  </button>
                </form>
              ) : (
                <span className="text-xs text-ink-muted">you</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
