"use client";

import { useState, useTransition } from "react";
import { Button, Card, fmtDate } from "@/components/ui";
import { createExtensionToken, revokeExtensionToken } from "../actions";

type Token = { id: string; label: string; created_at: string; last_used_at: string | null };

export function ExtensionSection({ tokens }: { tokens: Token[] }) {
  const [token, setToken] = useState("");
  const [pending, start] = useTransition();
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Card className="mt-4" >
      <div id="extension" className="scroll-mt-6" />
      <h2 className="font-semibold text-violet">Extension Chrome</h2>
      <p className="mt-1 text-sm text-muted">
        L&apos;extension exécute les actions LinkedIn (visites, invitations, messages) depuis votre navigateur, dans votre session LinkedIn. Votre mot de passe LinkedIn n&apos;est jamais demandé.
      </p>
      <ol className="mt-3 ml-5 list-decimal space-y-1 text-sm">
        <li>
          <a href="/yucan-extension.zip" className="font-medium text-magenta hover:underline">Téléchargez l&apos;extension</a>, décompressez-la, puis dans Chrome ouvrez <code>chrome://extensions</code>, activez le mode développeur et cliquez sur « Charger l&apos;extension non empaquetée ».
        </li>
        <li>Générez une clé de connexion ci-dessous.</li>
        <li>Cliquez sur l&apos;icône Yucan dans Chrome, collez l&apos;adresse de l&apos;application et la clé.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={() => start(async () => setToken(await createExtensionToken()))}>Générer une clé de connexion</Button>
      </div>
      {token && (
        <div className="mt-4 rounded-xl border border-yellow bg-yellow/15 p-4 text-sm">
          <div className="font-semibold text-violet">Copiez ces informations maintenant : la clé ne sera plus affichée.</div>
          <div className="mt-2">Adresse de l&apos;application : <code className="select-all">{appUrl}</code></div>
          <div className="mt-1 break-all">Clé : <code className="select-all">{token}</code></div>
        </div>
      )}
      {tokens.length > 0 && (
        <div className="mt-4 divide-y divide-line text-sm">
          {tokens.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {t.label} · créée le {fmtDate(t.created_at)} · dernière utilisation : {fmtDate(t.last_used_at)}
              </span>
              <button className="text-red-600 hover:underline cursor-pointer" disabled={pending} onClick={() => start(() => revokeExtensionToken(t.id))}>
                Révoquer
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
