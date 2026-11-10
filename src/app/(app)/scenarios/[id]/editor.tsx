"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STEP_LABELS, fillTemplate, type Campaign, type Step, type StepType } from "@/lib/domain";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { saveCampaign, suggestScenario } from "../../actions";

const DEFAULTS: Record<StepType, Step> = {
  visit: { type: "visit" },
  wait: { type: "wait", days: 1 },
  invite: { type: "invite", noteMode: "aucune" },
  wait_accept: { type: "wait_accept", maxDays: 14 },
  message: { type: "message", mode: "ia", approval: true, aiInstruction: "" },
};
const VARS = "{{prenom}} {{nom}} {{entreprise}} {{poste}} {{ville}}";

export function ScenarioEditor({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [steps, setSteps] = useState<Step[]>(campaign.steps);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const update = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  const save = () => {
    const problems: string[] = [];
    const firstMsg = steps.findIndex((s) => s.type === "message");
    const firstInvite = steps.findIndex((s) => s.type === "invite");
    if (firstMsg >= 0 && firstInvite >= 0 && firstMsg > firstInvite && !steps.slice(firstInvite, firstMsg).some((s) => s.type === "wait_accept"))
      problems.push("Ajoutez une étape « Attendre l'acceptation » entre l'invitation et le premier message.");
    const sample = { first_name: "Alexandra", last_name: "Dupont-Martin", company: "Entreprise exemple", headline: "", location: "" };
    if (steps.some((s) => s.type === "invite" && s.noteMode === "modele" && fillTemplate(s.template, sample).length > 300))
      problems.push("Une note d'invitation dépasse 300 caractères.");
    if (problems.length && !confirm(`${problems.join("\n")}\n\nEnregistrer quand même ?`)) return;
    start(async () => {
      await saveCampaign(campaign.id, name, steps);
      router.push("/scenarios");
    });
  };

  const suggest = () =>
    start(async () => {
      try {
        const s = await suggestScenario();
        setName(s.name);
        setSteps(s.steps);
        setMsg("Scénario proposé par l'IA : relisez-le puis enregistrez.");
      } catch (e) {
        setMsg((e as Error).message);
      }
    });

  return (
    <>
      <Link href="/scenarios" className="text-sm text-muted hover:text-magenta">← Scénarios</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="font-display !text-2xl text-violet sm:max-w-xl" />
        <div className="flex gap-2">
          <Button variant="accent" onClick={suggest} disabled={pending}>✦ Suggérer avec l&apos;IA</Button>
          <Button onClick={save} disabled={pending}>Enregistrer</Button>
        </div>
      </div>
      {msg && <p className="mb-4 rounded-xl bg-magenta/10 px-3 py-2 text-sm text-magenta">{msg}</p>}

      <div className="relative space-y-3 before:absolute before:bottom-6 before:left-[22px] before:top-6 before:w-0.5 before:bg-line">
        {steps.map((s, i) => (
          <div key={i} className="relative flex gap-4">
            <div className={`z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ${s.type === "wait" ? "bg-yellow text-violet" : "btn-gradient text-white"}`}>
              {s.type === "wait" ? "⏱" : i + 1}
            </div>
            <Card className={`flex-1 ${s.type === "wait" ? "border-dashed bg-transparent shadow-none" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-violet">{STEP_LABELS[s.type]}</span>
                <div className="ml-auto flex gap-1 text-muted">
                  <button className="rounded-lg px-2 hover:bg-surface cursor-pointer" onClick={() => move(i, -1)} title="Monter">↑</button>
                  <button className="rounded-lg px-2 hover:bg-surface cursor-pointer" onClick={() => move(i, 1)} title="Descendre">↓</button>
                  <button className="rounded-lg px-2 text-red-600 hover:bg-red-50 cursor-pointer" onClick={() => setSteps(steps.filter((_, j) => j !== i))} title="Supprimer">✕</button>
                </div>
              </div>
              <StepFields step={s} onChange={(patch) => update(i, patch)} />
            </Card>
          </div>
        ))}
      </div>

      <Card className="mt-6">
        <div className="text-sm font-semibold text-violet">Ajouter une étape</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(STEP_LABELS) as StepType[]).map((t) => (
            <Button key={t} variant={t === "wait" ? "accent" : "secondary"} onClick={() => setSteps([...steps, { ...DEFAULTS[t] }])}>
              + {STEP_LABELS[t]}
            </Button>
          ))}
        </div>
      </Card>
    </>
  );
}

function StepFields({ step: s, onChange }: { step: Step; onChange: (p: Partial<Step>) => void }) {
  if (s.type === "wait")
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        Attendre
        <Input type="number" min={0} step={0.5} className="!w-24" value={s.days ?? 1} onChange={(e) => onChange({ days: Number(e.target.value) })} />
        jour(s) avant l&apos;étape suivante
      </div>
    );
  if (s.type === "visit")
    return <p className="mt-2 text-sm text-muted">Ouvre le profil, lit ses informations et lance l&apos;analyse IA. La personne voit votre visite.</p>;
  if (s.type === "wait_accept")
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        Vérifier chaque jour, abandonner après
        <Input type="number" min={1} className="!w-24" value={s.maxDays ?? 14} onChange={(e) => onChange({ maxDays: Number(e.target.value) })} />
        jour(s)
      </div>
    );
  if (s.type === "invite")
    return (
      <>
        <Label>Note d&apos;invitation</Label>
        <Select value={s.noteMode ?? "aucune"} onChange={(e) => onChange({ noteMode: e.target.value as Step["noteMode"] })}>
          <option value="aucune">Sans note (recommandé avec un compte gratuit)</option>
          <option value="modele">Note à partir d&apos;un modèle</option>
          <option value="ia">Note rédigée par l&apos;IA</option>
        </Select>
        {s.noteMode === "modele" && (
          <>
            <Label hint={`300 caractères max · ${VARS}`}>Modèle</Label>
            <Textarea value={s.template ?? ""} onChange={(e) => onChange({ template: e.target.value })} placeholder="Bonjour {{prenom}}, …" />
          </>
        )}
        {s.noteMode === "ia" && (
          <>
            <Label>Consigne pour l&apos;IA</Label>
            <Textarea value={s.aiInstruction ?? ""} onChange={(e) => onChange({ aiInstruction: e.target.value })} placeholder="Ex. : mentionne un point commun et explique pourquoi je souhaite me connecter." />
          </>
        )}
      </>
    );
  return (
    <>
      <p className="mt-1 text-xs text-muted">Relations de 1er niveau uniquement. Le scénario s&apos;arrête si la personne a répondu.</p>
      <Label>Contenu</Label>
      <Select value={s.mode ?? "ia"} onChange={(e) => onChange({ mode: e.target.value as Step["mode"] })}>
        <option value="ia">Rédigé par l&apos;IA à partir de l&apos;analyse du profil</option>
        <option value="modele">Modèle avec variables</option>
      </Select>
      {s.mode === "modele" ? (
        <>
          <Label hint={VARS}>Modèle</Label>
          <Textarea value={s.template ?? ""} onChange={(e) => onChange({ template: e.target.value })} placeholder="Bonjour {{prenom}}, …" />
        </>
      ) : (
        <>
          <Label>Consigne pour l&apos;IA</Label>
          <Textarea value={s.aiInstruction ?? ""} onChange={(e) => onChange({ aiInstruction: e.target.value })} placeholder="Ex. : remercie pour la connexion, rebondis sur son poste actuel et pose une question ouverte." />
        </>
      )}
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!s.approval} onChange={(e) => onChange({ approval: e.target.checked })} className="accent-magenta" />
        Je veux relire et valider chaque message avant l&apos;envoi
      </label>
    </>
  );
}
