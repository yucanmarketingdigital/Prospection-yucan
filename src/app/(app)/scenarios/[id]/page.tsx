import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Campaign, Prospect } from "@/lib/domain";
import { ScenarioEditor } from "./editor";

export default async function ScenarioPage(props: PageProps<"/scenarios/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  // Variables personnalisées connues (colonnes CSV) et un prospect réel pour l'aperçu
  const { data: ps } = await supabase.from("prospects").select("full_name,first_name,last_name,company,headline,location,custom").order("updated_at", { ascending: false }).limit(300);
  const customKeys = [...new Set((ps || []).flatMap((p) => Object.keys(p.custom || {})))].sort();
  const sample = ps?.find((p) => p.full_name) ?? { full_name: "Alexandra Martin", first_name: "Alexandra", last_name: "Martin", company: "Exemple SAS", headline: "Directrice marketing", location: "Lyon", custom: {} };
  return <ScenarioEditor campaign={data as Campaign} customKeys={customKeys} sample={sample as Partial<Prospect>} />;
}
