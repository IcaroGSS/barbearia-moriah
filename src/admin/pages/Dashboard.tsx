import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, errorMessage } from "../../lib/supabase";
import { DIAS, MESES, addMonths, monthLabel, money, monthStart, parseISO, pctChange, todayISO } from "../../lib/format";
import { BarChart, HBars } from "../components/Charts";
import { Icon } from "../../components/Icon";
import { Empty, Spinner } from "../../components/ui";
import { AppointmentCard } from "./Agenda";
import { useAuth } from "../AuthContext";
import { can } from "../../lib/permissions";
import type { Appointment } from "../../lib/types";

type Metricas = {
  acessos: number;
  visitantes: number;
  agendamentos: number;
  faturamento: number;
  previsto: number;
  ticket_medio: number;
  conversao: number;
};

type Resumo = {
  mes: string;
  atual: Metricas;
  anterior: Metricas;
  acessos_por_dia: { dia: number; acessos: number }[];
  faturamento_6_meses: { mes: string; faturamento: number }[];
  servicos_top: { nome: string; quantidade: number; receita: number }[];
  por_hora: { hora: number; quantidade: number }[];
  por_dia_semana: { dia_semana: number; quantidade: number }[];
};

function Trend({ atual, anterior }: { atual: number; anterior: number }) {
  const p = pctChange(Number(atual), Number(anterior));
  if (p === null) return <span className="trend up" title="O mês anterior não teve registros">▲ novo</span>;
  if (Math.abs(p) < 0.05) return <span className="trend flat">= igual ao mês anterior</span>;
  const up = p > 0;
  return (
    <span className={`trend ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(p).toFixed(1).replace(".", ",")}% vs. mês anterior
    </span>
  );
}

function Stat({ label, valor, atual, anterior, hint }: { label: string; valor: string; atual: number; anterior: number; hint?: string }) {
  return (
    <div className="glass stat" title={hint}>
      <span className="label">{label}</span>
      <span className="value">{valor}</span>
      <Trend atual={atual} anterior={anterior} />
    </div>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const hoje = todayISO();
  const [mes, setMes] = useState(monthStart(hoje));
  const [r, setR] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [deHoje, setDeHoje] = useState<Appointment[]>([]);

  const carregar = useCallback(async () => {
    const [res, ag] = await Promise.all([
      supabase.rpc("dashboard_summary", { p_mes: mes }),
      supabase.from("appointments").select("*").eq("data", hoje).neq("status", "cancelado").order("hora_inicio"),
    ]);
    if (res.error) return setErro(errorMessage(res.error));
    setErro(null);
    setR(res.data as Resumo);
    setDeHoje((ag.data as Appointment[]) ?? []);
  }, [mes, hoje]);

  useEffect(() => {
    setR(null);
    carregar();
  }, [carregar]);

  const meses = Array.from({ length: 18 }, (_, i) => addMonths(monthStart(hoje), -i));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between">
        <label className="row small muted" style={{ gap: 8 }}>
          Mês
          <select className="input" style={{ width: 220 }} value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {can(profile, "agenda") && (
          <Link className="btn" to="/admin/agenda">
            <Icon name="agenda" /> Abrir agenda
          </Link>
        )}
      </div>

      {erro && <div className="alert error">{erro}</div>}
      {!r && !erro && <Spinner />}

      {r && (
        <>
          <div className="grid grid-4">
            <Stat label="Acessos ao site" valor={String(r.atual.acessos)} atual={r.atual.acessos} anterior={r.anterior.acessos} />
            <Stat label="Visitantes únicos" valor={String(r.atual.visitantes)} atual={r.atual.visitantes} anterior={r.anterior.visitantes} />
            <Stat label="Agendamentos" valor={String(r.atual.agendamentos)} atual={r.atual.agendamentos} anterior={r.anterior.agendamentos} hint="Agendamentos do mês, sem contar os cancelados" />
            <Stat label="Faturamento" valor={money(r.atual.faturamento)} atual={r.atual.faturamento} anterior={r.anterior.faturamento} hint="Somente atendimentos concluídos" />
            <Stat label="Faturamento previsto" valor={money(r.atual.previsto)} atual={r.atual.previsto} anterior={r.anterior.previsto} hint="Pendentes + confirmados" />
            <Stat label="Ticket médio" valor={money(r.atual.ticket_medio)} atual={r.atual.ticket_medio} anterior={r.anterior.ticket_medio} />
            <Stat
              label="Taxa de conversão"
              valor={`${String(r.atual.conversao).replace(".", ",")}%`}
              atual={r.atual.conversao}
              anterior={r.anterior.conversao}
              hint="Agendamentos ÷ visitantes únicos"
            />
          </div>

          <div className="grid grid-2">
            <section className="glass card">
              <h3>Acessos por dia</h3>
              <p className="muted small" style={{ marginTop: -6 }}>{monthLabel(r.mes)}</p>
              <BarChart
                ariaLabel="Acessos ao site por dia do mês"
                data={r.acessos_por_dia.map((d) => ({ label: String(d.dia), value: d.acessos, tip: `Dia ${d.dia}: ${d.acessos} acesso(s)` }))}
              />
            </section>
            <section className="glass card">
              <h3>Faturamento dos últimos 6 meses</h3>
              <p className="muted small" style={{ marginTop: -6 }}>Somente atendimentos concluídos</p>
              <BarChart
                ariaLabel="Faturamento mensal dos últimos 6 meses"
                data={r.faturamento_6_meses.map((m) => {
                  const d = parseISO(m.mes);
                  return { label: MESES[d.getMonth()].slice(0, 3), value: Number(m.faturamento), tip: `${monthLabel(m.mes)}: ${money(m.faturamento)}` };
                })}
              />
            </section>
          </div>

          <div className="grid grid-3">
            <section className="glass card">
              <h3>Serviços mais vendidos</h3>
              <HBars data={r.servicos_top.map((s) => ({ label: s.nome, value: s.quantidade, extra: money(s.receita) }))} format={(v) => `${v}x`} />
            </section>
            <section className="glass card">
              <h3>Horários de maior movimento</h3>
              <HBars
                data={[...r.por_hora].sort((a, b) => b.quantidade - a.quantidade).slice(0, 6).map((h) => ({ label: `${String(h.hora).padStart(2, "0")}h`, value: h.quantidade }))}
                format={(v) => `${v} agend.`}
              />
            </section>
            <section className="glass card">
              <h3>Dias de maior movimento</h3>
              <HBars
                data={[...r.por_dia_semana].sort((a, b) => b.quantidade - a.quantidade).map((d) => ({ label: DIAS[d.dia_semana], value: d.quantidade }))}
                format={(v) => `${v} agend.`}
              />
            </section>
          </div>

          <section className="glass card stack">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Agendamentos de hoje</h3>
              <span className="muted small">{deHoje.length} no total</span>
            </div>
            {deHoje.length === 0 && <Empty>Nenhum agendamento para hoje.</Empty>}
            {deHoje.map((a) => (
              <AppointmentCard key={a.id} a={a} onChange={carregar} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
