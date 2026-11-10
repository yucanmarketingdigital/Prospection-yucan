"use client";

import { useState, useTransition } from "react";
import { CLAUDE_MODELS, type Settings } from "@/lib/domain";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { saveSettings, testAI } from "../actions";

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function SettingsForm({ settings }: { settings: Settings }) {
  const [s, setS] = useState(settings);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [test, setTest] = useState("");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  const save = () => {
    if (s.limit_invites > 30 && !confirm("Plus de 30 invitations par jour augmente nettement le risque de restriction du compte. Continuer ?")) return;
    start(async () => {
      await saveSettings({ ...s, gap_max: Math.max(s.gap_min, s.gap_max) });
      setMsg("Réglages enregistrés.");
      setTimeout(() => setMsg(""), 3000);
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="font-semibold text-violet">Intelligence artificielle</h2>
        <Label>Fournisseur</Label>
        <Select value={s.provider} onChange={(e) => set("provider", e.target.value as Settings["provider"])}>
          <option value="claude">Claude (Anthropic)</option>
          <option value="openai">ChatGPT (OpenAI)</option>
        </Select>
        {s.provider === "claude" ? (
          <>
            <Label hint="console.anthropic.com → API Keys">Clé API Claude</Label>
            <Input type="password" value={s.anthropic_key} onChange={(e) => set("anthropic_key", e.target.value.trim())} placeholder="sk-ant-…" />
            <Label>Modèle</Label>
            <Select value={s.claude_model} onChange={(e) => set("claude_model", e.target.value)}>
              {CLAUDE_MODELS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </>
        ) : (
          <>
            <Label hint="platform.openai.com → API keys">Clé API OpenAI</Label>
            <Input type="password" value={s.openai_key} onChange={(e) => set("openai_key", e.target.value.trim())} placeholder="sk-…" />
            <Label hint="nom exact, par ex. gpt-4o">Modèle</Label>
            <Input value={s.openai_model} onChange={(e) => set("openai_model", e.target.value)} />
          </>
        )}
        <p className="mt-2 text-xs text-muted">Il faut une clé API facturée à l&apos;usage. Les abonnements Claude Pro et ChatGPT Plus ne fonctionnent pas dans une application.</p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-magenta" checked={s.auto_analyze} onChange={(e) => set("auto_analyze", e.target.checked)} />
          Analyser automatiquement chaque profil visité
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={pending} onClick={() => start(async () => { setTest("Test en cours…"); const r = await testAI(s); setTest(`${r.ok ? "✅" : "❌"} ${r.text}`); })}>
            Tester la connexion
          </Button>
          <span className="text-sm text-muted">{test}</span>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-violet">Votre activité (utilisée par l&apos;IA)</h2>
        <Label>Votre nom</Label>
        <Input value={s.my_name} onChange={(e) => set("my_name", e.target.value)} />
        <Label hint="ce que vous vendez, à qui, le résultat obtenu">Votre offre</Label>
        <Textarea value={s.my_offer} onChange={(e) => set("my_offer", e.target.value)} />
        <Label hint="postes, secteurs, taille, zone">Votre cible idéale</Label>
        <Textarea value={s.my_target} onChange={(e) => set("my_target", e.target.value)} />
        <Label>Ton des messages</Label>
        <Input value={s.tone} onChange={(e) => set("tone", e.target.value)} />
        <div className="grid gap-x-3 sm:grid-cols-2">
          <div>
            <Label>Langue</Label>
            <Input value={s.language} onChange={(e) => set("language", e.target.value)} />
          </div>
          <div>
            <Label>Signature (facultatif)</Label>
            <Input value={s.signature} onChange={(e) => set("signature", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="font-semibold text-violet">Limites et horaires</h2>
        <p className="mt-1 text-sm text-muted">
          LinkedIn interdit l&apos;automatisation. Pour limiter le risque, restez sous 20 à 25 invitations, 50 à 80 visites et 30 à 50 messages par jour, et montez progressivement.
        </p>
        <div className="grid gap-x-4 sm:grid-cols-3 lg:grid-cols-6">
          <div><Label>Invitations / jour</Label><Input type="number" min={0} max={100} value={s.limit_invites} onChange={num("limit_invites")} /></div>
          <div><Label>Visites / jour</Label><Input type="number" min={0} max={250} value={s.limit_visits} onChange={num("limit_visits")} /></div>
          <div><Label>Messages / jour</Label><Input type="number" min={0} max={150} value={s.limit_messages} onChange={num("limit_messages")} /></div>
          <div><Label>Début (h)</Label><Input type="number" min={0} max={23} value={s.hour_start} onChange={num("hour_start")} /></div>
          <div><Label>Fin (h)</Label><Input type="number" min={1} max={24} value={s.hour_end} onChange={num("hour_end")} /></div>
          <div><Label>Pause (min)</Label>
            <div className="flex items-center gap-1"><Input type="number" min={1} value={s.gap_min} onChange={num("gap_min")} />à<Input type="number" min={1} value={s.gap_max} onChange={num("gap_max")} /></div>
          </div>
        </div>
        <Label>Jours actifs</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = s.days.includes(i);
            return (
              <button
                key={d}
                onClick={() => set("days", on ? s.days.filter((x) => x !== i) : [...s.days, i].sort())}
                className={`rounded-full px-3 py-1.5 text-sm cursor-pointer ${on ? "btn-gradient text-white" : "border border-line text-muted"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <Label>Fuseau horaire</Label>
        <Input className="sm:max-w-xs" value={s.timezone} onChange={(e) => set("timezone", e.target.value)} />
      </Card>

      <div className="flex items-center gap-3 lg:col-span-2">
        <Button onClick={save} disabled={pending}>Enregistrer les réglages</Button>
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
      </div>
    </div>
  );
}
