import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local");
}

export const supabase = createClient(url ?? "http://localhost", key ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Mensagem de erro amigável a partir de um erro do Supabase/PostgREST. */
export function errorMessage(err: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (!err) return fallback;
  const e = err as { message?: string; code?: string };
  const msg = e.message ?? String(err);
  if (e.code === "23P01" || /sem_sobreposicao/.test(msg)) return "Esse horário já está ocupado por outro agendamento.";
  if (e.code === "42501" || /row-level security|permission denied/i.test(msg)) return "Você não tem permissão para isso.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet.";
  return msg || fallback;
}

/** Chama a Edge Function admin-users e devolve o JSON (lança erro com a mensagem do servidor). */
export async function adminUsers<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      } catch {
        /* resposta sem JSON */
      }
    }
    throw new Error(msg);
  }
  return data as T;
}
