"use client";

import { useRef } from "react";
import { VARIABLES, fillTemplate, lastPostLabel, needsAnalysis, type Prospect } from "@/lib/domain";
import { Textarea } from "./ui";
import { DictateButton, joinText } from "./voice";

// Zone de texte avec les variables à insérer en un clic et un aperçu sur un vrai prospect.
export function TemplateField({
  value,
  onChange,
  customKeys,
  sample,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  customKeys: string[];
  sample: Partial<Prospect>;
  maxLength?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (key: string) => {
    const el = ref.current;
    const tag = `{{${key}}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + tag + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + tag.length, start + tag.length);
    });
  };
  const preview = fillTemplate(value, sample);
  const tooLong = maxLength != null && preview.length > maxLength;

  return (
    <div className="mt-2">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <DictateButton onText={(t) => onChange(joinText(value, t))} className="mr-1" />
        <span className="text-xs text-muted">Insérer :</span>
        {VARIABLES.map((v) => (
          <button key={v.key} type="button" title={"hint" in v ? v.hint : undefined} onClick={() => insert(v.key)} className="rounded-full bg-magenta/10 px-2.5 py-1 text-xs font-medium text-magenta hover:bg-magenta/20 cursor-pointer">
            {v.label}
          </button>
        ))}
        {customKeys.map((k) => (
          <button key={k} type="button" onClick={() => insert(k)} className="rounded-full bg-yellow/40 px-2.5 py-1 text-xs font-medium text-violet hover:bg-yellow/60 cursor-pointer" title="Variable issue de votre CSV">
            {k}
          </button>
        ))}
      </div>
      <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value.includes("{{") && (
        <div className="mt-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Aperçu avec {sample.full_name || "un exemple"} {maxLength != null && <span className={tooLong ? "text-red-600" : ""}>· {preview.length}/{maxLength} caractères</span>}
          </div>
          <div className="whitespace-pre-wrap">{preview}</div>
          {needsAnalysis(value) && (!lastPostLabel(sample) || !sample.analysis?.accroche) && (
            <p className="mt-2 text-xs text-muted">
              {"{{dernierpost}}"} et {"{{accroche}}"} se remplissent après l&apos;étape « Visiter le profil » (et l&apos;analyse IA). Placez une visite avant ce message, et gardez la validation activée si un prospect n&apos;a jamais publié.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
