"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function authAction(_: { error?: string; info?: string } | null, form: FormData) {
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const mode = form.get("mode");
  const supabase = await createClient();
  if (mode === "signup") {
    const origin = (await headers()).get("origin") || "";
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback` } });
    if (error) return { error: error.message };
    if (!data.session) return { info: "Compte créé. Confirmez votre adresse e-mail via le lien reçu, puis connectez-vous." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "E-mail ou mot de passe incorrect." };
  }
  redirect("/");
}
