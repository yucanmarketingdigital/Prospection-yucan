import { createClient } from "@/lib/supabase/server";
import type { Prospect } from "@/lib/domain";
import { Card, PageTitle } from "@/components/ui";
import { ValidateCard } from "./validate-card";

export default async function ValidatePage() {
  const supabase = await createClient();
  const { data } = await supabase.from("prospects").select("*").eq("status", "a_valider").order("updated_at");
  const list = (data || []) as Prospect[];
  return (
    <>
      <PageTitle title="Messages à valider" subtitle="Relisez, ajustez puis approuvez. Le message part à la prochaine action, dans vos limites et horaires." />
      <div className="space-y-4">
        {list.map((p) => (
          <ValidateCard key={p.id} prospect={p} />
        ))}
        {!list.length && <Card className="text-center text-muted">Rien à valider pour le moment. ✓</Card>}
      </div>
    </>
  );
}
