import { authExtension, nextAction } from "@/lib/engine";
import { json, options } from "@/lib/cors";

export const OPTIONS = options;
export const maxDuration = 60; // la rédaction IA d'une note peut prendre quelques secondes

export async function POST(req: Request) {
  const auth = await authExtension(req);
  if (!auth) return json({ error: "Jeton invalide" }, 401);
  const body = await req.json().catch(() => ({}));
  return json(await nextAction(auth.db, auth.userId, { force: body?.force === true }));
}
