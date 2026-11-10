import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUrl, startPosition, variableKey, type Campaign } from "./domain";

export type ImportItem = {
  url?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  company?: string;
  location?: string;
  custom?: Record<string, string>;
};

// Ajoute des prospects (sans doublon) et les place éventuellement dans un scénario.
export async function importProspects(
  db: SupabaseClient,
  userId: string,
  items: ImportItem[],
  campaignId: string,
  list?: { id?: string; newName?: string; source?: "linkedin" | "fichier" | "manuel" }
) {
  let listId: string | null = null;
  if (list?.id) {
    const { data } = await db.from("lists").select("id").eq("id", list.id).eq("user_id", userId).maybeSingle();
    listId = data?.id ?? null;
  } else if (list?.newName?.trim()) {
    const { data, error } = await db
      .from("lists")
      .insert({ user_id: userId, name: list.newName.trim().slice(0, 120), source: list.source ?? "manuel" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    listId = data.id;
  }
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
      custom: Object.fromEntries(
        Object.entries(it.custom || {})
          .filter(([k, v]) => variableKey(k) && v)
          .slice(0, 30)
          .map(([k, v]) => [variableKey(k), String(v).slice(0, 1000)])
      ),
      list_id: listId,
      ...(campaign ? startPosition(campaign) : {}),
    });
  }
  if (!rows.length) return { added: 0, skipped: items.length, listId };
  const { data, error } = await db.from("prospects").upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(error.message);
  // Les prospects déjà présents sans liste rejoignent aussi la liste choisie.
  if (listId) {
    const urls = rows.map((r) => r.url);
    for (let i = 0; i < urls.length; i += 200)
      await db.from("prospects").update({ list_id: listId }).eq("user_id", userId).is("list_id", null).in("url", urls.slice(i, i + 200));
  }
  const added = data?.length ?? 0;
  return { added, skipped: items.length - added, listId };
}
