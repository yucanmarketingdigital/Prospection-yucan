import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUrl, startPosition, type Campaign } from "./domain";

export type ImportItem = {
  url?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  company?: string;
  location?: string;
};

// Ajoute des prospects (sans doublon) et les place éventuellement dans un scénario.
export async function importProspects(db: SupabaseClient, userId: string, items: ImportItem[], campaignId: string) {
  let campaign: Campaign | null = null;
  if (campaignId) {
    const { data } = await db.from("campaigns").select("*").eq("id", campaignId).eq("user_id", userId).maybeSingle();
    campaign = data as Campaign | null;
  }
  const seen = new Set<string>();
  const rows = [];
  for (const it of items) {
    const url = normalizeUrl(it.url || "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const fullName = String(it.fullName || [it.firstName, it.lastName].filter(Boolean).join(" ")).trim().slice(0, 200);
    rows.push({
      user_id: userId,
      url,
      full_name: fullName,
      first_name: String(it.firstName || fullName.split(" ")[0] || "").slice(0, 100),
      last_name: String(it.lastName || fullName.split(" ").slice(1).join(" ")).slice(0, 100),
      headline: String(it.headline || "").slice(0, 300),
      company: String(it.company || "").slice(0, 200),
      location: String(it.location || "").slice(0, 200),
      ...(campaign ? startPosition(campaign) : {}),
    });
  }
  if (!rows.length) return { added: 0, skipped: items.length };
  const { data, error } = await db.from("prospects").upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(error.message);
  const added = data?.length ?? 0;
  return { added, skipped: items.length - added };
}
