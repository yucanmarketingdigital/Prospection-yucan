import { createClient } from "@/lib/supabase/server";
import type { Settings } from "@/lib/domain";
import { PageTitle } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { ExtensionSection } from "./extension-section";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: s }, { data: tokens }] = await Promise.all([
    supabase.from("settings").select("*").single(),
    supabase.from("extension_tokens").select("id,label,created_at,last_used_at").order("created_at"),
  ]);
  return (
    <>
      <PageTitle title="Réglages" subtitle="Votre IA, votre activité, vos limites et l'extension Chrome." />
      <SettingsForm settings={s as Settings} />
      <ExtensionSection tokens={tokens || []} />
    </>
  );
}
