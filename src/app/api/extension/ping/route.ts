import { authExtension } from "@/lib/engine";
import { json, options } from "@/lib/cors";

export const OPTIONS = options;

// Vérifie le jeton et renvoie l'état de la prospection pour la fenêtre de l'extension.
export async function GET(req: Request) {
  const auth = await authExtension(req);
  if (!auth) return json({ error: "Jeton invalide" }, 401);
  const { data: s } = await auth.db.from("settings").select("paused,my_name").eq("user_id", auth.userId).single();
  const { count } = await auth.db
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .eq("status", "a_valider");
  return json({ ok: true, paused: s?.paused ?? true, name: s?.my_name ?? "", toValidate: count ?? 0 });
}

export async function POST(req: Request) {
  const auth = await authExtension(req);
  if (!auth) return json({ error: "Jeton invalide" }, 401);
  const { paused } = await req.json().catch(() => ({}));
  if (typeof paused === "boolean") await auth.db.from("settings").update({ paused }).eq("user_id", auth.userId);
  return json({ ok: true });
}
