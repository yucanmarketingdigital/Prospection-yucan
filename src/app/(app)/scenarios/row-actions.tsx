"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteCampaign, duplicateCampaign } from "../actions";

export function ScenarioRowActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-3">
      <Link href={`/scenarios/${id}`} className="font-medium text-magenta hover:underline">Modifier</Link>
      <button disabled={pending} className="text-muted hover:text-magenta cursor-pointer" onClick={() => start(() => duplicateCampaign(id))}>Dupliquer</button>
      <button
        disabled={pending}
        className="text-red-600 hover:underline cursor-pointer"
        onClick={() => confirm("Supprimer ce scénario ? Les prospects en cours seront mis en pause.") && start(() => deleteCampaign(id))}
      >
        Supprimer
      </button>
    </div>
  );
}
