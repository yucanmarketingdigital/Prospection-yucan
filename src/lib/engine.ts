import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { analyzeProfile, generateMessage, hasAIKey } from "./ai";
import { DAY_MS, fillTemplate, localNow, nextPosition, type Campaign, type Prospect, type Settings, type Step } from "./domain";

// Le moteur de prospection vit côté serveur. L'extension Chrome lui demande
// « quelle est la prochaine action ? », l'exécute dans LinkedIn, puis renvoie le résultat.

type Command = "scrapeProfile" | "connect" | "checkConnection" | "sendMessage";
export type ExtensionAction = {
  prospectId: string;
  stepIndex: number;
  command: Command;
  url: string;
  payload: Record<string, unknown>;
};

const QUOTA: Partial<Record<Step["type"], "visits" | "invites" | "messages">> = {
  visit: "visits",
  wait_accept: "visits",
  invite: "invites",
  message: "messages",
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function authExtension(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const db = createAdminClient();
  const { data } = await db.from("extension_tokens").select("id,user_id").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data) return null;
  await db.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { db, userId: data.user_id as string };
}

async function log(db: SupabaseClient, userId: string, text: string, level: "info" | "warn" | "error" = "info") {
  await db.from("activity_log").insert({ user_id: userId, text, level });
}

function historyAdd(p: Prospect, text: string) {
  return [...(p.history || []), { t: new Date().toISOString(), text }].slice(-50);
}

async function getSettings(db: SupabaseClient, userId: string): Promise<Settings> {
  const { data } = await db.from("settings").select("*").eq("user_id", userId).single();
  return data as Settings;
}

export async function nextAction(
  db: SupabaseClient,
  userId: string,
  opts: { force?: boolean } = {}
): Promise<{ action?: ExtensionAction; wait?: string }> {
  const settings = await getSettings(db, userId);
  const nowIso = new Date().toISOString();
  await db.from("settings").update({ extension_seen_at: nowIso }).eq("user_id", userId);

  const force = settings.force_next || !!opts.force;
  const local = localNow(settings.timezone);
  if (!force) {
    if (settings.paused) return { wait: "Prospection en pause." };
    if (!settings.days.includes(local.weekday) || local.hour < settings.hour_start || local.hour >= settings.hour_end)
      return { wait: "En dehors des horaires de travail." };
    if (settings.next_action_at && Date.now() < new Date(settings.next_action_at).getTime()) return { wait: "Pause entre deux actions." };
  }

  const { data: counters } = await db.from("daily_counters").select("*").eq("user_id", userId).eq("day", local.day).maybeSingle();
  const used = { invites: counters?.invites ?? 0, visits: counters?.visits ?? 0, messages: counters?.messages ?? 0 };
  const limits = { invites: settings.limit_invites, visits: settings.limit_visits, messages: settings.limit_messages };

  const { data: due } = await db
    .from("prospects")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "actif")
    .lte("next_at", nowIso)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .order("next_at", { ascending: true })
    .limit(30);
  if (!due?.length) {
    if (force) await db.from("settings").update({ force_next: false }).eq("user_id", userId);
    return { wait: "Aucune action à faire pour le moment." };
  }

  const { data: campaignRows } = await db.from("campaigns").select("*").eq("user_id", userId);
  const campaigns = new Map((campaignRows as Campaign[] | null)?.map((c) => [c.id, c]) ?? []);

  for (const p of due as Prospect[]) {
    const campaign = p.campaign_id ? campaigns.get(p.campaign_id) : undefined;
    if (!campaign) {
      await db.from("prospects").update({ status: "erreur", last_error: "Scénario supprimé." }).eq("id", p.id);
      continue;
    }
    const step = campaign.steps[p.step_index];
    if (!step) {
      await db.from("prospects").update({ status: "termine", next_at: null }).eq("id", p.id);
      continue;
    }
    if (step.type === "wait") {
      await db.from("prospects").update(nextPosition(campaign.steps, p.step_index)).eq("id", p.id);
      continue;
    }
    const quota = QUOTA[step.type];
    if (quota && used[quota] >= limits[quota]) continue;

    let payload: Record<string, unknown> = {};
    let command: Command;
    try {
      if (step.type === "visit") command = "scrapeProfile";
      else if (step.type === "wait_accept") command = "checkConnection";
      else if (step.type === "invite") {
        command = "connect";
        let note = "";
        if (step.noteMode === "modele") note = fillTemplate(step.template, p).slice(0, 300);
        if (step.noteMode === "ia") note = await generateMessage(settings, p, { instruction: step.aiInstruction, kind: "invitation" });
        payload = { note };
      } else {
        command = "sendMessage";
        let text = p.approved_message && p.approved_message.stepIndex === p.step_index ? p.approved_message.text : null;
        if (!text) {
          text = step.mode === "ia" ? await generateMessage(settings, p, { instruction: step.aiInstruction }) : fillTemplate(step.template, p);
          if (step.approval) {
            await db
              .from("prospects")
              .update({ status: "a_valider", pending_message: { text, stepIndex: p.step_index } })
              .eq("id", p.id);
            await log(db, userId, `Message prêt à valider pour ${p.full_name || p.url}.`);
            continue;
          }
        }
        payload = { text, fullName: p.full_name, attachments: await signAttachments(db, step) };
      }
    } catch (e) {
      await registerError(db, userId, p, (e as Error).message);
      continue;
    }

    await db
      .from("prospects")
      .update({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
      .eq("id", p.id);
    if (force) await db.from("settings").update({ force_next: false }).eq("user_id", userId);
    return { action: { prospectId: p.id, stepIndex: p.step_index, command, url: p.url, payload } };
  }
  if (force) await db.from("settings").update({ force_next: false }).eq("user_id", userId);
  return { wait: "Aucune action possible (limites du jour atteintes ou messages à valider)." };
}

// Liens temporaires (15 min) pour que l'extension télécharge les pièces jointes.
async function signAttachments(db: SupabaseClient, step: Step) {
  const out: { url: string; name: string; type: string }[] = [];
  for (const a of step.attachments || []) {
    const { data, error } = await db.storage.from("attachments").createSignedUrl(a.path, 15 * 60);
    if (error || !data) throw new Error(`Pièce jointe introuvable : ${a.name}`);
    out.push({ url: data.signedUrl, name: a.name, type: a.type });
  }
  return out;
}

async function registerError(db: SupabaseClient, userId: string, p: Prospect, message: string) {
  const errors = (p.errors || 0) + 1;
  await db
    .from("prospects")
    .update({
      errors,
      last_error: message,
      locked_until: null,
      ...(errors >= 3 ? { status: "erreur", next_at: null } : { next_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
    })
    .eq("id", p.id);
  await log(db, userId, `Erreur pour ${p.full_name || p.url} : ${message}${errors >= 3 ? " (prospect mis en erreur)" : " (nouvel essai dans 1 h)"}`, "error");
}

type ScrapedProfile = Partial<{
  fullName: string;
  firstName: string;
  lastName: string;
  headline: string;
  company: string;
  location: string;
  about: string;
  experience: string;
  education: string;
}>;

export type ActionResult = {
  status?: "sent" | "pending" | "already_connected" | "replied" | "error";
  connected?: boolean;
  error?: string;
  fatal?: boolean;
  sentText?: string; // texte réellement envoyé, renvoyé par l'extension
  profile?: ScrapedProfile;
};

function profileColumns(profile?: ScrapedProfile) {
  if (!profile?.fullName) return {};
  const map: Record<string, string | undefined> = {
    full_name: profile.fullName,
    first_name: profile.firstName,
    last_name: profile.lastName,
    headline: profile.headline,
    company: profile.company,
    location: profile.location,
    about: profile.about,
    experience: profile.experience,
    education: profile.education,
  };
  return Object.fromEntries(Object.entries(map).filter(([, v]) => v));
}

export async function reportResult(
  db: SupabaseClient,
  userId: string,
  { prospectId, stepIndex, result }: { prospectId: string; stepIndex: number; result: ActionResult }
) {
  const settings = await getSettings(db, userId);
  const { data: row } = await db.from("prospects").select("*").eq("id", prospectId).eq("user_id", userId).single();
  if (!row) return;
  let p = row as Prospect;
  const { data: campaign } = await db.from("campaigns").select("*").eq("id", p.campaign_id).maybeSingle();
  const steps = (campaign as Campaign | null)?.steps ?? [];
  const step = steps[stepIndex];
  const day = localNow(settings.timezone).day;
  const who = () => p.full_name || p.url;
  const gap = (settings.gap_min + Math.random() * Math.max(0, settings.gap_max - settings.gap_min)) * 60 * 1000;
  await db.from("settings").update({ next_action_at: new Date(Date.now() + gap).toISOString() }).eq("user_id", userId);

  const profile = profileColumns(result.profile);
  if (Object.keys(profile).length) {
    await db.from("prospects").update(profile).eq("id", p.id);
    p = { ...p, ...profile };
  }
  const advance = (extra: Record<string, unknown> = {}) =>
    db
      .from("prospects")
      .update({ ...extra, errors: 0, last_error: "", locked_until: null, ...nextPosition(steps, stepIndex + 1) })
      .eq("id", p.id);
  const count = (kind: "invites" | "visits" | "messages") => db.rpc("increment_counter", { p_user: userId, p_day: day, p_kind: kind });

  if (!step || p.step_index !== stepIndex) return;

  if (result.status === "error" || result.error) {
    await registerError(db, userId, p, result.error || "Action impossible.");
    if (result.fatal) {
      await db.from("settings").update({ paused: true }).eq("user_id", userId);
      await log(db, userId, "Prospection mise en pause par sécurité : vérifiez votre connexion LinkedIn puis relancez.", "error");
    }
    return;
  }

  if (step.type === "visit") {
    await count("visits");
    await log(db, userId, `Profil visité : ${who()}`);
    let analysis = p.analysis;
    if (settings.auto_analyze && hasAIKey(settings) && !analysis) {
      try {
        analysis = await analyzeProfile(settings, p);
        await log(db, userId, `Profil analysé par l'IA : ${who()} (note ${analysis.score}/10)`);
      } catch (e) {
        await log(db, userId, `Analyse IA impossible pour ${who()} : ${(e as Error).message}`, "warn");
      }
    }
    await advance({ analysis, history: historyAdd(p, "Profil visité") });
    return;
  }

  if (step.type === "invite") {
    if (result.status === "sent") {
      await count("invites");
      await log(db, userId, `Invitation envoyée : ${who()}`);
      await advance({ invited_at: new Date().toISOString(), history: historyAdd(p, "Invitation envoyée") });
    } else {
      await log(db, userId, `${who()} : ${result.status === "pending" ? "invitation déjà en attente" : "déjà en relation"}, étape suivante.`);
      await advance({ invited_at: p.invited_at || new Date().toISOString() });
    }
    return;
  }

  if (step.type === "wait_accept") {
    await count("visits");
    if (result.connected) {
      await log(db, userId, `Invitation acceptée : ${who()}`);
      await advance({ connected_at: new Date().toISOString(), history: historyAdd(p, "Invitation acceptée") });
    } else if (Date.now() - new Date(p.invited_at || p.created_at).getTime() > (Number(step.maxDays) || 14) * DAY_MS) {
      await db.from("prospects").update({ status: "non_accepte", next_at: null, locked_until: null }).eq("id", p.id);
      await log(db, userId, `${who()} n'a pas accepté l'invitation à temps.`);
    } else {
      await db
        .from("prospects")
        .update({ locked_until: null, next_at: new Date(Date.now() + DAY_MS + Math.random() * 3 * 3600 * 1000).toISOString() })
        .eq("id", p.id);
    }
    return;
  }

  if (step.type === "message") {
    if (result.status === "replied") {
      await db
        .from("prospects")
        .update({ status: "a_repondu", next_at: null, locked_until: null, replied_at: new Date().toISOString(), history: historyAdd(p, "A répondu") })
        .eq("id", p.id);
      await log(db, userId, `${who()} a répondu : scénario arrêté.`);
      return;
    }
    const text = result.sentText || (p.approved_message?.stepIndex === stepIndex && p.approved_message.text) || "";
    await count("messages");
    await log(db, userId, `Message envoyé : ${who()}`);
    await advance({
      sent_messages: [...(p.sent_messages || []), { t: new Date().toISOString(), text: text || "(message automatique)" }],
      approved_message: null,
      pending_message: null,
      history: historyAdd(p, text ? `Message envoyé : ${text}` : "Message envoyé"),
    });
  }
}

export function adminDb() {
  return createAdminClient();
}
