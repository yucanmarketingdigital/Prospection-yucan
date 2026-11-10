import { authExtension } from "@/lib/engine";
import { json, options } from "@/lib/cors";
import { importProspects } from "@/lib/prospects";

export const OPTIONS = options;

export async function POST(req: Request) {
  const auth = await authExtension(req);
  if (!auth) return json({ error: "Jeton invalide" }, 401);
  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items.slice(0, 500) : [];
  return json(await importProspects(auth.db, auth.userId, items, body?.campaignId || ""));
}
