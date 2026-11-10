import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, lastDays, localNow, type Campaign, type Prospect, type ProspectStatus, type Settings } from "@/lib/domain";
import { Badge, Card, PageTitle } from "@/components/ui";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

type Row = { name: string; total: number; active: number; invited: number; accepted: number; messaged: number; replied: number; notAccepted: number };

function summarize(name: string, ps: Prospect[]): Row {
  return {
    name,
    total: ps.length,
    active: ps.filter((p) => ["actif", "a_valider"].includes(p.status)).length,
    invited: ps.filter((p) => p.invited_at).length,
    accepted: ps.filter((p) => p.connected_at).length,
    messaged: ps.filter((p) => p.sent_messages?.length).length,
    replied: ps.filter((p) => p.status === "a_repondu" || p.replied_at).length,
    notAccepted: ps.filter((p) => p.status === "non_accepte").length,
  };
}

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: s } = await supabase.from("settings").select("timezone").single();
  const tz = (s as Pick<Settings, "timezone">)?.timezone || "Europe/Paris";
  const days = lastDays(30, tz);
  const [{ data: prospects }, { data: campaigns }, { data: counters }] = await Promise.all([
    supabase.from("prospects").select("status,campaign_id,invited_at,connected_at,replied_at,sent_messages"),
    supabase.from("campaigns").select("id,name").order("created_at"),
    supabase.from("daily_counters").select("*").gte("day", days[days.length - 1]),
  ]);
  const ps = (prospects || []) as Prospect[];
  const rows = [
    ...((campaigns || []) as Campaign[]).map((c) => summarize(c.name, ps.filter((p) => p.campaign_id === c.id))),
    summarize("Sans scénario", ps.filter((p) => !p.campaign_id)),
  ].filter((r) => r.total > 0);
  const total = summarize("Total", ps);

  // 30 derniers jours
  const dayKey = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso)) : "");
  const today = localNow(tz).day;
  const byDay = days.map((d) => {
    const c = (counters || []).find((x) => x.day === d);
    return {
      d,
      visits: c?.visits ?? 0,
      invites: c?.invites ?? 0,
      messages: c?.messages ?? 0,
      accepted: ps.filter((p) => dayKey(p.connected_at) === d).length,
      replied: ps.filter((p) => dayKey(p.replied_at) === d).length,
    };
  });
  const max = Math.max(1, ...byDay.map((r) => r.visits + r.invites + r.messages));
  const statusCounts = (Object.keys(STATUS_LABELS) as ProspectStatus[]).map((st) => [st, ps.filter((p) => p.status === st).length] as const).filter(([, n]) => n);
  const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  const th = "p-3 text-right font-semibold";
  const td = "p-3 text-right tabular-nums";

  return (
    <>
      <PageTitle title="Statistiques" subtitle="Vos résultats par scénario et jour par jour." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Invitations envoyées", v: total.invited },
          { l: "Taux d'acceptation", v: pct(total.accepted, total.invited) },
          { l: "Prospects contactés par message", v: total.messaged },
          { l: "Taux de réponse", v: pct(total.replied, total.messaged) },
        ].map((k, i) => (
          <div key={k.l} className={`rounded-2xl p-5 ${i % 2 ? "yucan-gradient text-white" : "border border-line bg-white"}`}>
            <div className={`text-3xl font-bold ${i % 2 ? "text-yellow" : "text-magenta"}`}>{k.v}</div>
            <div className={`mt-1 text-sm ${i % 2 ? "text-white/85" : "text-muted"}`}>{k.l}</div>
          </div>
        ))}
      </div>

      <Card className="mt-6 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-semibold text-violet">Par scénario</h2>
        <table className="mt-3 w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th className="p-3 text-left font-semibold">Scénario</th>
              <th className={th}>Prospects</th>
              <th className={th}>En cours</th>
              <th className={th}>Invités</th>
              <th className={th}>Acceptés</th>
              <th className={th}>Acceptation</th>
              <th className={th}>Contactés</th>
              <th className={th}>Réponses</th>
              <th className={th}>Taux de réponse</th>
            </tr>
          </thead>
          <tbody>
            {[...rows, total].map((r) => (
              <tr key={r.name} className={`border-b border-line last:border-0 ${r === total ? "bg-surface font-semibold" : ""}`}>
                <td className="p-3 text-violet">{r.name}</td>
                <td className={td}>{r.total}</td>
                <td className={td}>{r.active}</td>
                <td className={td}>{r.invited}</td>
                <td className={td}>{r.accepted}</td>
                <td className={`${td} text-magenta`}>{pct(r.accepted, r.invited)}</td>
                <td className={td}>{r.messaged}</td>
                <td className={td}>{r.replied}</td>
                <td className={`${td} text-magenta`}>{pct(r.replied, r.messaged)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="overflow-x-auto p-0 lg:col-span-2">
          <h2 className="px-5 pt-5 font-semibold text-violet">30 derniers jours</h2>
          <table className="mt-3 w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="p-3 text-left font-semibold">Jour</th>
                <th className={th}>Visites</th>
                <th className={th}>Invit.</th>
                <th className={th}>Messages</th>
                <th className={th}>Accept.</th>
                <th className={th}>Réponses</th>
                <th className="w-32 p-3" />
              </tr>
            </thead>
            <tbody>
              {byDay.map((r) => (
                <tr key={r.d} className={`border-b border-line last:border-0 ${r.d === today ? "bg-yellow/10" : ""}`}>
                  <td className="whitespace-nowrap p-3 capitalize">{fmtDay(r.d)}</td>
                  <td className={td}>{r.visits}</td>
                  <td className={td}>{r.invites}</td>
                  <td className={td}>{r.messages}</td>
                  <td className={td}>{r.accepted}</td>
                  <td className={`${td} font-semibold text-magenta`}>{r.replied}</td>
                  <td className="p-3">
                    <div className="flex h-2 w-24 overflow-hidden rounded-full bg-surface" title={`${r.visits} visites · ${r.invites} invitations · ${r.messages} messages`}>
                      <div className="bg-violet/40" style={{ width: `${(r.visits / max) * 100}%` }} />
                      <div className="bg-magenta" style={{ width: `${(r.invites / max) * 100}%` }} />
                      <div className="bg-yellow" style={{ width: `${(r.messages / max) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-4 px-5 pb-4 text-xs text-muted">
            <span><span className="mr-1 inline-block h-2 w-3 rounded bg-violet/40" />Visites</span>
            <span><span className="mr-1 inline-block h-2 w-3 rounded bg-magenta" />Invitations</span>
            <span><span className="mr-1 inline-block h-2 w-3 rounded bg-yellow" />Messages</span>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold text-violet">Prospects par statut</h2>
          <div className="mt-3 space-y-2">
            {statusCounts.map(([st, n]) => (
              <div key={st} className="flex items-center justify-between gap-2 text-sm">
                <Badge tone={st}>{STATUS_LABELS[st]}</Badge>
                <span className="tabular-nums font-semibold">{n}</span>
              </div>
            ))}
            {!statusCounts.length && <p className="text-sm text-muted">Aucun prospect pour le moment.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
