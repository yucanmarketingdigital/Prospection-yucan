"use client";

import { useState, useTransition } from "react";
import { Button, Card, PageTitle, Textarea } from "@/components/ui";
import { DictateButton, joinText } from "@/components/voice";
import { askAssistant } from "../actions";

const SUGGESTIONS = [
  "Aide-moi à définir ma cible idéale et les filtres de recherche LinkedIn",
  "Analyse mes résultats et dis-moi quoi améliorer",
  "Écris 3 variantes de premier message après connexion",
  "Propose un planning de prospection hebdomadaire",
];

export default function AssistantPage() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <PageTitle title="Assistant IA" subtitle="Votre IA connaît votre offre, vos scénarios et vos statistiques." />
      <Card>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setQ(s)} className="rounded-full border border-line px-3 py-1.5 text-sm text-violet hover:border-magenta hover:text-magenta cursor-pointer">
              {s}
            </button>
          ))}
        </div>
        <Textarea className="mt-4" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Votre question… ou cliquez sur Dicter" />
        <div className="mt-1"><DictateButton onText={(t) => setQ((prev) => joinText(prev, t))} /></div>
        <Button
          className="mt-3"
          disabled={pending || !q.trim()}
          onClick={() => start(async () => { try { setAnswer(await askAssistant(q)); } catch (e) { setAnswer(`Erreur : ${(e as Error).message}`); } })}
        >
          {pending ? "Réflexion…" : "Demander"}
        </Button>
      </Card>
      {answer && (
        <Card className="mt-4">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</div>
        </Card>
      )}
    </>
  );
}
