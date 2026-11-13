import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, STEP_LABELS, type Campaign, type Prospect } from "@/lib/domain";
import { Badge, Card, PageTitle, fmtDate } from "@/components/ui";
import { ProspectActions } from "./prospect-actions";

export default async function ProspectPage(props: PageProps<"/prospects/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("prospects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Prospect;
  const { data: c } = p.campaign_id ? await supabase.from("campaigns").select("*").eq("id", p.campaign_id).maybeSingle() : { data: null };
  const campaign = c as Campaign | null;
  const step = campaign?.steps[p.step_index];
  const a = p.analysis;

  return (
    <>
      <Link href="/prospects" className="text-sm text-muted hover:text-magenta">← Prospects</Link>
      <PageTitle title={p.full_name || "Prospect"} subtitle={p.headline}>
        <ProspectActions id={p.id} hasAnalysis={!!a} />
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <a href={p.url} target="_blank" rel="noreferrer" className="break-all text-sm text-magenta hover:underline">{p.url}</a>
          <div className="mt-3 space-y-1 text-sm">
            <div><span className="text-muted">Entreprise :</span> {p.company || "—"}</div>
            <div><span className="text-muted">Lieu :</span> {p.location || "—"}</div>
            <div className="pt-2"><Badge tone={p.status}>{STATUS_LABELS[p.status]}</Badge></div>
            <div className="pt-2"><span className="text-muted">Scénario :</span> {campaign?.name ?? "—"}</div>
            <div><span className="text-muted">Étape :</span> {step ? `${p.step_index + 1}. ${STEP_LABELS[step.type]}` : "—"}</div>
            <div><span className="text-muted">Prochaine action :</span> {p.status === "actif" ? fmtDate(p.next_at) : "—"}</div>
            {p.last_error && <div className="pt-2 text-red-600">⚠ {p.last_error}</div>}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-violet">Analyse IA</h2>
          {a ? (
            <div className="mt-3 space-y-3 text-sm">
              <p>{a.resume}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-yellow px-3 py-1 text-sm font-bold text-violet">{a.score}/10</span>
                <span className="text-muted">Décideur : {a.decideur}</span>
              </div>
              <p className="text-muted">{a.justification_score}</p>
              <div>
                <b>Points d&apos;accroche</b>
                <ul className="ml-5 list-disc">{a.points_accroche?.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              <div>
                <b>Besoins probables</b>
                <ul className="ml-5 list-disc">{a.besoins_probables?.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              {a.accroche && (
                <p className="rounded-xl bg-yellow/25 px-3 py-2 sm:col-span-2"><b>Accroche :</b> {a.accroche}</p>
              )}
              <p><b>Angle recommandé :</b> {a.angle_recommande}</p>
              <p><b>À éviter :</b> {a.a_eviter}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Pas encore analysé. L&apos;analyse se lance automatiquement après la visite du profil, ou avec le bouton ci-dessus.</p>
          )}
        </Card>
        {(p.about || p.experience || p.current_position) && (
          <Card className="lg:col-span-3">
            <h2 className="font-semibold text-violet">Profil LinkedIn</h2>
            {p.current_position && <p className="mt-2 text-sm"><b>Poste actuel :</b> {p.current_position}</p>}
            {p.about && <p className="mt-2 text-sm"><b>À propos :</b> {p.about}</p>}
            {p.experience && <p className="mt-2 text-sm"><b>Expérience :</b> {p.experience}</p>}
          </Card>
        )}
        {p.recent_posts?.length > 0 && (
          <Card className="lg:col-span-3">
            <h2 className="font-semibold text-violet">Derniers posts</h2>
            <div className="mt-2 space-y-3">
              {p.recent_posts.map((x, i) => (
                <div key={i} className="rounded-xl border border-line bg-surface p-3 text-sm">
                  <div className="mb-1 text-xs text-muted">{x.repost ? "Republication" : "Post"}{x.date ? ` · ${x.date}` : ""}</div>
                  <p className="line-clamp-4 whitespace-pre-wrap">{x.text}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card className="lg:col-span-3">
          <h2 className="font-semibold text-violet">Historique</h2>
          <div className="mt-2 divide-y divide-line text-sm">
            {[...(p.history || [])].reverse().map((h, i) => (
              <div key={i} className="py-2"><span className="mr-2 text-muted">{fmtDate(h.t)}</span>{h.text}</div>
            ))}
            {!p.history?.length && <p className="py-2 text-muted">Aucune action pour le moment.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
