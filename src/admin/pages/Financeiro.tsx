import { useCallback, useEffect, useState } from "react";
import { errorMessage, supabase } from "../../lib/supabase";
import { STATUS_LABEL, addDays, addMonths, fmtDate, fmtPhone, monthLabel, monthStart, money, todayISO } from "../../lib/format";
import type { AppointmentStatus } from "../../lib/types";
import { Empty, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { HBars } from "../components/Charts";

type Relatorio = {
  resumo: { faturamento: number; previsto: number; atendimentos: number; cancelamentos: number; faltas: number; total: number };
  por_servico: { nome: string; quantidade: number; receita: number }[];
  por_mes: { mes: string; faturamento: number | null; atendimentos: number }[];
  linhas: { data: string; hora_inicio: string; cliente_nome: string; cliente_whatsapp: string; servicos: string; valor_total: number; status: AppointmentStatus; origem: string }[];
};

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function Financeiro() {
  const hoje = todayISO();
  const [de, setDe] = useState(monthStart(hoje));
  const [ate, setAte] = useState(addDays(addMonths(hoje, 1), -1));
  const [r, setR] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setR(null);
    const { data, error } = await supabase.rpc("finance_report", { p_de: de, p_ate: ate });
    if (error) return setErro(errorMessage(error));
    setErro(null);
    setR(data as Relatorio);
  }, [de, ate]);

  useEffect(() => {
    if (de <= ate) carregar();
  }, [carregar, de, ate]);

  const preset = (k: string) => {
    if (k === "mes") {
      setDe(monthStart(hoje));
      setAte(addDays(addMonths(hoje, 1), -1));
    } else if (k === "anterior") {
      setDe(addMonths(hoje, -1));
      setAte(addDays(monthStart(hoje), -1));
    } else if (k === "30") {
      setDe(addDays(hoje, -29));
      setAte(hoje);
    } else if (k === "ano") {
      setDe(`${hoje.slice(0, 4)}-01-01`);
      setAte(`${hoje.slice(0, 4)}-12-31`);
    }
  };

  const exportar = () => {
    if (!r) return;
    const cab = ["Data", "Hora", "Cliente", "WhatsApp", "Serviços", "Valor", "Status", "Origem"];
    const linhas = r.linhas.map((l) => [
      l.data.split("-").reverse().join("/"),
      l.hora_inicio,
      l.cliente_nome,
      fmtPhone(l.cliente_whatsapp),
      l.servicos,
      Number(l.valor_total).toFixed(2).replace(".", ","),
      STATUS_LABEL[l.status],
      l.origem === "site" ? "Site" : "Manual",
    ]);
    const csv = "﻿" + [cab, ...linhas].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="glass card row between">
        <div className="row">
          <label className="row small muted" style={{ gap: 6 }}>
            De
            <input className="input" type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} style={{ width: 160 }} />
          </label>
          <label className="row small muted" style={{ gap: 6 }}>
            até
            <input className="input" type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} style={{ width: 160 }} />
          </label>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => preset("mes")}>Este mês</button>
          <button className="btn sm" onClick={() => preset("anterior")}>Mês passado</button>
          <button className="btn sm" onClick={() => preset("30")}>30 dias</button>
          <button className="btn sm" onClick={() => preset("ano")}>Este ano</button>
        </div>
        <button className="btn primary" disabled={!r || !r.linhas.length} onClick={exportar}>
          <Icon name="download" /> Exportar CSV
        </button>
      </div>

      {de > ate && <div className="alert warn">A data inicial precisa ser antes da final.</div>}
      {erro && <div className="alert error">{erro}</div>}
      {!r && !erro && de <= ate && <Spinner />}

      {r && (
        <>
          <div className="grid grid-4">
            <div className="glass stat">
              <span className="label">Faturamento (concluídos)</span>
              <span className="value">{money(r.resumo.faturamento)}</span>
            </div>
            <div className="glass stat">
              <span className="label">Previsto (pendentes + confirmados)</span>
              <span className="value">{money(r.resumo.previsto)}</span>
            </div>
            <div className="glass stat">
              <span className="label">Atendimentos</span>
              <span className="value">{r.resumo.atendimentos}</span>
            </div>
            <div className="glass stat">
              <span className="label">Cancelamentos</span>
              <span className="value">{r.resumo.cancelamentos}</span>
            </div>
            <div className="glass stat">
              <span className="label">Faltas</span>
              <span className="value">{r.resumo.faltas}</span>
            </div>
          </div>

          <div className="grid grid-2" style={{ alignItems: "start" }}>
            <section className="glass card">
              <h3>Por serviço</h3>
              <HBars data={r.por_servico.map((s) => ({ label: s.nome, value: Number(s.receita), extra: `${s.quantidade}x` }))} format={money} />
            </section>
            <section className="glass card">
              <h3>Por mês</h3>
              {r.por_mes.length === 0 ? (
                <Empty>Sem dados.</Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Atendimentos</th>
                      <th style={{ textAlign: "right" }}>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.por_mes.map((m) => (
                      <tr key={m.mes}>
                        <td>{monthLabel(m.mes)}</td>
                        <td>{m.atendimentos}</td>
                        <td style={{ textAlign: "right" }}>{money(m.faturamento ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="glass card">
            <h3>Agendamentos do período</h3>
            {r.linhas.length === 0 ? (
              <Empty>Nenhum agendamento no período.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th>Serviços</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.linhas.map((l, i) => (
                      <tr key={i}>
                        <td>
                          {fmtDate(l.data)} {l.hora_inicio}
                        </td>
                        <td>{l.cliente_nome}</td>
                        <td>{l.servicos}</td>
                        <td>
                          <span className={`badge st-${l.status}`}>{STATUS_LABEL[l.status]}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>{money(l.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
