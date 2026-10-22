// Ações de usuários do painel que exigem a service role key.
// Só o DONO aprovado pode chamar. A chave fica apenas aqui, no servidor.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders, json } from "../_shared/http.ts";

const PERMISSOES = [
  "dashboard",
  "agenda",
  "agendamento_manual",
  "disponibilidade",
  "servicos",
  "financeiro",
  "clientes",
  "configuracoes",
];
const CARGOS = ["gerente", "barbeiro", "recepcao"];
const CARGO_NOME: Record<string, string> = {
  dono: "dono",
  gerente: "gerente",
  barbeiro: "barbeiro",
  recepcao: "recepção",
};
const BAN_PERMANENTE = "876000h"; // 100 anos

type Perfil = {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  status: "pendente" | "aprovado" | "bloqueado";
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function limparPermissoes(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((p): p is string => typeof p === "string" && PERMISSOES.includes(p)))];
}

function validarCargo(valor: unknown): string {
  if (typeof valor !== "string" || !CARGOS.includes(valor)) {
    throw new HttpError(400, "Cargo inválido");
  }
  return valor;
}

function senhaProvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

async function carregarPerfil(admin: SupabaseClient, id: unknown): Promise<Perfil> {
  if (typeof id !== "string" || !id) throw new HttpError(400, "Usuário não informado");
  const { data, error } = await admin
    .from("profiles")
    .select("id, nome, email, cargo, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Usuário não encontrado");
  return data as Perfil;
}

function protegerDono(alvo: Perfil) {
  if (alvo.cargo === "dono") throw new HttpError(403, "O dono não pode ser alterado por esta ação");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) throw new HttpError(401, "Faça login novamente");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // Cliente com a identidade de quem chamou: as mudanças passam pelo RLS e ficam no registro de atividades
    const comoDono = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: quem, error: erroQuem } = await admin.auth.getUser(jwt);
    if (erroQuem || !quem.user) throw new HttpError(401, "Sessão inválida, faça login novamente");

    const { data: dono } = await admin
      .from("profiles")
      .select("id, nome, cargo, status")
      .eq("id", quem.user.id)
      .maybeSingle();
    if (!dono || dono.cargo !== "dono" || dono.status !== "aprovado") {
      throw new HttpError(403, "Apenas o dono pode fazer isso");
    }

    const registrar = async (acao: string, descricao: string, alvoId: string) => {
      await admin.from("activity_log").insert({
        ator_id: dono.id,
        ator_nome: dono.nome,
        acao,
        descricao: `${dono.nome} ${descricao}`,
        entidade: "profiles",
        entidade_id: alvoId,
      });
    };

    const body = await req.json().catch(() => ({}));
    const acao = body?.action as string;

    switch (acao) {
      case "create": {
        const nome = String(body.nome ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        const whatsapp = String(body.whatsapp ?? "").replace(/\D/g, "");
        const senha = String(body.senha ?? "");
        const cargo = validarCargo(body.cargo);
        const permissoes = limparPermissoes(body.permissoes);
        if (nome.length < 2) throw new HttpError(400, "Informe o nome");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "E-mail inválido");
        if (senha.length < 8) throw new HttpError(400, "A senha provisória precisa ter pelo menos 8 caracteres");

        const { data: criado, error } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome, whatsapp },
        });
        if (error || !criado.user) {
          const msg = /already|registered|exists/i.test(error?.message ?? "")
            ? "Já existe um usuário com esse e-mail"
            : error?.message ?? "Não foi possível criar o usuário";
          throw new HttpError(400, msg);
        }
        const { error: erroPerfil } = await admin
          .from("profiles")
          .update({
            nome,
            whatsapp: whatsapp || null,
            cargo,
            status: "aprovado",
            permissoes,
            aprovado_por: dono.id,
            aprovado_em: new Date().toISOString(),
            must_change_password: true,
          })
          .eq("id", criado.user.id);
        if (erroPerfil) {
          await admin.auth.admin.deleteUser(criado.user.id);
          throw new HttpError(500, erroPerfil.message);
        }
        await registrar("usuario.criar", `criou o usuário ${nome} como ${CARGO_NOME[cargo]}`, criado.user.id);
        return json({ ok: true, user_id: criado.user.id });
      }

      case "approve": {
        const alvo = await carregarPerfil(admin, body.user_id);
        if (alvo.status !== "pendente") throw new HttpError(400, "Essa solicitação já foi analisada");
        const { error } = await comoDono
          .from("profiles")
          .update({
            cargo: validarCargo(body.cargo),
            permissoes: limparPermissoes(body.permissoes),
            status: "aprovado",
            aprovado_por: dono.id,
            aprovado_em: new Date().toISOString(),
          })
          .eq("id", alvo.id);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case "reject": {
        const alvo = await carregarPerfil(admin, body.user_id);
        if (alvo.status !== "pendente") throw new HttpError(400, "Só é possível recusar solicitações pendentes");
        const { error } = await admin.auth.admin.deleteUser(alvo.id);
        if (error) throw new HttpError(500, error.message);
        await registrar("usuario.recusar", `recusou o acesso de ${alvo.nome}`, alvo.id);
        return json({ ok: true });
      }

      case "update": {
        const alvo = await carregarPerfil(admin, body.user_id);
        protegerDono(alvo);
        if (alvo.status === "pendente") throw new HttpError(400, "Aprove a solicitação primeiro");
        const { error } = await comoDono
          .from("profiles")
          .update({ cargo: validarCargo(body.cargo), permissoes: limparPermissoes(body.permissoes) })
          .eq("id", alvo.id);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case "block": {
        const alvo = await carregarPerfil(admin, body.user_id);
        protegerDono(alvo);
        const { error } = await comoDono.from("profiles").update({ status: "bloqueado" }).eq("id", alvo.id);
        if (error) throw new HttpError(400, error.message);
        // Impede novo login e a renovação da sessão atual
        const { error: erroBan } = await admin.auth.admin.updateUserById(alvo.id, { ban_duration: BAN_PERMANENTE });
        if (erroBan) throw new HttpError(500, erroBan.message);
        return json({ ok: true });
      }

      case "unblock": {
        const alvo = await carregarPerfil(admin, body.user_id);
        protegerDono(alvo);
        if (alvo.status !== "bloqueado") throw new HttpError(400, "Esse usuário não está bloqueado");
        const { error: erroBan } = await admin.auth.admin.updateUserById(alvo.id, { ban_duration: "none" });
        if (erroBan) throw new HttpError(500, erroBan.message);
        const { error } = await comoDono.from("profiles").update({ status: "aprovado" }).eq("id", alvo.id);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      case "delete": {
        const alvo = await carregarPerfil(admin, body.user_id);
        protegerDono(alvo);
        await registrar("usuario.excluir", `excluiu o usuário ${alvo.nome}`, alvo.id);
        const { error } = await admin.auth.admin.deleteUser(alvo.id);
        if (error) throw new HttpError(500, error.message);
        return json({ ok: true });
      }

      case "reset_password": {
        const alvo = await carregarPerfil(admin, body.user_id);
        if (alvo.id === dono.id) throw new HttpError(400, "Para trocar a sua senha use Minha conta");
        if (alvo.status !== "aprovado") throw new HttpError(400, "Só é possível redefinir a senha de usuários ativos");

        if (body.modo === "email") {
          const publico = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
          const redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : undefined;
          const { error } = await publico.auth.resetPasswordForEmail(alvo.email, { redirectTo });
          if (error) throw new HttpError(400, error.message);
          await registrar("usuario.senha_email", `enviou link de redefinição de senha para ${alvo.nome}`, alvo.id);
          return json({ ok: true });
        }

        const senha = senhaProvisoria();
        const { error } = await admin.auth.admin.updateUserById(alvo.id, { password: senha });
        if (error) throw new HttpError(500, error.message);
        await admin.from("profiles").update({ must_change_password: true }).eq("id", alvo.id);
        await registrar("usuario.senha_provisoria", `gerou uma senha provisória para ${alvo.nome}`, alvo.id);
        return json({ ok: true, senha });
      }

      default:
        throw new HttpError(400, "Ação desconhecida");
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Erro inesperado. Tente novamente." }, 500);
  }
});
