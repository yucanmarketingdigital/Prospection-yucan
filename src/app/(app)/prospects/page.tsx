import { createClient } from "@/lib/supabase/server";
import type { Campaign, Prospect } from "@/lib/domain";
import { PageTitle } from "@/components/ui";
import { ProspectsView } from "./prospects-view";

export default async function ProspectsPage() {
  const supabase = await createClient();
  const [{ data: prospects }, { data: campaigns }] = await Promise.all([
    supabase
      .from("prospects")
      .select("id,url,full_name,headline,company,location,status,campaign_id,step_index,next_at,last_error,analysis")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("campaigns").select("id,name,steps").order("created_at"),
  ]);
  return (
    <>
      <PageTitle title="Prospects" subtitle="Importez, filtrez et lancez vos scénarios." />
      <ProspectsView prospects={(prospects || []) as Prospect[]} campaigns={(campaigns || []) as Campaign[]} />
    </>
  );
}
