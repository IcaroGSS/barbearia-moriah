// "Esqueci minha senha": só envia o link para usuários aprovados.
// A resposta é sempre a mesma, para não revelar quais e-mails existem.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders, json } from "../_shared/http.ts";

const RESPOSTA = { ok: true, message: "Se o e-mail estiver cadastrado e aprovado, você vai receber um link em instantes." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const { email, redirect_to } = await req.json().catch(() => ({}));
    const alvo = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) return json({ error: "Informe um e-mail válido" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: perfil } = await admin
      .from("profiles")
      .select("id, status")
      .eq("email", alvo)
      .maybeSingle();

    if (perfil?.status === "aprovado") {
      const publico = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await publico.auth.resetPasswordForEmail(alvo, {
        redirectTo: typeof redirect_to === "string" ? redirect_to : undefined,
      });
      if (error) console.error("resetPasswordForEmail:", error.message);
    }
    return json(RESPOSTA);
  } catch (e) {
    console.error(e);
    return json(RESPOSTA);
  }
});
