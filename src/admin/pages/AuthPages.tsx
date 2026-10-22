import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase, errorMessage } from "../../lib/supabase";
import { MSG_BLOQUEADO, MSG_PENDENTE, useAuth } from "../AuthContext";
import { useSite } from "../../site/SiteContext";
import { maskPhone } from "../../lib/format";
import { waLink } from "../../lib/whatsapp";
import { Icon } from "../../components/Icon";
import { firstAllowedPath } from "../nav";
import { appUrl, redirectUrl } from "../../lib/env";

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { settings } = useSite();
  return (
    <main className="auth-page">
      <div className="auth-card glass">
        <Link to="/" className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark">{settings.nome.replace(/^barbearia\s+/i, "").charAt(0).toUpperCase() || "M"}</span>
          <span>{settings.nome}</span>
        </Link>
        <h2 style={{ marginBottom: 4 }}>{title}</h2>
        {subtitle && <p className="muted" style={{ marginTop: 0 }}>{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}

function traduzErroLogin(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/banned/i.test(msg)) return MSG_BLOQUEADO;
  if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  return errorMessage({ message: msg });
}

export function LoginPage() {
  const { profile, notice, setNotice, refreshProfile, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!loading && profile) {
    return <Navigate to={profile.must_change_password ? "/admin/minha-conta" : firstAllowedPath(profile)} replace />;
  }

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setNotice(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setEnviando(false);
      setErro(traduzErroLogin(error.message));
      return;
    }
    const p = await refreshProfile();
    setEnviando(false);
    if (!p) {
      await supabase.auth.signOut();
      setErro("Não encontramos seu cadastro no painel.");
      return;
    }
    if (p.status === "pendente") return setErro(MSG_PENDENTE);
    if (p.status === "bloqueado") return setErro(MSG_BLOQUEADO);
    nav(p.must_change_password ? "/admin/minha-conta" : firstAllowedPath(p), { replace: true });
  };

  return (
    <AuthShell title="Entrar no painel" subtitle="Acesso restrito à equipe da barbearia.">
      <form className="stack" onSubmit={entrar}>
        {(erro || notice) && <div className={`alert ${(erro ?? notice) === MSG_PENDENTE ? "warn" : "error"}`}>{erro ?? notice}</div>}
        <label className="field">
          E-mail
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          Senha
          <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn primary block" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
        <div className="row between small">
          <Link to="/admin/esqueci-senha">Esqueci minha senha</Link>
          <Link to="/admin/cadastro">Solicitar acesso</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function SignupPage() {
  const { settings } = useSite();
  const nav = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [confirmarEmail, setConfirmarEmail] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 2) return setErro("Informe seu nome.");
    if (whatsapp.replace(/\D/g, "").length < 10) return setErro("Informe seu WhatsApp com DDD.");
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== senha2) return setErro("As senhas não conferem.");
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
      options: {
        data: { nome: nome.trim(), whatsapp: whatsapp.replace(/\D/g, "") },
        emailRedirectTo: redirectUrl("/admin/login"),
      },
    });
    setEnviando(false);
    if (error) {
      setErro(/already registered|already exists/i.test(error.message) ? "Já existe uma conta com esse e-mail." : errorMessage(error));
      return;
    }
    // Primeiro cadastro do sistema vira o dono e já pode entrar
    if (data.session) {
      const { data: p } = await supabase.from("profiles").select("cargo, status").eq("id", data.session.user.id).maybeSingle();
      if (p?.cargo === "dono" && p.status === "aprovado") {
        nav("/admin", { replace: true });
        return;
      }
      await supabase.auth.signOut();
    } else {
      // Projeto com confirmação de e-mail ligada: a conta só vale depois do link
      setConfirmarEmail(true);
    }
    setFeito(true);
  };

  if (feito) {
    const linkSolicitacao = appUrl("/admin/usuarios?aba=pendentes");
    const msg = `Olá! Sou ${nome.trim()} e pedi acesso ao painel da ${settings.nome} (${email.trim()}).\n\nVer solicitação: ${linkSolicitacao}`;
    return (
      <AuthShell title="Solicitação enviada">
        <div className="stack">
          {confirmarEmail && (
            <div className="alert">Enviamos um link de confirmação para {email.trim()}. Abra o e-mail e confirme antes de entrar.</div>
          )}
          <div className="alert warn">{MSG_PENDENTE}</div>
          <p className="muted" style={{ margin: 0 }}>
            O responsável recebe um aviso no painel. Se quiser agilizar, avise pelo WhatsApp.
          </p>
          {settings.whatsapp && (
            <a className="btn whatsapp block" href={waLink(settings.whatsapp, msg)} target="_blank" rel="noreferrer">
              <Icon name="whatsapp" /> Avisar o responsável
            </a>
          )}
          <Link className="btn block" to="/admin/login">
            Voltar para o login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Solicitar acesso" subtitle="Preencha seus dados. O responsável precisa aprovar antes do primeiro acesso.">
      <form className="stack" onSubmit={enviar}>
        {erro && <div className="alert error">{erro}</div>}
        <label className="field">
          Nome
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
        </label>
        <label className="field">
          E-mail
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          WhatsApp
          <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} inputMode="tel" placeholder="(11) 98765-4321" required />
        </label>
        <label className="field">
          Senha (mínimo 8 caracteres)
          <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          Confirmar senha
          <input className="input" type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <button className="btn primary block" disabled={enviando}>
          {enviando ? "Enviando..." : "Solicitar acesso"}
        </button>
        <Link to="/admin/login" className="small center">
          Já tenho acesso
        </Link>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("request-password-reset", {
      body: { email: email.trim(), redirect_to: redirectUrl("/admin/redefinir-senha") },
    });
    setEnviando(false);
    if (error) return setErro("Não foi possível enviar agora. Tente novamente em instantes.");
    setMsg((data as { message?: string })?.message ?? "Se o e-mail estiver cadastrado e aprovado, você vai receber um link.");
  };

  return (
    <AuthShell title="Esqueci minha senha" subtitle="Enviaremos um link para criar uma nova senha. Só funciona para usuários aprovados.">
      <form className="stack" onSubmit={enviar}>
        {msg && <div className="alert success">{msg}</div>}
        {erro && <div className="alert error">{erro}</div>}
        <label className="field">
          E-mail
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button className="btn primary block" disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar link"}
        </button>
        <Link to="/admin/login" className="small center">
          Voltar para o login
        </Link>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const nav = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // O link do e-mail cria uma sessão temporária de recuperação
    supabase.auth.getSession().then(({ data }) => setPronto(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === "PASSWORD_RECOVERY" || s) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== senha2) return setErro("As senhas não conferem.");
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (!error) await supabase.rpc("clear_must_change_password");
    setEnviando(false);
    if (error) return setErro(errorMessage(error));
    nav("/admin", { replace: true });
  };

  return (
    <AuthShell title="Criar nova senha">
      {!pronto ? (
        <div className="stack">
          <div className="alert warn">Link inválido ou expirado. Peça um novo link na tela de login.</div>
          <Link className="btn block" to="/admin/esqueci-senha">
            Pedir novo link
          </Link>
        </div>
      ) : (
        <form className="stack" onSubmit={salvar}>
          {erro && <div className="alert error">{erro}</div>}
          <label className="field">
            Nova senha
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          <label className="field">
            Confirmar nova senha
            <input className="input" type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          <button className="btn primary block" disabled={enviando}>
            {enviando ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
