"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { analyzeProspect, markReplied } from "../../actions";

export function ProspectActions({ id, hasAnalysis }: { id: string; hasAnalysis: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <Button
        variant="accent"
        disabled={pending}
        onClick={() => start(async () => { try { setError(""); await analyzeProspect(id); } catch (e) { setError((e as Error).message); } })}
      >
        {pending ? "Analyse…" : hasAnalysis ? "Refaire l'analyse IA" : "Analyser avec l'IA"}
      </Button>
      <Button variant="secondary" disabled={pending} onClick={() => start(() => markReplied(id))}>Marquer « a répondu »</Button>
      {error && <span className="w-full text-sm text-red-600">{error}</span>}
    </>
  );
}
