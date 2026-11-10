import { createClient } from "@/lib/supabase/server";
import { defaultSteps, isRecent, type Settings } from "@/lib/domain";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;
  let { data: settings } = await supabase.from("settings").select("*").eq("user_id", userId).maybeSingle();
  if (!settings) {
    ({ data: settings } = await supabase.from("settings").insert({ user_id: userId }).select("*").single());
  }
  const { count: campaignCount } = await supabase.from("campaigns").select("id", { count: "exact", head: true });
  if (!campaignCount) {
    await supabase.from("campaigns").insert({ user_id: userId, name: "Scénario type : connexion + 3 messages", steps: defaultSteps() });
  }
  const { count: toValidate } = await supabase.from("prospects").select("id", { count: "exact", head: true }).eq("status", "a_valider");
  const s = settings as Settings;
  const extensionOnline = isRecent(s.extension_seen_at, 3 * 60 * 1000);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar paused={s.paused} toValidate={toValidate ?? 0} extensionOnline={extensionOnline} email={auth.user!.email ?? ""} />
      <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
