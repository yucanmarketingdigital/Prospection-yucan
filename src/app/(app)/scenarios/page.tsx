import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STEP_LABELS, type Campaign } from "@/lib/domain";
import { Button, Card, PageTitle } from "@/components/ui";
import { createCampaign } from "../actions";
import { ScenarioRowActions } from "./row-actions";

export default async function ScenariosPage() {
  const supabase = await createClient();
  const [{ data: campaigns }, { data: prospects }] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at"),
    supabase.from("prospects").select("campaign_id,status"),
  ]);
  return (
    <>
      <PageTitle title="Scénarios" subtitle="Enchaînez visites, invitations, attentes et messages.">
        <form action={createCampaign}>
          <Button>+ Nouveau scénario</Button>
        </form>
      </PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {((campaigns || []) as Campaign[]).map((c) => {
          const inside = (prospects || []).filter((p) => p.campaign_id === c.id);
          return (
            <Card key={c.id} className="flex flex-col">
              <Link href={`/scenarios/${c.id}`} className="font-display text-xl text-violet hover:text-magenta">{c.name}</Link>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {c.steps.map((s, i) => (
                  <span key={i} className={`rounded-full px-2 py-1 ${s.type === "wait" ? "bg-yellow/30 text-violet" : "bg-magenta/10 text-magenta"}`}>
                    {s.type === "wait" ? `⏱ ${s.days} j` : STEP_LABELS[s.type]}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                <span className="text-muted">
                  {inside.length} prospect(s) · {inside.filter((p) => p.status === "actif").length} en cours
                </span>
                <ScenarioRowActions id={c.id} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
