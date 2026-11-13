"use client";

import { useEffect, useRef, useState } from "react";

// Ajoute un texte dicté à la suite d'un texte existant.
export function joinText(prev: string, add: string) {
  const t = add.trim();
  if (!t) return prev;
  if (!prev.trim()) return t.charAt(0).toUpperCase() + t.slice(1);
  return prev.replace(/\s*$/, "") + " " + t;
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Bouton micro : on parle, le texte s'écrit dans la case (dictée du navigateur, en français).
export function DictateButton({ onText, className = "" }: { onText: (text: string) => void; className?: string }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- détection du navigateur, uniquement côté client
    setSupported(!!getRecognition());
    return () => rec.current?.stop();
  }, []);

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const r = new R();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) cb.current(e.results[i][0].transcript);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Autorisez le micro pour ce site (icône à gauche de l'adresse)." : "La dictée s'est arrêtée, réessayez.");
    r.onend = () => setListening(false);
    rec.current = r;
    setError("");
    r.start();
    setListening(true);
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={toggle}
        disabled={!supported}
        title={supported ? (listening ? "Arrêter la dictée" : "Dicter au micro") : "La dictée fonctionne dans Chrome et Edge"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
          listening ? "animate-pulse border-red-300 bg-red-50 text-red-600" : "border-line bg-white text-violet hover:border-magenta hover:text-magenta"
        } ${className}`}
      >
        {listening ? "■ J'écoute… cliquez pour arrêter" : "🎤 Dicter"}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}

const AUDIO_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
const MAX_SECONDS = 180;

// Enregistre la voix dans le navigateur, permet de réécouter, puis renvoie un fichier audio.
export function AudioRecorder({ onFile, onCancel }: { onFile: (f: File) => void; onCancel: () => void }) {
  const [state, setState] = useState<"idle" | "rec" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const media = useRef<MediaRecorder | null>(null);
  const file = useRef<File | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      media.current?.stream.getTracks().forEach((t) => t.stop());
    },
    []
  );
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    media.current?.stop();
  };

  const start = async () => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Micro inaccessible : autorisez le micro pour ce site, puis réessayez.");
      return;
    }
    const type = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = (rec.mimeType || type || "audio/webm").split(";")[0];
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      const d = new Date();
      const stamp = `${d.toLocaleDateString("fr-FR").replace(/\//g, "-")}-${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
      file.current = new File(chunks, `message-vocal-${stamp}.${ext}`, { type: mime });
      setUrl(URL.createObjectURL(file.current));
      setState("done");
    };
    media.current = rec;
    rec.start();
    setSeconds(0);
    setState("rec");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  };

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="mt-2 w-full rounded-2xl border border-magenta/30 bg-magenta/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {state === "idle" && (
          <button type="button" onClick={start} className="btn-gradient rounded-xl px-4 py-2 font-medium text-white cursor-pointer">● Commencer l&apos;enregistrement</button>
        )}
        {state === "rec" && (
          <>
            <span className="inline-flex items-center gap-2 font-semibold text-red-600"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> {mmss}</span>
            <button type="button" onClick={stop} className="rounded-xl bg-white px-4 py-2 font-medium text-violet border border-line cursor-pointer">■ Arrêter</button>
            <span className="text-xs text-muted">3 minutes maximum</span>
          </>
        )}
        {state === "done" && (
          <>
            <audio src={url} controls className="h-9 max-w-full" />
            <button type="button" onClick={() => file.current && onFile(file.current)} className="btn-gradient rounded-xl px-4 py-2 font-medium text-white cursor-pointer">Joindre au message</button>
            <button type="button" onClick={() => setState("idle")} className="rounded-xl px-3 py-2 text-violet hover:text-magenta cursor-pointer">Recommencer</button>
          </>
        )}
        <button type="button" onClick={() => { stop(); onCancel(); }} className="ml-auto rounded-xl px-3 py-2 text-muted hover:text-magenta cursor-pointer">Annuler</button>
      </div>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
