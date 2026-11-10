"use client";

import { useState, useTransition } from "react";
import type { Prospect } from "@/lib/domain";
import { Button, Card, Textarea } from "@/components/ui";
import { approveMessage, regenerateMessage, skipStep, stopProspect } from "../actions";

export function ValidateCard({ prospect: p }: { prospect: Prospect }) {
  const [text, setText] = useState(p.pending_message?.text ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-violet">{p.full_name}</div>
          <div className="text-sm text-muted">{p.headline}</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {p.analysis?.score != null && <span className="rounded-full bg-yellow px-2.5 py-0.5 font-bold text-violet">{p.analysis.score}/10</span>}
          <a href={p.url} target="_blank" rel="noreferrer" className="text-magenta hover:underline">Voir le profil</a>
        </div>
      </div>
      {p.analysis?.angle_recommande && <p className="mt-2 text-sm text-muted">💡 {p.analysis.angle_recommande}</p>}
      <Textarea className="mt-3 min-h-36" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-1 text-right text-xs text-muted">{text.length} caractères</div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button disabled={pending || !text.trim()} onClick={() => start(() => approveMessage(p.id, text))}>Approuver</Button>
        <Button
          variant="accent"
          disabled={pending}
          onClick={() => start(async () => { try { setError(""); setText(await regenerateMessage(p.id)); } catch (e) { setError((e as Error).message); } })}
        >
          ✦ Régénérer
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(() => skipStep(p.id))}>Passer cette étape</Button>
        <Button variant="danger" disabled={pending} onClick={() => start(() => stopProspect(p.id))}>Arrêter le scénario</Button>
      </div>
    </Card>
  );
}
