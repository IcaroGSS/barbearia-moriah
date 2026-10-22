import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { errorMessage, supabase } from "../../lib/supabase";
import type { Appointment, AppointmentStatus } from "../../lib/types";
import { DIAS_CURTOS, STATUS_LABEL, addDays, fmtDate, fmtDateLong, fmtPhone, hhmm, money, startOfWeek, todayISO } from "../../lib/format";
import { clientMessage, waLink } from "../../lib/whatsapp";
import { Icon } from "../../components/Icon";
import { Empty, Modal, Spinner, StatusBadge, confirmAction, useToast } from "../../components/ui";
import { AppointmentForm } from "../components/AppointmentForm";
import { useAuth } from "../AuthContext";
import { can } from "../../lib/permissions";
import { useSite } from "../../site/SiteContext";

type View = "dia" | "semana" | "lista";

const nomesServicos = (a: Appointment) => a.servicos.map((s) => s.nome).join(" + ");

export function AppointmentCard({ a, onChange, onEdit }: { a: Appointment; onChange: () => void; onEdit?: (a: Appointment) => void }) {
  const { profile } = useAuth();
  const { settings } = useSite();
  const toast = useToast();
  const [wa, setWa] = useState(false);
  const gerencia = can(profile, "agenda");

  const mudar = async (status: AppointmentStatus, pergunta?: string) => {
    if (pergunta && !confirmAction(pergunta)) return;
    const { error } = await supabase.from("appointments").update({ status }).eq("id", a.id);
    if (error) return toast(errorMessage(error), "error");
    toast(`Agendamento ${STATUS_LABEL[status].toLowerCase()}.`);
    onChange();
  };

  const excluir = async () => {
    if (!confirmAction(`Excluir o agendamento de ${a.cliente_nome}? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("appointments").delete().eq("id", a.id);
    if (error) return toast(errorMessage(error), "error");
    toast("Agendamento excluído.");
    onChange();
  };

  return (
    <div className={`appt s-${a.status}`}>
      <div>
        <div className="time">{hhmm(a.hora_inicio)}</div>
        <div className="muted small">até {hhmm(a.hora_fim)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <b>{a.cliente_nome}</b>
          <StatusBadge status={a.status} />
          {a.origem === "manual" && <span className="muted small">manual</span>}
        </div>
        <div className="muted small">
          {nomesServicos(a)} · {money(a.valor_total)} · {fmtPhone(a.cliente_whatsapp)}
        </div>
        {a.observacao && <div className="small">“{a.observacao}”</div>}
      </div>
      <div className="actions">
        <button className="btn whatsapp sm" onClick={() => setWa(true)} title="Chamar no WhatsApp">
          <Icon name="whatsapp" size={16} /> WhatsApp
        </button>
        {gerencia && a.status === "pendente" && (
          <button className="btn sm" onClick={() => mudar("confirmado")}>
            <Icon name="check" size={16} /> Confirmar
          </button>
        )}
        {gerencia && (a.status === "pendente" || a.status === "confirmado") && (
          <>
            <button className="btn sm" onClick={() => mudar("concluido")}>
              Concluir
            </button>
            <button className="btn sm" onClick={() => mudar("nao_compareceu", `Marcar falta de ${a.cliente_nome}?`)}>
              Falta
            </button>
            <button className="btn sm danger" onClick={() => mudar("cancelado", `Cancelar o agendamento de ${a.cliente_nome}?`)}>
              Cancelar
            </button>
          </>
        )}
        {gerencia && onEdit && (
          <button className="btn sm ghost" onClick={() => onEdit(a)} title="Editar">
            <Icon name="edit" size={16} />
          </button>
        )}
        {gerencia && (
          <button className="btn sm ghost" onClick={excluir} title="Excluir">
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      {wa && (
        <Modal title={`WhatsApp de ${a.cliente_nome}`} onClose={() => setWa(false)}>
          <p className="muted" style={{ margin: 0 }}>
            Escolha a mensagem. Ela abre pronta no WhatsApp para você revisar e enviar.
          </p>
          <a className="btn whatsapp block" target="_blank" rel="noreferrer" href={waLink(a.cliente_whatsapp, clientMessage("confirmacao", a, settings.nome))} onClick={() => setWa(false)}>
            Mensagem de confirmação
          </a>
          <a className="btn block" target="_blank" rel="noreferrer" href={waLink(a.cliente_whatsapp, clientMessage("lembrete", a, settings.nome))} onClick={() => setWa(false)}>
            Mensagem de lembrete
          </a>
          <a className="btn ghost block" target="_blank" rel="noreferrer" href={waLink(a.cliente_whatsapp, "")} onClick={() => setWa(false)}>
            Conversa em branco
          </a>
        </Modal>
      )}
    </div>
  );
}

export function Agenda() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const hoje = todayISO();
  const [view, setView] = useState<View>((params.get("modo") as View) || "dia");
  const [dia, setDia] = useState(params.get("data") || hoje);
  const [ate, setAte] = useState(addDays(hoje, 30));
  const [filtro, setFiltro] = useState<AppointmentStatus | "todos" | "ativos">("ativos");
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Appointment[] | null>(null);
  const [form, setForm] = useState<{ a: Appointment | null } | null>(params.get("novo") ? { a: null } : null);
  const podeVer = can(profile, "agenda");
  const podeCriar = can(profile, "agendamento_manual");

  const intervalo = useMemo((): [string, string] => {
    if (view === "dia") return [dia, dia];
    if (view === "semana") {
      const ini = startOfWeek(dia);
      return [ini, addDays(ini, 6)];
    }
    return [dia, ate];
  }, [view, dia, ate]);

  const carregar = useCallback(async () => {
    if (!podeVer) return;
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .gte("data", intervalo[0])
      .lte("data", intervalo[1])
      .order("data")
      .order("hora_inicio");
    if (!error) setLista((data as Appointment[]) ?? []);
  }, [intervalo, podeVer]);

  useEffect(() => {
    setLista(null);
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!podeVer) return;
    const canal = supabase
      .channel("agenda")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar, podeVer]);

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("modo", view);
    p.set("data", dia);
    setParams(p, { replace: true });
  }, [view, dia, setParams]);

  const filtrados = (lista ?? []).filter((a) => {
    if (filtro === "ativos" && (a.status === "cancelado" || a.status === "nao_compareceu")) return false;
    if (filtro !== "todos" && filtro !== "ativos" && a.status !== filtro) return false;
    if (busca) {
      const q = busca.toLowerCase();
      const dig = busca.replace(/\D/g, "");
      if (!a.cliente_nome.toLowerCase().includes(q) && !(dig && a.cliente_whatsapp.includes(dig))) return false;
    }
    return true;
  });

  const passo = view === "semana" ? 7 : 1;
  const totalDia = filtrados.filter((a) => a.status !== "cancelado").reduce((t, a) => t + Number(a.valor_total), 0);

  if (!podeVer) {
    return (
      <div className="glass card stack" style={{ maxWidth: 520 }}>
        <p style={{ margin: 0 }}>Você pode registrar agendamentos de clientes que ligaram ou chegaram na hora.</p>
        <button className="btn primary" onClick={() => setForm({ a: null })}>
          <Icon name="plus" /> Novo agendamento
        </button>
        {form && <AppointmentForm onClose={() => setForm(null)} onSaved={() => {}} />}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="glass card row between">
        <div className="tabs">
          {(["dia", "semana", "lista"] as View[]).map((v) => (
            <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
              {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Lista"}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {view !== "lista" && (
            <button className="icon-btn" onClick={() => setDia(addDays(dia, -passo))} aria-label="Anterior">
              <Icon name="chevronLeft" />
            </button>
          )}
          <input className="input" type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} style={{ width: 160 }} />
          {view === "lista" && (
            <>
              <span className="muted">até</span>
              <input className="input" type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} style={{ width: 160 }} />
            </>
          )}
          {view !== "lista" && (
            <button className="icon-btn" onClick={() => setDia(addDays(dia, passo))} aria-label="Próximo">
              <Icon name="chevronRight" />
            </button>
          )}
          <button className="btn sm" onClick={() => setDia(hoje)}>
            Hoje
          </button>
        </div>
        {podeCriar && (
          <button className="btn primary" onClick={() => setForm({ a: null })}>
            <Icon name="plus" /> Agendamento manual
          </button>
        )}
      </div>

      <div className="row">
        <select className="input" style={{ width: 200 }} value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="ativos">Ativos e concluídos</option>
          <option value="todos">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar cliente ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="spacer" />
        <span className="muted small">
          {filtrados.length} agendamento(s) · {money(totalDia)}
        </span>
      </div>

      {!lista && <Spinner />}

      {lista && view === "dia" && (
        <div className="glass card stack">
          <h3 style={{ margin: 0 }}>{fmtDateLong(dia)}</h3>
          {filtrados.length === 0 && <Empty>Nenhum agendamento neste dia.</Empty>}
          {filtrados.map((a) => (
            <AppointmentCard key={a.id} a={a} onChange={carregar} onEdit={(x) => setForm({ a: x })} />
          ))}
        </div>
      )}

      {lista && view === "semana" && (
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(intervalo[0], i)).map((d, i) => {
            const doDia = filtrados.filter((a) => a.data === d);
            return (
              <div key={d} className="glass day" style={d === hoje ? { borderColor: "var(--accent)" } : undefined}>
                <button className="btn ghost sm" style={{ justifyContent: "flex-start", padding: 0 }} onClick={() => { setDia(d); setView("dia"); }}>
                  <b>
                    {DIAS_CURTOS[i]} {fmtDate(d)}
                  </b>
                </button>
                {doDia.length === 0 && <span className="muted small">Livre</span>}
                {doDia.map((a) => (
                  <div key={a.id} className={`mini s-${a.status}`} onClick={() => setForm({ a })} title={`${STATUS_LABEL[a.status]} · ${money(a.valor_total)}`}>
                    <b>{hhmm(a.hora_inicio)}</b> {a.cliente_nome}
                    <div className="muted">{nomesServicos(a)}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {lista && view === "lista" && (
        <div className="glass card stack">
          {filtrados.length === 0 && <Empty>Nenhum agendamento no período.</Empty>}
          {Array.from(new Set(filtrados.map((a) => a.data))).map((d) => (
            <div key={d} className="stack" style={{ gap: 8 }}>
              <h3 style={{ margin: "8px 0 0" }}>{fmtDateLong(d)}</h3>
              {filtrados
                .filter((a) => a.data === d)
                .map((a) => (
                  <AppointmentCard key={a.id} a={a} onChange={carregar} onEdit={(x) => setForm({ a: x })} />
                ))}
            </div>
          ))}
        </div>
      )}

      {form && <AppointmentForm appointment={form.a} defaultDate={dia} onClose={() => setForm(null)} onSaved={carregar} />}
    </div>
  );
}
