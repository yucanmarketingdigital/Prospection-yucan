import { authExtension } from "@/lib/engine";
import { json, options } from "@/lib/cors";

export const OPTIONS = options;

export async function GET(req: Request) {
  const auth = await authExtension(req);
  if (!auth) return json({ error: "Jeton invalide" }, 401);
  const [{ data: campaigns }, { data: lists }] = await Promise.all([
    auth.db.from("campaigns").select("id,name").eq("user_id", auth.userId).order("created_at"),
    auth.db.from("lists").select("id,name").eq("user_id", auth.userId).order("created_at", { ascending: false }),
  ]);
  return json({ campaigns: campaigns ?? [], lists: lists ?? [] });
}
