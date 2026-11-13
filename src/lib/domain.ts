// Types et règles métier partagés entre le serveur et l'interface.

export const DAY_MS = 24 * 60 * 60 * 1000;

export type StepType = "visit" | "wait" | "invite" | "wait_accept" | "message";

export type Attachment = { path: string; name: string; type: string; size: number };

export const ATTACHMENT_ACCEPT = "image/*,video/*,audio/*,application/pdf";
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // limite LinkedIn pour un fichier joint

export type Step = {
  type: StepType;
  attachments?: Attachment[]; // message
  days?: number; // wait
  maxDays?: number; // wait_accept
  noteMode?: "aucune" | "modele" | "ia"; // invite
  mode?: "ia" | "modele"; // message
  approval?: boolean; // message
  template?: string;
  aiInstruction?: string;
};

export type ProspectList = { id: string; name: string; source: "linkedin" | "fichier" | "manuel"; created_at: string };

export type Campaign = { id: string; user_id: string; name: string; steps: Step[]; created_at: string };

export type ProspectStatus = "nouveau" | "actif" | "a_valider" | "a_repondu" | "non_accepte" | "termine" | "pause" | "erreur";

export type Analysis = {
  resume?: string;
  score?: number;
  justification_score?: string;
  decideur?: string;
  points_accroche?: string[];
  besoins_probables?: string[];
  angle_recommande?: string;
  accroche?: string; // une phrase prête à l'emploi, basée sur un élément précis du profil
  sujet_dernier_post?: string; // « votre post sur … »
  a_eviter?: string;
  date?: string;
};

export type RecentPost = { date: string; text: string; repost?: boolean };

export type Prospect = {
  id: string;
  user_id: string;
  url: string;
  full_name: string;
  first_name: string;
  last_name: string;
  headline: string;
  company: string;
  location: string;
  about: string;
  experience: string;
  education: string;
  current_position: string;
  recent_posts: RecentPost[];
  status: ProspectStatus;
  campaign_id: string | null;
  list_id: string | null;
  step_index: number;
  next_at: string | null;
  locked_until: string | null;
  invited_at: string | null;
  connected_at: string | null;
  replied_at: string | null;
  errors: number;
  last_error: string;
  pending_message: { text: string; stepIndex: number } | null;
  approved_message: { text: string; stepIndex: number } | null;
  analysis: Analysis | null;
  sent_messages: { t: string; text: string }[];
  custom: Record<string, string>;
  history: { t: string; text: string }[];
  created_at: string;
  updated_at: string;
};

export type Settings = {
  user_id: string;
  provider: "claude" | "openai";
  anthropic_key: string;
  openai_key: string;
  claude_model: string;
  openai_model: string;
  my_name: string;
  my_offer: string;
  my_target: string;
  tone: string;
  language: string;
  signature: string;
  limit_invites: number;
  limit_visits: number;
  limit_messages: number;
  hour_start: number;
  hour_end: number;
  days: number[];
  gap_min: number;
  gap_max: number;
  timezone: string;
  auto_analyze: boolean;
  paused: boolean;
  force_next: boolean;
  next_action_at: string | null;
  extension_seen_at: string | null;
};

export const STEP_LABELS: Record<StepType, string> = {
  visit: "Visiter le profil",
  invite: "Envoyer une invitation",
  wait_accept: "Attendre l'acceptation",
  wait: "Attendre",
  message: "Envoyer un message",
};

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  nouveau: "Nouveau",
  actif: "En cours",
  a_valider: "Message à valider",
  a_repondu: "A répondu",
  non_accepte: "Invitation non acceptée",
  termine: "Scénario terminé",
  pause: "En pause",
  erreur: "Erreur",
};

export const CLAUDE_MODELS = [
  ["claude-opus-5-5", "Claude Opus 5.5 (meilleure qualité)"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 (plus économique)"],
  ["claude-haiku-5-5", "Claude Haiku 5.5 (le moins cher)"],
] as const;

export function normalizeUrl(u: string): string | null {
  const m = String(u || "").match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  return m ? `https://www.linkedin.com/in/${m[1].toLowerCase()}/` : null;
}

export const VARIABLES = [
  { key: "prenom", label: "Prénom" },
  { key: "nom", label: "Nom" },
  { key: "nomcomplet", label: "Nom complet" },
  { key: "entreprise", label: "Entreprise" },
  { key: "poste", label: "Poste" },
  { key: "ville", label: "Ville" },
  { key: "dernierpost", label: "Dernier post", hint: "Ex. « votre post sur le recrutement des commerciaux » (après la visite du profil)" },
  { key: "accroche", label: "Accroche IA", hint: "Une phrase personnalisée écrite par l'IA à partir du profil et des posts" },
] as const;

// Sujet du dernier post : l'analyse IA en donne une version propre, sinon on prend le début du texte.
export function lastPostLabel(p: Partial<Prospect>) {
  if (p.analysis?.sujet_dernier_post) return p.analysis.sujet_dernier_post;
  const post = (p.recent_posts || []).find((x) => !x.repost) || p.recent_posts?.[0];
  if (!post?.text) return "";
  const t = post.text.replace(/\s+/g, " ").trim();
  return `votre post « ${t.length > 90 ? t.slice(0, 90).replace(/\s+\S*$/, "") + "…" : t} »`;
}

export function needsAnalysis(tpl?: string) {
  return /\{\{\s*(accroche|dernierpost)\s*\}\}/i.test(tpl || "");
}

// Transforme un en-tête de colonne CSV en nom de variable : « Ice breaker » → icebreaker
export function variableKey(label: string) {
  return label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export function fillTemplate(tpl: string | undefined, p: Partial<Prospect>): string {
  const vars: Record<string, string | undefined> = {
    ...Object.fromEntries(Object.entries(p.custom || {}).map(([k, v]) => [variableKey(k), v])),
    prenom: p.first_name,
    nom: p.last_name,
    nomcomplet: p.full_name,
    poste: p.headline,
    entreprise: p.company,
    ville: p.location,
    dernierpost: lastPostLabel(p),
    accroche: p.analysis?.accroche,
  };
  return String(tpl || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, k: string) => vars[variableKey(k)] ?? "");
}

// À partir de l'étape fromIndex, saute les étapes « Attendre » en cumulant le délai.
export function nextPosition(steps: Step[], fromIndex: number, now = Date.now()) {
  let i = fromIndex;
  let delay = 0;
  while (i < steps.length && steps[i].type === "wait") {
    delay += (Number(steps[i].days) || 0) * DAY_MS;
    i++;
  }
  if (delay > 0) delay += Math.random() * 2 * 60 * 60 * 1000; // jusqu'à 2 h d'aléatoire
  if (i >= steps.length) return { step_index: i, status: "termine" as const, next_at: null };
  return { step_index: i, status: "actif" as const, next_at: new Date(now + delay).toISOString() };
}

export function startPosition(campaign: Pick<Campaign, "id" | "steps">) {
  return {
    campaign_id: campaign.id,
    errors: 0,
    last_error: "",
    pending_message: null,
    approved_message: null,
    ...nextPosition(campaign.steps, 0),
  };
}

export function defaultSteps(): Step[] {
  return [
    { type: "visit" },
    { type: "wait", days: 1 },
    { type: "invite", noteMode: "aucune" },
    { type: "wait_accept", maxDays: 14 },
    { type: "wait", days: 1 },
    {
      type: "message",
      mode: "ia",
      approval: true,
      aiInstruction:
        "Remercie pour la connexion. Fais référence à un élément précis et sincère de son profil. Pose une question ouverte sur son activité. Aucun argumentaire commercial.",
    },
    { type: "wait", days: 3 },
    {
      type: "message",
      mode: "ia",
      approval: true,
      aiInstruction: "Relance courte. Apporte une idée utile en lien avec son métier et avec mon offre, puis propose un échange de 15 minutes.",
    },
    { type: "wait", days: 5 },
    {
      type: "message",
      mode: "modele",
      approval: false,
      template:
        "Bonjour {{prenom}}, je me permets une dernière relance. Si ce n'est pas le bon moment, aucun souci : je reste disponible si le sujet devient d'actualité. Belle journée !",
    },
  ];
}

// Date du jour et heure locale dans le fuseau de l'utilisatrice.
export function localNow(timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: (Number(parts.hour) % 24) + Number(parts.minute) / 60,
    weekday,
  };
}

export function isRecent(ts: string | null | undefined, ms: number) {
  return !!ts && Date.now() - new Date(ts).getTime() < ms;
}

// Les N derniers jours (AAAA-MM-JJ) dans le fuseau de l'utilisatrice, du plus récent au plus ancien.
export function lastDays(n: number, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Europe/Paris" });
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => fmt.format(new Date(now - i * DAY_MS)));
}
