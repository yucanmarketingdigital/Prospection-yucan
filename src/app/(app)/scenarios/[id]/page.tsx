import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/domain";
import { ScenarioEditor } from "./editor";

export default async function ScenarioPage(props: PageProps<"/scenarios/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <ScenarioEditor campaign={data as Campaign} />;
}
