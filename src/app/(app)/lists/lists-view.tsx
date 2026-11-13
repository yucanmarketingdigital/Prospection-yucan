"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_LABELS, type Campaign, type ProspectList } from "@/lib/domain";
import { Button, Card, Input, Select } from "@/components/ui";
import { createList, deleteList, exportList, renameList, startListCampaign } from "../actions";

export type ListStats = { total: number; running: number; toValidate: number; replied: number; campaigns: string[] };

const SOURCE: Record<ProspectList["source"], string> = { linkedin: "Recherche LinkedIn", fichier: "Fichier Excel / CSV", manuel: "Ajout manuel" };

function downloadCsv(name: string, rows: Awaited<ReturnType<typeof exportList>>) {
  const customKeys = [...new Set(rows.flatMap((r) => Object.keys(r.custom || {})))];
  const head = ["Prénom", "Nom", "Poste", "Entreprise", "Ville", "URL LinkedIn", "Statut", "Note IA", ...customKeys];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.first_name, r.last_name, r.headline, r.company, r.location, r.url, STATUS_LABELS[r.status], r.analysis?.score ?? "", ...customKeys.map((k) => r.custom?.[k])]
      .map(cell)
      .join(";")
  );
  // Le BOM et le point-virgule permettent à Excel d'ouvrir le fichier avec les accents.
  const blob = new Blob(["﻿" + [head.map(cell).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ListsView({ lists, stats, campaigns }: { lists: ProspectList[]; stats: Record<string, ListStats>; campaigns: Pick<Campaign, "id" | "name">[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const say = (id: string, t: string) => setMsg((m) => ({ ...m, [id]: t }));

  const create = () =>
    start(async () => {
      const id = await createList(newName.trim() || `Liste du ${new Date().toLocaleDateString("fr-FR")}`);
      setNewName("");
      router.push(`/prospects?list=${id}`);
    });

  return (
    <>
      <Card className="mb-5">
        <h2 className="font-semibold text-violet">Nouvelle liste</h2>
        <p className="mt-1 text-sm text-muted">
          Donnez-lui un nom, puis remplissez-la avec un fichier Excel ou CSV, des liens de profils, ou depuis une recherche LinkedIn avec le bouton Yucan.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="sm:max-w-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex. Directeurs commerciaux Lyon" onKeyDown={(e) => e.key === "Enter" && create()} />
          <Button onClick={create} disabled={pending}>Créer et remplir</Button>
        </div>
      </Card>

      {!lists.length && <Card className="text-center text-muted">Aucune liste pour l&apos;instant. Créez-en une ci-dessus ou importez depuis LinkedIn.</Card>}

      <div className="grid gap-4 md:grid-cols-2">
        {lists.map((l) => {
          const s = stats[l.id] ?? { total: 0, running: 0, toValidate: 0, replied: 0, campaigns: [] };
          const camp = chosen[l.id] ?? campaigns[0]?.id ?? "";
          return (
            <Card key={l.id} className="flex flex-col">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {editing === l.id ? (
                    <div className="flex gap-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                      <Button onClick={() => start(async () => { await renameList(l.id, editName || l.name); setEditing(null); })} disabled={pending}>OK</Button>
                    </div>
                  ) : (
                    <Link href={`/prospects?list=${l.id}`} className="font-display text-xl text-violet hover:text-magenta">{l.name}</Link>
                  )}
                  <div className="mt-0.5 text-xs text-muted">
                    {SOURCE[l.source]} · créée le {new Date(l.created_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <span className="rounded-full bg-yellow px-3 py-1 text-sm font-bold text-violet">{s.total}</span>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-surface py-2"><dt className="text-xs text-muted">En cours</dt><dd className="font-semibold text-magenta">{s.running}</dd></div>
                <div className="rounded-xl bg-surface py-2"><dt className="text-xs text-muted">À valider</dt><dd className="font-semibold text-violet">{s.toValidate}</dd></div>
                <div className="rounded-xl bg-surface py-2"><dt className="text-xs text-muted">Ont répondu</dt><dd className="font-semibold text-emerald-700">{s.replied}</dd></div>
              </dl>
              {s.campaigns.length > 0 && (
                <p className="mt-3 text-xs text-muted">Scénario : {s.campaigns.map((id) => campaignName.get(id) ?? "supprimé").join(", ")}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Select className="sm:w-56" value={camp} onChange={(e) => setChosen((c) => ({ ...c, [l.id]: e.target.value }))} aria-label="Scénario">
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <Button
                  disabled={pending || !camp || !s.total}
                  onClick={() =>
                    start(async () => {
                      const r = await startListCampaign(l.id, camp);
                      say(l.id, r.started ? `Scénario lancé pour ${r.started} prospect(s)${r.skipped ? `, ${r.skipped} déjà en cours ou ayant répondu laissé(s) tel(s) quel(s)` : ""}.` : "Tous les prospects de cette liste sont déjà en cours.");
                    })
                  }
                >
                  Lancer sur toute la liste
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Link href={`/prospects?list=${l.id}`} className="rounded-xl px-3 py-2 text-sm text-magenta hover:bg-magenta/5">Ouvrir</Link>
                <Button variant="ghost" disabled={pending || !s.total} onClick={() => start(async () => downloadCsv(l.name, await exportList(l.id)))}>Exporter pour Excel</Button>
                <Button variant="ghost" onClick={() => { setEditing(l.id); setEditName(l.name); }}>Renommer</Button>
                <Button variant="ghost" onClick={() => setDeleting(deleting === l.id ? null : l.id)}>Supprimer</Button>
              </div>
              {deleting === l.id && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="font-medium text-red-700">Supprimer « {l.name} » ?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.total > 0 && (
                      <Button variant="danger" disabled={pending} onClick={() => start(() => deleteList(l.id, true))}>Supprimer aussi ses {s.total} prospect(s)</Button>
                    )}
                    <Button variant="secondary" disabled={pending} onClick={() => start(() => deleteList(l.id, false))}>{s.total > 0 ? "Garder les prospects" : "Supprimer la liste"}</Button>
                    <Button variant="ghost" onClick={() => setDeleting(null)}>Annuler</Button>
                  </div>
                </div>
              )}
              {msg[l.id] && <p className="mt-2 rounded-xl bg-magenta/10 px-3 py-2 text-sm text-magenta">{msg[l.id]}</p>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
