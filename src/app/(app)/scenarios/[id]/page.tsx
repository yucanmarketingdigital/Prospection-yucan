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
  const { data: ps } = await supabase.from("prospects").select("full_name,first_name,last_name,company,headline,location,custom,recent_posts,analysis").order("updated_at", { ascending: false }).limit(300);
  const customKeys = [...new Set((ps || []).flatMap((p) => Object.keys(p.custom || {})))].sort();
  // De préférence un prospect déjà visité, pour voir {{dernierpost}} et {{accroche}} remplis.
  const sample = ps?.find((p) => p.full_name && (p.recent_posts?.length || p.analysis?.accroche)) ?? ps?.find((p) => p.full_name) ?? { full_name: "Alexandra Martin", first_name: "Alexandra", last_name: "Martin", company: "Exemple SAS", headline: "Directrice marketing", location: "Lyon", custom: {}, recent_posts: [{ date: "3 j", text: "Recruter un commercial prend 3 mois. Voici comment nous avons divisé ce délai par deux." }], analysis: { accroche: "Votre retour d'expérience sur l'onboarding des commerciaux m'a vraiment parlé." } };
  return <ScenarioEditor campaign={data as Campaign} customKeys={customKeys} sample={sample as Partial<Prospect>} />;
}
