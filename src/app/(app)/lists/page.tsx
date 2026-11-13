import { createClient } from "@/lib/supabase/server";
import type { Campaign, ProspectList } from "@/lib/domain";
import { PageTitle } from "@/components/ui";
import { ListsView, type ListStats } from "./lists-view";

export default async function ListsPage() {
  const supabase = await createClient();
  const [{ data: lists }, { data: prospects }, { data: campaigns }] = await Promise.all([
    supabase.from("lists").select("*").order("created_at", { ascending: false }),
    supabase.from("prospects").select("list_id,status,campaign_id").not("list_id", "is", null).limit(20000),
    supabase.from("campaigns").select("id,name").order("created_at"),
  ]);
  const stats: Record<string, ListStats> = {};
  for (const p of prospects || []) {
    const s = (stats[p.list_id] ??= { total: 0, running: 0, toValidate: 0, replied: 0, campaigns: [] });
    s.total++;
    if (p.status === "actif") s.running++;
    if (p.status === "a_valider") s.toValidate++;
    if (p.status === "a_repondu") s.replied++;
    if (p.campaign_id && !s.campaigns.includes(p.campaign_id)) s.campaigns.push(p.campaign_id);
  }
  return (
    <>
      <PageTitle title="Listes" subtitle="Rangez vos contacts par liste, puis lancez un scénario sur toute une liste." />
      <ListsView lists={(lists || []) as ProspectList[]} stats={stats} campaigns={(campaigns || []) as Pick<Campaign, "id" | "name">[]} />
    </>
  );
}
