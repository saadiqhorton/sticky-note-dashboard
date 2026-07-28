"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type BoardChromeProps = {
  isAdmin: boolean;
  search: string;
  onSearchChange: (value: string) => void;
};

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-ink text-paper"
          : "border border-cork/30 bg-paper text-ink hover:bg-chrome"
      }`}
    >
      {children}
    </Link>
  );
}

export function BoardChrome({ isAdmin, search, onSearchChange }: BoardChromeProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const view = searchParams.get("view") === "list" ? "list" : "canvas";
  const board = searchParams.get("board") === "private" ? "private" : "team";

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function withParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      next.set(key, value);
    }
    return `${pathname}?${next.toString()}`;
  }

  async function signOut() {
    setMenuOpen(false);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 flex flex-nowrap items-center gap-4 border-b border-cork/20 bg-chrome/95 px-6 py-3 backdrop-blur">
      <Link href="/?board=team" className="font-display text-xl text-ink shrink-0">
        Stickyboard
      </Link>

      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search notes…"
        className="min-w-48 max-w-md flex-1 rounded-lg border border-cork/35 bg-paper px-3.5 py-2.5 text-sm text-ink outline-none focus:border-amber"
      />

      <nav className="ml-auto flex min-w-0 shrink items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:thin]">
          <Chip href={withParams({ view: "canvas" })} active={view === "canvas"}>
            Canvas
          </Chip>
          <Chip href={withParams({ view: "list" })} active={view === "list"}>
            List
          </Chip>
          <Chip href={withParams({ board: "team" })} active={board === "team"}>
            Team
          </Chip>
          <Chip href={withParams({ board: "private" })} active={board === "private"}>
            My board
          </Chip>
          <Chip href="/trash" active={pathname === "/trash"}>
            Trash
          </Chip>
          {isAdmin ? (
            <Chip href="/admin" active={pathname === "/admin"}>
              Admin
            </Chip>
          ) : null}
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="h-8 w-8 rounded-full bg-amber"
            aria-label="Account menu"
            aria-expanded={menuOpen}
            title="Account"
          />
          {menuOpen ? (
            <div className="absolute right-0 top-10 z-[60] w-44 rounded-[10px] border border-cork/35 bg-white p-2 sticky-shadow">
              <button
                type="button"
                onClick={signOut}
                className="w-full rounded-md px-3 py-2.5 text-left text-sm text-ink transition hover:bg-chrome"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
