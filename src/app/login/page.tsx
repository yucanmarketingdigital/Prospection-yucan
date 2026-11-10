"use client";

import { useActionState, useState } from "react";
import { Logo } from "@/components/logo";
import { authAction } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [state, action, pending] = useActionState(authAction, null);
  return (
    <div className="yucan-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="yucan-dots pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo size="lg" />
          <p className="mt-4 text-white/85">Votre prospection LinkedIn, assistée par l&apos;IA.</p>
        </div>
        <form action={action} className="rounded-3xl bg-white p-7 shadow-2xl">
          <h1 className="font-display text-2xl text-violet">{mode === "login" ? "Connexion" : "Créer mon compte"}</h1>
          <input type="hidden" name="mode" value={mode} />
          <label className="mt-5 block text-sm font-semibold">E-mail</label>
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-magenta" />
          <label className="mt-4 block text-sm font-semibold">Mot de passe</label>
          <input name="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-magenta" />
          {state?.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
          {state?.info && <p className="mt-3 text-sm text-emerald-700">{state.info}</p>}
          <button disabled={pending} className="btn-gradient mt-6 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60 cursor-pointer">
            {pending ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
          <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="mt-4 w-full text-sm text-muted hover:text-magenta cursor-pointer">
            {mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-white/70">Ce compte est celui de l&apos;application, pas votre compte LinkedIn.</p>
      </div>
    </div>
  );
}
