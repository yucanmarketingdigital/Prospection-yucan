"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Logo } from "./logo";
import { signOut, toggleEngine } from "@/app/(app)/actions";

const NAV = [
  { href: "/", label: "Tableau de bord", icon: "◆" },
  { href: "/prospects", label: "Prospects", icon: "●" },
  { href: "/scenarios", label: "Scénarios", icon: "➜" },
  { href: "/validate", label: "À valider", icon: "✓" },
  { href: "/stats", label: "Statistiques", icon: "▲" },
  { href: "/assistant", label: "Assistant IA", icon: "✦" },
  { href: "/settings", label: "Réglages", icon: "⚙" },
];

export function Sidebar({ paused, toValidate, extensionOnline, email }: { paused: boolean; toValidate: number; extensionOnline: boolean; email: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="yucan-gradient relative text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
      <div className="flex items-center justify-between px-5 py-4 md:block md:px-6 md:py-8">
        <Link href="/">
          <Logo />
        </Link>
        <button className="rounded-lg border border-white/30 px-3 py-1 text-sm md:hidden" onClick={() => setOpen(!open)}>
          Menu
        </button>
      </div>
      <div className={`${open ? "block" : "hidden"} px-3 pb-6 md:block`}>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active(n.href) ? "bg-white text-violet font-semibold shadow" : "text-white/85 hover:bg-white/10"
              }`}
            >
              <span className={active(n.href) ? "text-magenta" : "text-yellow"}>{n.icon}</span>
              {n.label}
              {n.href === "/validate" && toValidate > 0 && (
                <span className="ml-auto rounded-full bg-yellow px-2 text-xs font-bold text-violet">{toValidate}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-6 rounded-2xl bg-white/10 p-4 backdrop-blur">
          <div className="text-xs uppercase tracking-wider text-white/70">Prospection</div>
          <div className="mt-1 font-semibold">{paused ? "En pause" : "Active"}</div>
          <button
            disabled={pending}
            onClick={() => start(() => toggleEngine())}
            className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition cursor-pointer ${
              paused ? "bg-yellow text-violet hover:brightness-105" : "bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            {pending ? "…" : paused ? "Démarrer" : "Mettre en pause"}
          </button>
          <div className="mt-3 flex items-center gap-2 text-xs text-white/80">
            <span className={`h-2 w-2 rounded-full ${extensionOnline ? "bg-emerald-300" : "bg-white/40"}`} />
            Extension {extensionOnline ? "connectée" : "non connectée"}
          </div>
        </div>

        <div className="mt-6 px-3 text-xs text-white/70">
          <div className="truncate">{email}</div>
          <button onClick={() => signOut()} className="mt-1 underline underline-offset-2 hover:text-white cursor-pointer">
            Se déconnecter
          </button>
        </div>
      </div>
      <div className="yucan-dots pointer-events-none absolute inset-x-0 bottom-0 hidden h-48 md:block" />
    </aside>
  );
}
