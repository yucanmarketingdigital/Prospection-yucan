"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, type Attachment } from "@/lib/domain";

const ICON: Record<string, string> = { image: "🖼", video: "🎬", audio: "🎙", application: "📄" };
const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(n / 1024)} Ko`);

export function AttachmentPicker({ value, onChange }: { value: Attachment[]; onChange: (v: Attachment[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const next = [...value];
    for (const f of Array.from(files)) {
      if (f.size > ATTACHMENT_MAX_BYTES) {
        setError(`« ${f.name} » dépasse 20 Mo, la limite de LinkedIn.`);
        continue;
      }
      const safe = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
      const path = `${data.user!.id}/${crypto.randomUUID()}-${safe}`;
      const { error: err } = await supabase.storage.from("attachments").upload(path, f, { contentType: f.type });
      if (err) setError(`Envoi impossible pour « ${f.name} » : ${err.message}`);
      else next.push({ path, name: f.name, type: f.type || "application/octet-stream", size: f.size });
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  const remove = async (a: Attachment) => {
    onChange(value.filter((x) => x.path !== a.path));
    await createClient().storage.from("attachments").remove([a.path]);
  };

  return (
    <div className="mt-4">
      <div className="text-sm font-semibold">
        Pièces jointes <span className="font-normal text-muted">· image, PDF, vidéo ou audio, 20 Mo max par fichier</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {value.map((a) => (
          <span key={a.path} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm">
            <span>{ICON[a.type.split("/")[0]] ?? "📎"}</span>
            <span className="max-w-48 truncate">{a.name}</span>
            <span className="text-xs text-muted">{sizeLabel(a.size)}</span>
            <button className="text-red-600 cursor-pointer" title="Retirer" onClick={() => remove(a)}>✕</button>
          </span>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-xl border border-dashed border-magenta/50 px-3 py-1.5 text-sm text-magenta hover:bg-magenta/5 disabled:opacity-50 cursor-pointer"
        >
          {busy ? "Envoi…" : "+ Ajouter un fichier"}
        </button>
        <input ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {value.some((a) => a.type.startsWith("audio/")) && (
        <p className="mt-2 text-xs text-muted">
          LinkedIn ne permet d&apos;enregistrer un vrai message vocal que depuis l&apos;application mobile. Ici, l&apos;audio part comme un fichier à écouter. Pour un rendu plus naturel, une courte vidéo fonctionne souvent mieux.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
