"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { STATUS_LABELS, STEP_LABELS, type Campaign, type Prospect, type ProspectList } from "@/lib/domain";
import { Badge, Button, Card, Input, Select, Textarea, fmtDate } from "@/components/ui";
import { analyzeProspect, bulkAction, deleteList, importAction, renameList } from "../actions";
import type { ImportItem } from "@/lib/prospects";

// Transforme un tableau (CSV ou Excel) en prospects. La 1re ligne contient les en-têtes.
function rowsToItems(rows: string[][]): ImportItem[] {
  if (rows.length < 2) return [];
  const raw = rows[0].map((h) => String(h ?? "").trim());
  const head = raw.map((h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iUrl = idx(["url", "linkedin", "profil", "profile", "linkedin url", "profile url", "url linkedin", "lien linkedin"]);
  const map = {
    firstName: idx(["prenom", "first name", "firstname"]),
    lastName: idx(["nom", "last name", "lastname"]),
    company: idx(["entreprise", "company", "societe"]),
    headline: idx(["poste", "titre", "title", "headline", "fonction"]),
  };
  const known = new Set([iUrl, ...Object.values(map)]);
  return rows.slice(1).map((r) => {
    const cells = r.map((c) => (c == null ? "" : String(c).trim()));
    const item: ImportItem = { url: iUrl >= 0 ? cells[iUrl] : cells.find((c) => /linkedin\.com\/in\//.test(c)) };
    for (const [k, i] of Object.entries(map)) if (i >= 0 && cells[i]) (item as Record<string, string>)[k] = cells[i];
    // Les autres colonnes deviennent des variables : {{nom_de_colonne}}
    item.custom = Object.fromEntries(raw.map((h, i) => [h, cells[i]]).filter(([h, v], i) => h && v && !known.has(i)));
    return item;
  });
}

function parseCsv(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) {
        out.push(cur);
        cur = "";
      }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

async function readFileRows(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return data.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
  }
  return parseCsv(await file.text());
}

export function ProspectsView({ prospects, campaigns, lists }: { prospects: Prospect[]; campaigns: Campaign[]; lists: ProspectList[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [importList, setImportList] = useState("__new");
  const [newListName, setNewListName] = useState("");
  const [bulkList, setBulkList] = useState(lists[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCampaign, setBulkCampaign] = useState(campaigns[0]?.id ?? "");
  const [urls, setUrls] = useState("");
  const [importCampaign, setImportCampaign] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const countByList = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prospects) if (p.list_id) m.set(p.list_id, (m.get(p.list_id) || 0) + 1);
    return m;
  }, [prospects]);
  const list = prospects.filter(
    (p) =>
      (!status || p.status === status) &&
      (!campaign || p.campaign_id === campaign) &&
      (!listFilter || (listFilter === "__none" ? !p.list_id : p.list_id === listFilter)) &&
      (!q || [p.full_name, p.headline, p.company, p.location].join(" ").toLowerCase().includes(q.toLowerCase()))
  );
  const allChecked = list.length > 0 && list.every((p) => selected.has(p.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 5000);
  };

  const doImport = () =>
    start(async () => {
      let items: ImportItem[] = urls
        .split(/\s+/)
        .filter((u) => /linkedin\.com\/in\//.test(u))
        .map((url) => ({ url }));
      try {
        if (file) items = items.concat(rowsToItems(await readFileRows(file)));
      } catch {
        return flash("Fichier illisible. Utilisez un fichier .csv ou .xlsx avec une ligne d'en-têtes.");
      }
      if (!items.length) return flash("Aucune URL de profil LinkedIn trouvée.");
      const target =
        importList === "__new"
          ? { newName: newListName.trim() || file?.name.replace(/\.(csv|xlsx)$/i, "") || `Import du ${new Date().toLocaleDateString("fr-FR")}`, source: file ? ("fichier" as const) : ("manuel" as const) }
          : importList
            ? { id: importList }
            : {};
      const res = await importAction(items, importCampaign, target);
      setUrls("");
      setNewListName("");
      if (res.listId) setListFilter(res.listId);
      flash(`${res.added} prospect(s) ajouté(s), ${res.skipped} ignoré(s) (doublons ou liens invalides).`);
    });

  const bulk = (action: "start" | "pause" | "resume" | "delete" | "list") => {
    const ids = [...selected];
    if (!ids.length) return flash("Sélectionnez au moins un prospect.");
    if (action === "delete" && !confirm(`Supprimer ${ids.length} prospect(s) ?`)) return;
    if (action === "start") {
      const c = campaignById.get(bulkCampaign);
      if (!c) return flash("Créez d'abord un scénario.");
      if (!confirm(`Lancer « ${c.name} » pour ${ids.length} prospect(s) ? Ceux déjà dans un scénario repartiront de la première étape.`)) return;
    }
    start(async () => {
      await bulkAction(ids, action, bulkCampaign, bulkList);
      if (action === "delete") setSelected(new Set());
      flash(action === "start" ? "Scénario lancé. Pensez à démarrer la prospection dans le menu." : "C'est fait.");
    });
  };

  const currentList = listById.get(listFilter);
  const rename = () => {
    if (!currentList) return;
    const name = prompt("Nouveau nom de la liste", currentList.name);
    if (name?.trim()) start(() => renameList(currentList.id, name));
  };
  const removeList = () => {
    if (!currentList) return;
    const n = countByList.get(currentList.id) || 0;
    if (!confirm(`Supprimer la liste « ${currentList.name} » ?`)) return;
    const withProspects = n > 0 && confirm(`Supprimer aussi ses ${n} prospect(s) ?\nOK = supprimer les prospects, Annuler = les garder sans liste.`);
    start(async () => {
      await deleteList(currentList.id, withProspects);
      setListFilter("");
      flash("Liste supprimée.");
    });
  };

  const analyze = () => {
    const ids = [...selected];
    if (!ids.length) return flash("Sélectionnez au moins un prospect.");
    start(async () => {
      let ok = 0;
      for (const id of ids) {
        try {
          await analyzeProspect(id);
          ok++;
        } catch (e) {
          flash(`Erreur : ${(e as Error).message}`);
          return;
        }
      }
      flash(`${ok} profil(s) analysé(s). L'analyse est plus riche après l'étape « Visiter le profil ».`);
    });
  };

  return (
    <>
      <Card className="mb-4">
        <h2 className="font-semibold text-violet">Importer des prospects</h2>
        <p className="mt-1 text-sm text-muted">
          Le plus rapide : sur LinkedIn, faites une recherche de personnes et cliquez sur le bouton <b>Yucan</b> en bas à droite (extension). Ou collez des URL de profils, ou importez un fichier Excel (.xlsx) ou CSV avec une colonne <code>url</code>. Les autres colonnes deviennent des variables utilisables dans vos messages, par exemple <code>{"{{icebreaker}}"}</code>.
        </p>
        <Textarea className="mt-3" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://www.linkedin.com/in/exemple/" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Select className="sm:w-56" value={importList} onChange={(e) => setImportList(e.target.value)} aria-label="Liste de destination">
            <option value="__new">+ Nouvelle liste</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>Liste : {l.name}</option>
            ))}
            <option value="">Sans liste</option>
          </Select>
          {importList === "__new" && (
            <Input className="sm:w-56" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Nom de la liste (ou nom du fichier)" />
          )}
          <Select className="sm:w-56" value={importCampaign} onChange={(e) => setImportCampaign(e.target.value)} aria-label="Scénario">
            <option value="">Sans scénario</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sm:w-72" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={doImport} disabled={pending}>Importer</Button>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ id: "", name: "Tous les prospects", n: prospects.length }, ...lists.map((l) => ({ id: l.id, name: l.name, n: countByList.get(l.id) || 0 }))].map((l) => (
          <button
            key={l.id || "all"}
            onClick={() => setListFilter(l.id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${listFilter === l.id ? "border-transparent btn-gradient text-white" : "border-line bg-white text-ink hover:border-magenta"}`}
          >
            {l.name} <span className="opacity-70">({l.n})</span>
          </button>
        ))}
        {currentList && (
          <>
            <Button variant="ghost" onClick={rename} disabled={pending}>Renommer</Button>
            <Button variant="ghost" onClick={removeList} disabled={pending}>Supprimer la liste</Button>
          </>
        )}
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Input className="sm:flex-1" placeholder="Rechercher (nom, poste, entreprise…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm:w-52" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Select className="sm:w-56" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">Tous les scénarios</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-sm text-muted">{selected.size} sélectionné(s)</span>
          <Select className="sm:w-56" value={bulkCampaign} onChange={(e) => setBulkCampaign(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Button onClick={() => bulk("start")} disabled={pending}>Lancer ce scénario</Button>
          <Button variant="accent" onClick={analyze} disabled={pending}>Analyser avec l&apos;IA</Button>
          <Button variant="secondary" onClick={() => bulk("pause")} disabled={pending}>Pause</Button>
          <Button variant="secondary" onClick={() => bulk("resume")} disabled={pending}>Reprendre</Button>
          {lists.length > 0 && (
            <>
              <Select className="sm:w-48" value={bulkList} onChange={(e) => setBulkList(e.target.value)} aria-label="Liste">
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
              <Button variant="secondary" onClick={() => bulk("list")} disabled={pending}>Ajouter à la liste</Button>
            </>
          )}
          <Button variant="danger" onClick={() => bulk("delete")} disabled={pending}>Supprimer</Button>
        </div>
        {msg && <p className="mt-3 rounded-xl bg-magenta/10 px-3 py-2 text-sm text-magenta">{msg}</p>}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="p-3">
                <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(list.map((p) => p.id)))} />
              </th>
              <th className="p-3">Prospect</th>
              <th className="p-3">Scénario / étape</th>
              <th className="p-3">Prochaine action</th>
              <th className="p-3">Statut</th>
              <th className="p-3">IA</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const c = p.campaign_id ? campaignById.get(p.campaign_id) : undefined;
              const st = c?.steps[p.step_index];
              return (
                <tr key={p.id} className="border-b border-line align-top last:border-0 hover:bg-surface/60">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="p-3">
                    <Link href={`/prospects/${p.id}`} className="font-semibold text-violet hover:text-magenta">
                      {p.full_name || p.url}
                    </Link>
                    <div className="text-muted">{p.headline}</div>
                    {p.list_id && listById.get(p.list_id) && <div className="mt-1 text-xs text-purple">▸ {listById.get(p.list_id)!.name}</div>}
                  </td>
                  <td className="p-3">
                    {c?.name ?? "—"}
                    <div className="text-muted">{c ? (st ? `${p.step_index + 1}. ${STEP_LABELS[st.type]}` : "Fin") : ""}</div>
                  </td>
                  <td className="p-3">{p.status === "actif" ? fmtDate(p.next_at) : "—"}</td>
                  <td className="p-3">
                    <Badge tone={p.status}>{STATUS_LABELS[p.status]}</Badge>
                    {p.last_error && <div className="mt-1 max-w-56 text-xs text-red-600" title={p.last_error}>⚠ {p.last_error.slice(0, 70)}</div>}
                  </td>
                  <td className="p-3">{p.analysis?.score != null ? <Badge tone="a_valider">{p.analysis.score}/10</Badge> : <span className="text-muted">—</span>}</td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted">Aucun prospect.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
