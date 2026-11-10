import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { localNow, type Prospect, type Settings } from "@/lib/domain";
import { Card, PageTitle, fmtDate } from "@/components/ui";
import { RunNowButton } from "@/components/run-now";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: s } = await supabase.from("settings").select("*").single();
  const settings = s as Settings;
  const day = localNow(settings.timezone).day;
  const [{ data: counters }, { data: prospects }, { data: log }] = await Promise.all([
    supabase.from("daily_counters").select("*").eq("day", day).maybeSingle(),
    supabase.from("prospects").select("status,invited_at,connected_at,sent_messages"),
    supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(40),
  ]);
  const ps = (prospects || []) as Prospect[];
  const n = (f: (p: Prospect) => boolean) => ps.filter(f).length;
  const invited = n((p) => !!p.invited_at);
  const accepted = n((p) => !!p.connected_at);
  const messaged = n((p) => p.sent_messages?.length > 0);
  const replied = n((p) => p.status === "a_repondu");
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

  const warnings: { text: string; href: string }[] = [];
  if (!settings.anthropic_key && !settings.openai_key) warnings.push({ text: "Ajoutez votre clé API Claude ou ChatGPT pour activer l'analyse de profil et les messages IA.", href: "/settings" });
  if (!settings.my_offer) warnings.push({ text: "Décrivez votre offre et votre cible : l'IA s'en sert pour personnaliser chaque message.", href: "/settings" });
  if (!settings.extension_seen_at) warnings.push({ text: "Installez et reliez l'extension Chrome : c'est elle qui exécute les actions sur LinkedIn.", href: "/settings#extension" });
  if (!ps.length) warnings.push({ text: "Importez vos premiers prospects depuis une recherche LinkedIn ou une liste.", href: "/prospects" });

  const quotas = [
    { label: "Invitations", n: counters?.invites ?? 0, max: settings.limit_invites },
    { label: "Visites", n: counters?.visits ?? 0, max: settings.limit_visits },
    { label: "Messages", n: counters?.messages ?? 0, max: settings.limit_messages },
  ];

  return (
    <>
      <PageTitle title={`Bonjour${settings.my_name ? ` ${settings.my_name.split(" ")[0]}` : ""}`} subtitle="Votre prospection du jour en un coup d'œil.">
        <RunNowButton />
      </PageTitle>

      {warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {warnings.map((w) => (
            <Link key={w.text} href={w.href} className="flex items-center gap-3 rounded-2xl border border-yellow/60 bg-yellow/15 px-4 py-3 text-sm text-violet hover:bg-yellow/25">
              <span className="text-lg">★</span>
              {w.text}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {quotas.map((q) => (
          <Card key={q.label}>
            <div className="text-sm text-muted">{q.label} aujourd&apos;hui</div>
            <div className="mt-1 text-3xl font-bold text-violet">
              {q.n} <span className="text-base font-medium text-muted">/ {q.max}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
              <div className="btn-gradient h-full rounded-full" style={{ width: `${Math.min(100, (q.n / Math.max(1, q.max)) * 100)}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Prospects", value: ps.length },
          { label: "En cours de scénario", value: n((p) => p.status === "actif") },
          { label: `Taux d'acceptation (${accepted}/${invited})`, value: pct(accepted, invited) },
          { label: `Taux de réponse (${replied}/${messaged})`, value: pct(replied, messaged) },
        ].map((k, i) => (
          <div key={k.label} className={`rounded-2xl p-5 ${i === 3 ? "yucan-gradient text-white" : "border border-line bg-white"}`}>
            <div className={`text-3xl font-bold ${i === 3 ? "text-yellow" : "text-magenta"}`}>{k.value}</div>
            <div className={`mt-1 text-sm ${i === 3 ? "text-white/85" : "text-muted"}`}>{k.label}</div>
          </div>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-violet">Journal d&apos;activité</h2>
        <div className="max-h-96 divide-y divide-line overflow-auto text-sm">
          {(log || []).map((l) => (
            <div key={l.id} className={`py-2 ${l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-amber-700" : ""}`}>
              <span className="mr-2 text-muted">{fmtDate(l.created_at)}</span>
              {l.text}
            </div>
          ))}
          {!log?.length && <p className="py-2 text-muted">Rien pour le moment.</p>}
        </div>
      </Card>
    </>
  );
}
