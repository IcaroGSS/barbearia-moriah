import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage, supabase } from "../../lib/supabase";
import { useAuth } from "../AuthContext";
import { CARGO_LABEL, fmtPhone, maskPhone } from "../../lib/format";
import { useToast } from "../../components/ui";
import { firstAllowedPath } from "../nav";

export function MinhaConta() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [nome, setNome] = useState(profile?.nome ?? "");
  const [whatsapp, setWhatsapp] = useState(maskPhone(fmtPhone(profile?.whatsapp ?? "")));
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [nova2, setNova2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (!profile) return null;
  const obrigatorio = profile.must_change_password;

  const salvarDados = async (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) return toast("Informe seu nome.", "error");
    const { error } = await supabase.from("profiles").update({ nome: nome.trim(), whatsapp: whatsapp.replace(/\D/g, "") || null }).eq("id", profile.id);
    if (error) return toast(errorMessage(error), "error");
    toast("Dados atualizados.");
    refreshProfile();
  };

  const trocarSenha = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (nova.length < 8) return setErro("A nova senha precisa ter pelo menos 8 caracteres.");
    if (nova !== nova2) return setErro("As senhas não conferem.");
    if (nova === atual) return setErro("A nova senha precisa ser diferente da atual.");
    setSalvando(true);
    // confirma a senha atual antes de trocar
    const { error: errLogin } = await supabase.auth.signInWithPassword({ email: profile.email, password: atual });
    if (errLogin) {
      setSalvando(false);
      return setErro("Senha atual incorreta.");
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      setSalvando(false);
      return setErro(errorMessage(error));
    }
    await supabase.rpc("clear_must_change_password");
    const p = await refreshProfile();
    setSalvando(false);
    setAtual("");
    setNova("");
    setNova2("");
    toast("Senha alterada.");
    if (obrigatorio) nav(firstAllowedPath(p), { replace: true });
  };

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      {obrigatorio && (
        <div className="alert warn" style={{ gridColumn: "1 / -1" }}>
          Você entrou com uma senha provisória. Crie uma senha nova para continuar usando o painel.
        </div>
      )}
      <form className="glass card stack" onSubmit={trocarSenha}>
        <h3 style={{ margin: 0 }}>Trocar senha</h3>
        {erro && <div className="alert error">{erro}</div>}
        <label className="field">
          Senha atual {obrigatorio && "(a provisória)"}
          <input className="input" type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          Nova senha (mínimo 8 caracteres)
          <input className="input" type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          Confirmar nova senha
          <input className="input" type="password" value={nova2} onChange={(e) => setNova2(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <button className="btn primary" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>

      {!obrigatorio && (
        <form className="glass card stack" onSubmit={salvarDados}>
          <h3 style={{ margin: 0 }}>Meus dados</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {profile.email} · {profile.cargo ? CARGO_LABEL[profile.cargo] : ""}
          </p>
          <label className="field">
            Nome
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="field">
            WhatsApp
            <input className="input" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} />
          </label>
          <button className="btn">Salvar dados</button>
        </form>
      )}
    </div>
  );
}
