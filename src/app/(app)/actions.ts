"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { analyzeProfile, askStrategy, callAI, generateMessage, parseJson } from "@/lib/ai";
import { hashToken } from "@/lib/engine";
import { importProspects, type ImportItem } from "@/lib/prospects";
import { nextPosition, startPosition, STEP_LABELS, type Campaign, type Prospect, type Settings, type Step } from "@/lib/domain";

async function ctx() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("settings").select("*").eq("user_id", user.id).single();
  return { supabase, user, settings: data as Settings };
}

async function log(text: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("activity_log").insert({ user_id: user.id, text });
}

// ---------- Moteur ----------

export async function toggleEngine() {
  const { supabase, user, settings } = await ctx();
  await supabase.from("settings").update({ paused: !settings.paused }).eq("user_id", user.id);
  await log(settings.paused ? "Prospection démarrée." : "Prospection mise en pause.");
  revalidatePath("/", "layout");
}

export async function runNow() {
  const { supabase, user } = await ctx();
  await supabase.from("settings").update({ force_next: true }).eq("user_id", user.id);
  revalidatePath("/");
}

// ---------- Prospects ----------

export async function importAction(items: ImportItem[], campaignId: string, list: { id?: string; newName?: string; source?: "fichier" | "manuel" }) {
  const { supabase, user } = await ctx();
  const res = await importProspects(supabase, user.id, items, campaignId, list);
  revalidatePath("/prospects");
  return res;
}

export async function bulkAction(ids: string[], action: "start" | "pause" | "resume" | "delete" | "list", campaignId?: string, listId?: string) {
  const { supabase, user } = await ctx();
  if (!ids.length) return;
  if (action === "start") {
    const { data } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
    if (!data) throw new Error("Scénario introuvable.");
    const c = data as Campaign;
    await supabase.from("prospects").update(startPosition(c)).in("id", ids);
    await log(`Scénario « ${c.name} » lancé pour ${ids.length} prospect(s).`);
  } else if (action === "pause") {
    await supabase.from("prospects").update({ status: "pause" }).in("id", ids).eq("status", "actif");
  } else if (action === "resume") {
    await supabase
      .from("prospects")
      .update({ status: "actif", errors: 0, last_error: "", next_at: new Date().toISOString() })
      .in("id", ids)
      .in("status", ["pause", "erreur"])
      .not("campaign_id", "is", null);
  } else if (action === "list") {
    await supabase.from("prospects").update({ list_id: listId || null }).in("id", ids);
  } else if (action === "delete") {
    await supabase.from("prospects").delete().in("id", ids).eq("user_id", user.id);
  }
  revalidatePath("/prospects");
}

export async function analyzeProspect(id: string) {
  const { supabase, settings } = await ctx();
  const { data } = await supabase.from("prospects").select("*").eq("id", id).single();
  const analysis = await analyzeProfile(settings, data as Prospect);
  await supabase.from("prospects").update({ analysis }).eq("id", id);
  revalidatePath(`/prospects/${id}`);
  revalidatePath("/prospects");
  return analysis;
}

export async function markReplied(id: string) {
  const { supabase } = await ctx();
  await supabase.from("prospects").update({ status: "a_repondu", next_at: null, replied_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/prospects/${id}`);
}

export async function createList(name: string) {
  const { supabase, user } = await ctx();
  const { data, error } = await supabase.from("lists").insert({ user_id: user.id, name: name.trim().slice(0, 120) }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/prospects");
  return data.id as string;
}

export async function renameList(id: string, name: string) {
  const { supabase } = await ctx();
  await supabase.from("lists").update({ name: name.trim().slice(0, 120) }).eq("id", id);
  revalidatePath("/prospects");
  revalidatePath("/lists");
}

// Lance un scénario pour tous les prospects d'une liste qui ne sont pas déjà en cours.
export async function startListCampaign(listId: string, campaignId: string) {
  const { supabase, user } = await ctx();
  const { data: c } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
  if (!c) throw new Error("Scénario introuvable.");
  const { data: ps } = await supabase.from("prospects").select("id,status").eq("list_id", listId).eq("user_id", user.id);
  const busy = new Set(["actif", "a_valider", "a_repondu"]);
  const ids = (ps || []).filter((p) => !busy.has(p.status)).map((p) => p.id as string);
  for (let i = 0; i < ids.length; i += 200)
    await supabase.from("prospects").update(startPosition(c as Campaign)).in("id", ids.slice(i, i + 200));
  if (ids.length) await log(`Scénario « ${c.name} » lancé pour ${ids.length} prospect(s) d'une liste.`);
  revalidatePath("/lists");
  revalidatePath("/prospects");
  return { started: ids.length, skipped: (ps?.length || 0) - ids.length };
}

export async function exportList(listId: string) {
  const { supabase } = await ctx();
  const { data } = await supabase
    .from("prospects")
    .select("first_name,last_name,headline,company,location,url,status,custom,analysis")
    .eq("list_id", listId)
    .order("created_at");
  return (data || []) as Pick<Prospect, "first_name" | "last_name" | "headline" | "company" | "location" | "url" | "status" | "custom" | "analysis">[];
}

export async function deleteList(id: string, withProspects: boolean) {
  const { supabase } = await ctx();
  if (withProspects) await supabase.from("prospects").delete().eq("list_id", id);
  await supabase.from("lists").delete().eq("id", id);
  revalidatePath("/prospects");
  revalidatePath("/lists");
}

// ---------- Scénarios ----------

export async function createCampaign() {
  const { supabase, user } = await ctx();
  const { data } = await supabase
    .from("campaigns")
    .insert({
      user_id: user.id,
      name: "Nouveau scénario",
      steps: [{ type: "visit" }, { type: "wait", days: 1 }, { type: "invite", noteMode: "aucune" }, { type: "wait_accept", maxDays: 14 }],
    })
    .select("id")
    .single();
  redirect(`/scenarios/${data!.id}`);
}

export async function saveCampaign(id: string, name: string, steps: Step[]) {
  const { supabase } = await ctx();
  const clean = steps.filter((s) => s.type in STEP_LABELS);
  await supabase.from("campaigns").update({ name: name.trim() || "Sans nom", steps: clean }).eq("id", id);
  revalidatePath("/scenarios");
}

export async function duplicateCampaign(id: string) {
  const { supabase, user } = await ctx();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (data) await supabase.from("campaigns").insert({ user_id: user.id, name: `${data.name} (copie)`, steps: data.steps });
  revalidatePath("/scenarios");
}

export async function deleteCampaign(id: string) {
  const { supabase } = await ctx();
  await supabase.from("prospects").update({ status: "pause" }).eq("campaign_id", id).in("status", ["actif", "a_valider"]);
  await supabase.from("campaigns").delete().eq("id", id);
  revalidatePath("/scenarios");
}

export async function suggestScenario(): Promise<{ name: string; steps: Step[] }> {
  const { settings } = await ctx();
  const text = await callAI(
    settings,
    `Tu es expert en prospection LinkedIn. Offre : ${settings.my_offer}. Cible : ${settings.my_target}. Ton : ${settings.tone}.`,
    `Propose un scénario de prospection LinkedIn efficace et respectueux. Réponds uniquement avec un JSON :
{"name":"...","steps":[...]} où chaque étape est l'une de :
{"type":"visit"} | {"type":"wait","days":N} | {"type":"invite","noteMode":"aucune|ia","aiInstruction":"..."} | {"type":"wait_accept","maxDays":14} | {"type":"message","mode":"ia","approval":true,"aiInstruction":"consigne précise pour ce message"}.
Entre 6 et 12 étapes, avec une étape wait_accept avant le premier message.`
  );
  const json = parseJson<{ name: string; steps: Step[] }>(text);
  const steps = (json.steps || []).filter((s) => s.type in STEP_LABELS);
  if (!steps.length) throw new Error("Scénario proposé illisible.");
  return { name: json.name || "Scénario proposé par l'IA", steps };
}

// ---------- Validation des messages ----------

export async function approveMessage(id: string, text: string) {
  const { supabase } = await ctx();
  const { data } = await supabase.from("prospects").select("pending_message").eq("id", id).single();
  if (!data?.pending_message) return;
  await supabase
    .from("prospects")
    .update({
      status: "actif",
      next_at: new Date().toISOString(),
      approved_message: { text: text.trim(), stepIndex: data.pending_message.stepIndex },
      pending_message: null,
    })
    .eq("id", id);
  revalidatePath("/validate");
}

export async function regenerateMessage(id: string) {
  const { supabase, settings } = await ctx();
  const { data } = await supabase.from("prospects").select("*").eq("id", id).single();
  const p = data as Prospect;
  const { data: c } = await supabase.from("campaigns").select("steps").eq("id", p.campaign_id).single();
  const step = (c?.steps as Step[] | undefined)?.[p.step_index];
  const text = await generateMessage(settings, p, { instruction: step?.aiInstruction || step?.template });
  await supabase.from("prospects").update({ pending_message: { text, stepIndex: p.step_index } }).eq("id", id);
  return text;
}

export async function skipStep(id: string) {
  const { supabase } = await ctx();
  const { data } = await supabase.from("prospects").select("step_index,campaign_id").eq("id", id).single();
  const { data: c } = await supabase.from("campaigns").select("steps").eq("id", data!.campaign_id).single();
  await supabase
    .from("prospects")
    .update({ pending_message: null, ...nextPosition(c!.steps as Step[], data!.step_index + 1) })
    .eq("id", id);
  revalidatePath("/validate");
}

export async function stopProspect(id: string) {
  const { supabase } = await ctx();
  await supabase.from("prospects").update({ status: "pause", pending_message: null }).eq("id", id);
  revalidatePath("/validate");
}

// ---------- Assistant ----------

export async function askAssistant(question: string) {
  const { supabase, settings } = await ctx();
  const { data: ps } = await supabase.from("prospects").select("status,invited_at,connected_at,sent_messages");
  const { data: cs } = await supabase.from("campaigns").select("name,steps");
  const list = (ps || []) as Prospect[];
  const n = (f: (p: Prospect) => boolean) => list.filter(f).length;
  const context = `Offre : ${settings.my_offer || "non renseignée"}
Cible : ${settings.my_target || "non renseignée"}
Prospects : ${list.length}, invités : ${n((p) => !!p.invited_at)}, acceptés : ${n((p) => !!p.connected_at)}, ont reçu un message : ${n((p) => p.sent_messages?.length > 0)}, ont répondu : ${n((p) => p.status === "a_repondu")}, invitations non acceptées : ${n((p) => p.status === "non_accepte")}.
Scénarios : ${(cs || [])
    .map((c) => `${c.name} [${(c.steps as Step[]).map((s) => (s.type === "wait" ? `attente ${s.days} j` : s.type + (s.aiInstruction ? ` (${s.aiInstruction})` : ""))).join(" > ")}]`)
    .join(" ; ")}
Derniers messages envoyés : ${list.flatMap((p) => (p.sent_messages || []).map((m) => m.text)).slice(-5).join(" || ") || "aucun"}`;
  return askStrategy(settings, question, context);
}

// ---------- Réglages ----------

export async function saveSettings(patch: Partial<Settings>) {
  const { supabase, user } = await ctx();
  const allowed: (keyof Settings)[] = [
    "provider", "anthropic_key", "openai_key", "claude_model", "openai_model", "my_name", "my_offer", "my_target", "tone",
    "language", "signature", "limit_invites", "limit_visits", "limit_messages", "hour_start", "hour_end", "days", "gap_min",
    "gap_max", "timezone", "auto_analyze",
  ];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k as keyof Settings)));
  await supabase.from("settings").update(clean).eq("user_id", user.id);
  revalidatePath("/", "layout");
}

export async function testAI(patch: Partial<Settings>) {
  const { settings } = await ctx();
  try {
    const out = await callAI({ ...settings, ...patch }, "Tu réponds en une phrase courte.", "Dis bonjour en français.");
    return { ok: true, text: out.slice(0, 120) };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}

export async function createExtensionToken() {
  const { supabase, user } = await ctx();
  const token = `yuc_${randomBytes(24).toString("base64url")}`;
  await supabase.from("extension_tokens").insert({ user_id: user.id, token_hash: hashToken(token) });
  revalidatePath("/settings");
  return token; // affiché une seule fois
}

export async function revokeExtensionToken(id: string) {
  const { supabase } = await ctx();
  await supabase.from("extension_tokens").delete().eq("id", id);
  revalidatePath("/settings");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}
