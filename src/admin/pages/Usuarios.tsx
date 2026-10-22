import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminUsers, supabase } from "../../lib/supabase";
import type { Cargo, Permissao, Profile, ProfileStatus } from "../../lib/types";
import { CARGO_LABEL, fmtDateTime, fmtPhone, maskPhone } from "../../lib/format";
import { PERMISSOES, PRESETS } from "../../lib/permissions";
import { Empty, Modal, Spinner, confirmAction, useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { waLink } from "../../lib/whatsapp";
import { useSite } from "../../site/SiteContext";
import { appUrl, redirectUrl } from "../../lib/env";

type Aba = "pendentes" | "ativos" | "bloqueados";
const ABA_STATUS: Record<Aba, ProfileStatus> = { pendentes: "pendente", ativos: "aprovado", bloqueados: "bloqueado" };
type CargoEditavel = Exclude<Cargo, "dono">;

function gerarSenha(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => a[b % a.length]).join("");
}

function CargoEPermissoes({
  cargo,
  permissoes,
  onChange,
}: {
  cargo: CargoEditavel;
  permissoes: Permissao[];
  onChange: (cargo: CargoEditavel, permissoes: Permissao[]) => void;
}) {
  return (
    <>
      <label className="field">
        Cargo
        <select className="input" value={cargo} onChange={(e) => onChange(e.target.value as CargoEditavel, PRESETS[e.target.value as CargoEditavel])}>
          <option value="gerente">Gerente</option>
          <option value="barbeiro">Barbeiro</option>
          <option value="recepcao">Recepção</option>
        </select>
      </label>
      <div className="field">
        Permissões (o cargo preenche um padrão; ajuste se quiser)
        <div className="stack" style={{ gap: 8, marginTop: 4 }}>
          {PERMISSOES.map((p) => (
            <label key={p.id} className="check">
              <input
                type="checkbox"
                checked={permissoes.includes(p.id)}
                onChange={(e) => onChange(cargo, e.target.checked ? [...permissoes, p.id] : permissoes.filter((x) => x !== p.id))}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

type Dialogo =
  | { tipo: "aprovar" | "editar"; u: Profile; cargo: CargoEditavel; permissoes: Permissao[] }
  | { tipo: "senha"; u: Profile; resultado?: string }
  | { tipo: "criar"; nome: string; email: string; whatsapp: string; cargo: CargoEditavel; permissoes: Permissao[]; senha: string; criado?: boolean };

export function Usuarios() {
  const toast = useToast();
  const { settings } = useSite();
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useState<Aba>((params.get("aba") as Aba) || "pendentes");
  const [todos, setTodos] = useState<Profile[] | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("criado_em", { ascending: false });
    setTodos((data as Profile[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel("usuarios")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  useEffect(() => {
    setParams({ aba }, { replace: true });
  }, [aba, setParams]);

  // Se não houver pendentes, abre direto nos ativos
  useEffect(() => {
    if (todos && !params.get("aba") && !todos.some((u) => u.status === "pendente")) setAba("ativos");
  }, [todos]); // eslint-disable-line react-hooks/exhaustive-deps

  const executar = async (body: Record<string, unknown>, sucesso: string) => {
    setOcupado(true);
    try {
      const r = await adminUsers<{ ok: boolean; senha?: string }>(body);
      toast(sucesso);
      await carregar();
      return r;
    } catch (e) {
      toast((e as Error).message, "error");
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const lista = (todos ?? []).filter((u) => u.status === ABA_STATUS[aba]);
  const contagem = (s: ProfileStatus) => (todos ?? []).filter((u) => u.status === s).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between">
        <div className="tabs">
          {(["pendentes", "ativos", "bloqueados"] as Aba[]).map((a) => (
            <button key={a} className={aba === a ? "active" : ""} onClick={() => setAba(a)}>
              {a === "pendentes" ? "Pendentes" : a === "ativos" ? "Ativos" : "Bloqueados"}
              {contagem(ABA_STATUS[a]) > 0 && <span className="count">{contagem(ABA_STATUS[a])}</span>}
            </button>
          ))}
        </div>
        <button
          className="btn primary"
          onClick={() => setDialogo({ tipo: "criar", nome: "", email: "", whatsapp: "", cargo: "barbeiro", permissoes: PRESETS.barbeiro, senha: gerarSenha() })}
        >
          <Icon name="plus" /> Criar usuário
        </button>
      </div>

      {!todos && <Spinner />}
      {todos && (
        <div className="glass card stack">
          {lista.length === 0 && (
            <Empty>{aba === "pendentes" ? "Nenhuma solicitação aguardando aprovação." : aba === "ativos" ? "Nenhum usuário ativo." : "Nenhum usuário bloqueado."}</Empty>
          )}
          {lista.map((u) => (
            <div key={u.id} className="appt" style={{ gridTemplateColumns: "1fr auto" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <b>{u.nome}</b>
                  {u.cargo && <span className="badge st-confirmado">{CARGO_LABEL[u.cargo]}</span>}
                  {u.must_change_password && <span className="muted small">senha provisória</span>}
                </div>
                <div className="muted small">
                  {u.email}
                  {u.whatsapp ? ` · ${fmtPhone(u.whatsapp)}` : ""}
                </div>
                <div className="muted small">
                  {u.status === "pendente" ? `Pediu acesso em ${fmtDateTime(u.criado_em)}` : `Último acesso: ${fmtDateTime(u.ultimo_acesso)}`}
                </div>
                {u.status !== "pendente" && u.cargo !== "dono" && (
                  <div className="small" style={{ marginTop: 4 }}>
                    {u.permissoes.length ? PERMISSOES.filter((p) => u.permissoes.includes(p.id)).map((p) => p.label).join(" · ") : "Sem permissões"}
                  </div>
                )}
              </div>
              <div className="actions">
                {u.cargo === "dono" ? (
                  <span className="muted small">Acesso total</span>
                ) : u.status === "pendente" ? (
                  <>
                    <button className="btn sm primary" disabled={ocupado} onClick={() => setDialogo({ tipo: "aprovar", u, cargo: "barbeiro", permissoes: PRESETS.barbeiro })}>
                      Aprovar
                    </button>
                    <button
                      className="btn sm danger"
                      disabled={ocupado}
                      onClick={() => confirmAction(`Recusar o acesso de ${u.nome}? A conta será removida.`) && executar({ action: "reject", user_id: u.id }, "Solicitação recusada.")}
                    >
                      Recusar
                    </button>
                  </>
                ) : u.status === "aprovado" ? (
                  <>
                    <button className="btn sm" disabled={ocupado} onClick={() => setDialogo({ tipo: "editar", u, cargo: (u.cargo as CargoEditavel) ?? "barbeiro", permissoes: u.permissoes })}>
                      <Icon name="edit" size={16} /> Cargo e permissões
                    </button>
                    <button className="btn sm" disabled={ocupado} onClick={() => setDialogo({ tipo: "senha", u })}>
                      <Icon name="key" size={16} /> Redefinir senha
                    </button>
                    <button
                      className="btn sm danger"
                      disabled={ocupado}
                      onClick={() => confirmAction(`Bloquear ${u.nome}? A sessão dele é encerrada e o login para de funcionar.`) && executar({ action: "block", user_id: u.id }, `${u.nome} foi bloqueado.`)}
                    >
                      Bloquear
                    </button>
                  </>
                ) : (
                  <button className="btn sm" disabled={ocupado} onClick={() => executar({ action: "unblock", user_id: u.id }, `${u.nome} foi desbloqueado.`)}>
                    Desbloquear
                  </button>
                )}
                {u.cargo !== "dono" && u.status !== "pendente" && (
                  <button
                    className="btn sm ghost"
                    disabled={ocupado}
                    title="Excluir"
                    onClick={() => confirmAction(`Excluir definitivamente o usuário ${u.nome}?`) && executar({ action: "delete", user_id: u.id }, "Usuário excluído.")}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogo && (dialogo.tipo === "aprovar" || dialogo.tipo === "editar") && (
        <Modal
          title={dialogo.tipo === "aprovar" ? `Aprovar ${dialogo.u.nome}` : `Cargo e permissões de ${dialogo.u.nome}`}
          onClose={() => setDialogo(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDialogo(null)}>
                Cancelar
              </button>
              <button
                className="btn primary"
                disabled={ocupado}
                onClick={async () => {
                  const r = await executar(
                    { action: dialogo.tipo === "aprovar" ? "approve" : "update", user_id: dialogo.u.id, cargo: dialogo.cargo, permissoes: dialogo.permissoes },
                    dialogo.tipo === "aprovar" ? `Acesso de ${dialogo.u.nome} aprovado.` : "Permissões atualizadas.",
                  );
                  if (r) setDialogo(null);
                }}
              >
                {dialogo.tipo === "aprovar" ? "Aprovar acesso" : "Salvar"}
              </button>
            </>
          }
        >
          <p className="muted small" style={{ margin: 0 }}>
            {dialogo.u.email}
            {dialogo.u.whatsapp ? ` · ${fmtPhone(dialogo.u.whatsapp)}` : ""}
          </p>
          <CargoEPermissoes cargo={dialogo.cargo} permissoes={dialogo.permissoes} onChange={(cargo, permissoes) => setDialogo({ ...dialogo, cargo, permissoes })} />
        </Modal>
      )}

      {dialogo && dialogo.tipo === "senha" && (
        <Modal title={`Redefinir senha de ${dialogo.u.nome}`} onClose={() => setDialogo(null)}>
          {dialogo.resultado ? (
            <>
              <div className="alert success">
                Senha provisória: <b style={{ fontSize: "1.2rem", letterSpacing: "0.05em" }}>{dialogo.resultado}</b>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Envie para a pessoa. No próximo login ela será obrigada a criar uma senha nova.
              </p>
              <div className="row">
                <button className="btn" onClick={() => navigator.clipboard?.writeText(dialogo.resultado!).then(() => toast("Senha copiada."))}>
                  Copiar
                </button>
                {dialogo.u.whatsapp && (
                  <a
                    className="btn whatsapp"
                    target="_blank"
                    rel="noreferrer"
                    href={waLink(dialogo.u.whatsapp, `Olá, ${dialogo.u.nome.split(" ")[0]}! Sua senha provisória do painel da ${settings.nome} é: ${dialogo.resultado}\nEntre em ${appUrl("/admin/login")} e crie uma senha nova.`)}
                  >
                    <Icon name="whatsapp" size={16} /> Enviar por WhatsApp
                  </a>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                className="btn primary block"
                disabled={ocupado}
                onClick={async () => {
                  const r = await executar({ action: "reset_password", user_id: dialogo.u.id, modo: "provisoria" }, "Senha provisória gerada.");
                  if (r?.senha) setDialogo({ ...dialogo, resultado: r.senha });
                }}
              >
                Gerar senha provisória
              </button>
              <button
                className="btn block"
                disabled={ocupado}
                onClick={async () => {
                  const r = await executar(
                    { action: "reset_password", user_id: dialogo.u.id, modo: "email", redirect_to: redirectUrl("/admin/redefinir-senha") },
                    `Link de redefinição enviado para ${dialogo.u.email}.`,
                  );
                  if (r) setDialogo(null);
                }}
              >
                Enviar link por e-mail
              </button>
            </>
          )}
        </Modal>
      )}

      {dialogo && dialogo.tipo === "criar" && (
        <Modal
          title="Criar usuário"
          onClose={() => setDialogo(null)}
          footer={
            dialogo.criado ? (
              <button className="btn primary" onClick={() => setDialogo(null)}>
                Fechar
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => setDialogo(null)}>
                  Cancelar
                </button>
                <button
                  className="btn primary"
                  disabled={ocupado}
                  onClick={async () => {
                    if (dialogo.senha.length < 8) return toast("A senha provisória precisa ter pelo menos 8 caracteres.", "error");
                    const r = await executar(
                      { action: "create", nome: dialogo.nome, email: dialogo.email, whatsapp: dialogo.whatsapp.replace(/\D/g, ""), cargo: dialogo.cargo, permissoes: dialogo.permissoes, senha: dialogo.senha },
                      `Usuário ${dialogo.nome} criado.`,
                    );
                    if (r) setDialogo({ ...dialogo, criado: true });
                  }}
                >
                  Criar usuário
                </button>
              </>
            )
          }
        >
          {dialogo.criado ? (
            <>
              <div className="alert success">
                Usuário criado. Senha provisória: <b>{dialogo.senha}</b>
              </div>
              <p className="muted small" style={{ margin: 0 }}>No primeiro login a pessoa será obrigada a trocar a senha.</p>
              {dialogo.whatsapp && (
                <a
                  className="btn whatsapp"
                  target="_blank"
                  rel="noreferrer"
                  href={waLink(dialogo.whatsapp, `Olá, ${dialogo.nome.split(" ")[0]}! Seu acesso ao painel da ${settings.nome} foi criado.\nE-mail: ${dialogo.email}\nSenha provisória: ${dialogo.senha}\nEntre em ${appUrl("/admin/login")}`)}
                >
                  <Icon name="whatsapp" size={16} /> Enviar acesso por WhatsApp
                </a>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-2">
                <label className="field">
                  Nome
                  <input className="input" value={dialogo.nome} onChange={(e) => setDialogo({ ...dialogo, nome: e.target.value })} />
                </label>
                <label className="field">
                  E-mail
                  <input className="input" type="email" value={dialogo.email} onChange={(e) => setDialogo({ ...dialogo, email: e.target.value })} />
                </label>
                <label className="field">
                  WhatsApp (opcional)
                  <input className="input" inputMode="tel" value={dialogo.whatsapp} onChange={(e) => setDialogo({ ...dialogo, whatsapp: maskPhone(e.target.value) })} />
                </label>
                <label className="field">
                  Senha provisória
                  <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                    <input className="input" value={dialogo.senha} onChange={(e) => setDialogo({ ...dialogo, senha: e.target.value })} />
                    <button className="btn sm" type="button" onClick={() => setDialogo({ ...dialogo, senha: gerarSenha() })}>
                      Gerar
                    </button>
                  </div>
                </label>
              </div>
              <CargoEPermissoes cargo={dialogo.cargo} permissoes={dialogo.permissoes} onChange={(cargo, permissoes) => setDialogo({ ...dialogo, cargo, permissoes })} />
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
