import { authExtension, reportResult } from "@/lib/engine";
import { json, options } from "@/lib/cors";

export const OPTIONS = options;
export const maxDuration = 60; // l'analyse IA du profil se fait après la visite

export async function POST(req: Request) {
  const auth = await authExtension(req);
  if (!auth) return json({ error: "Jeton invalide" }, 401);
  const body = await req.json().catch(() => null);
  if (!body?.prospectId || typeof body.stepIndex !== "number") return json({ error: "Requête invalide" }, 400);
  await reportResult(auth.db, auth.userId, { prospectId: body.prospectId, stepIndex: body.stepIndex, result: body.result || {} });
  return json({ ok: true });
}
