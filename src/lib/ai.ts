import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Analysis, Prospect, Settings } from "./domain";

// Appelle l'IA de l'utilisatrice avec SA clé (Claude ou OpenAI).
export async function callAI(settings: Settings, system: string, prompt: string): Promise<string> {
  if (settings.provider === "openai") {
    if (!settings.openai_key) throw new Error("Clé API OpenAI manquante (Réglages).");
    const client = new OpenAI({ apiKey: settings.openai_key });
    const res = await client.chat.completions.create({
      model: settings.openai_model || "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    return (res.choices[0]?.message?.content || "").trim();
  }

  if (!settings.anthropic_key) throw new Error("Clé API Claude manquante (Réglages).");
  const client = new Anthropic({ apiKey: settings.anthropic_key });
  try {
    const res = await client.beta.messages.create({
      model: settings.claude_model || "claude-opus-5-5",
      max_tokens: 16000,
      // Si Claude refuse une demande, l'API la relance sur un modèle de secours.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") throw new Error("Claude a refusé cette demande.");
    return res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Clé API Claude invalide.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Limite de requêtes Claude atteinte, réessayez dans une minute.");
    if (e instanceof Anthropic.APIError) throw new Error(`Claude : ${e.message}`);
    throw e;
  }
}

export function hasAIKey(s: Settings) {
  return s.provider === "openai" ? !!s.openai_key : !!s.anthropic_key;
}

function baseSystem(s: Settings) {
  return [
    "Tu es un expert de la prospection B2B sur LinkedIn.",
    `Tu aides ${s.my_name || "l'utilisatrice"} à prospecter de façon humaine, respectueuse et personnalisée.`,
    s.my_offer && `Son offre : ${s.my_offer}`,
    s.my_target && `Sa cible idéale : ${s.my_target}`,
    `Ton souhaité : ${s.tone}.`,
    `Langue : ${s.language}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function profileBlock(p: Partial<Prospect>) {
  return [
    `Nom : ${p.full_name || ""}`,
    `Titre : ${p.headline || ""}`,
    `Entreprise : ${p.company || ""}`,
    `Lieu : ${p.location || ""}`,
    p.about && `À propos : ${p.about}`,
    p.experience && `Expérience : ${p.experience}`,
    p.education && `Formation : ${p.education}`,
    p.current_position && `Poste actuel : ${p.current_position}`,
    ...(p.recent_posts || []).map(
      (x, i) => `${x.repost ? "Republication" : "Post"} récent ${i + 1}${x.date ? ` (publié : ${x.date})` : ""} : ${x.text.slice(0, 900)}`
    ),
    ...Object.entries(p.custom || {}).map(([k, v]) => `${k} : ${v}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Réponse de l'IA illisible.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export async function analyzeProfile(settings: Settings, p: Partial<Prospect>): Promise<Analysis> {
  const prompt = `Analyse ce profil LinkedIn pour préparer une prise de contact.

${profileBlock(p)}

Réponds uniquement avec un objet JSON valide, sans texte autour, de cette forme :
{
  "resume": "2 à 3 phrases sur qui est cette personne et ce qu'elle fait",
  "score": 7,
  "justification_score": "pourquoi cette note d'adéquation (1 à 10) avec la cible et l'offre",
  "decideur": "oui | non | incertain",
  "points_accroche": ["éléments précis du profil utilisables pour personnaliser un message"],
  "besoins_probables": ["besoins ou problèmes probables en lien avec l'offre"],
  "angle_recommande": "l'angle d'approche le plus pertinent",
  "a_eviter": "ce qu'il vaut mieux ne pas dire à cette personne",
  "accroche": "UNE phrase d'accroche naturelle, adressée à la personne (vouvoiement), qui cite un élément précis et vérifiable : de préférence un post récent écrit par la personne, sinon son poste actuel ou son entreprise. Pas de flatterie, pas de question commerciale.",
  "sujet_dernier_post": "si un post récent écrit par la personne existe : un groupe nominal commençant par « votre post sur … » (12 mots max), sinon chaîne vide"
}

N'utilise que les informations ci-dessus. Une republication n'est pas un post écrit par la personne.`;
  const text = await callAI(settings, baseSystem(settings), prompt);
  return { ...parseJson<Analysis>(text), date: new Date().toISOString() };
}

export async function generateMessage(
  settings: Settings,
  p: Partial<Prospect>,
  { instruction, kind = "message" }: { instruction?: string; kind?: "message" | "invitation" }
) {
  const history = (p.sent_messages || []).map((m, i) => `Message ${i + 1} déjà envoyé : ${m.text}`).join("\n");
  const analysis = p.analysis ? `Analyse du profil :\n${JSON.stringify(p.analysis, null, 1)}` : "Pas d'analyse disponible : appuie-toi sur le profil.";
  const hasPosts = (p.recent_posts || []).some((x) => !x.repost);
  const rules =
    kind === "invitation"
      ? "C'est une note d'invitation LinkedIn : 280 caractères maximum, espaces compris."
      : "C'est un message privé LinkedIn : 600 caractères maximum, sauf si la consigne demande autre chose.";
  const prompt = `${profileBlock(p)}

${analysis}

${history || "Aucun message n'a encore été envoyé à cette personne."}

Consigne pour ce message : ${instruction || "Message de prise de contact personnalisé."}

Règles :
- ${rules}
- Commence par saluer la personne par son prénom (${p.first_name || ""}).
- Personnalise vraiment : cite le nom de son entreprise${p.company ? ` (${p.company})` : ""} ou son poste actuel, et un élément précis${hasPosts ? " — de préférence le sujet de son dernier post, avec un détail concret de ce qu'elle y dit (sans le recopier)" : ""}.${p.analysis?.accroche ? `\n- Tu peux t'inspirer de cette accroche : ${p.analysis.accroche}` : ""}
- Écris comme un humain, phrases simples, aucune formule creuse ni flatterie excessive.
- Ne répète pas les messages déjà envoyés.
- N'invente aucun fait absent du profil.
- Pas de crochets ni de variables à compléter.
${settings.signature ? `- Termine par cette signature : ${settings.signature}` : "- Pas de signature."}

Réponds uniquement avec le texte du message, prêt à être envoyé.`;
  let text = await callAI(settings, baseSystem(settings), prompt);
  text = text.replace(/^["«\s]+|["»\s]+$/g, "").trim();
  if (kind === "invitation" && text.length > 300) text = text.slice(0, 297).replace(/\s+\S*$/, "") + "…";
  return text;
}

export async function askStrategy(settings: Settings, question: string, context: string) {
  const prompt = `Contexte de ma prospection :
${context}

Ma question : ${question}

Réponds de façon concrète et structurée (titres courts, listes), avec des exemples de messages si utile. Pas de tableau.`;
  return callAI(settings, baseSystem(settings), prompt);
}
