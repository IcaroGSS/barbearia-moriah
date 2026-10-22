import { useCallback, useEffect, useState } from "react";
import { errorMessage, supabase } from "../../lib/supabase";
import type { BlockMotivo, BlockedDate, BusinessHour } from "../../lib/types";
import { DIAS, MOTIVO_LABEL, fmtDateLong, hhmm, todayISO } from "../../lib/format";
import { Empty, Spinner, confirmAction, useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useSite } from "../../site/SiteContext";

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function Disponibilidade() {
  const toast = useToast();
  const site = useSite();
  const [horas, setHoras] = useState<BusinessHour[] | null>(null);
  const [intervalo, setIntervalo] = useState(site.settings.intervalo_min);
  const [bloqueios, setBloqueios] = useState<BlockedDate[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [novo, setNovo] = useState({ data: todayISO(), dia_inteiro: true, hora_inicio: "12:00", hora_fim: "14:00", motivo: "folga" as BlockMotivo, observacao: "" });

  const carregar = useCallback(async () => {
    const [h, b, s] = await Promise.all([
      supabase.from("business_hours").select("*").order("dia_semana"),
      supabase.from("blocked_dates").select("*").gte("data", todayISO()).order("data").order("hora_inicio"),
      supabase.from("settings").select("intervalo_min").eq("id", 1).maybeSingle(),
    ]);
    setHoras(((h.data as BusinessHour[]) ?? []).map((x) => ({ ...x, abertura: hhmm(x.abertura), fechamento: hhmm(x.fechamento), almoco_inicio: hhmm(x.almoco_inicio) || null, almoco_fim: hhmm(x.almoco_fim) || null })));
    setBloqueios((b.data as BlockedDate[]) ?? []);
    if (s.data) setIntervalo(s.data.intervalo_min);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const editar = (dia: number, campo: keyof BusinessHour, valor: unknown) =>
    setHoras((hs) => hs!.map((h) => (h.dia_semana === dia ? { ...h, [campo]: valor } : h)));

  const salvarHorarios = async () => {
    if (!horas) return;
    for (const h of horas) {
      if (h.aberto && h.abertura >= h.fechamento) return toast(`${DIAS[h.dia_semana]}: a abertura precisa ser antes do fechamento.`, "error");
      if (!!h.almoco_inicio !== !!h.almoco_fim || (h.almoco_inicio && h.almoco_fim && h.almoco_inicio >= h.almoco_fim))
        return toast(`${DIAS[h.dia_semana]}: confira o intervalo de almoço.`, "error");
    }
    setSalvando(true);
    const atuais = await supabase.from("business_hours").select("*");
    const antes = new Map(((atuais.data as BusinessHour[]) ?? []).map((h) => [h.dia_semana, h]));
    for (const h of horas) {
      const a = antes.get(h.dia_semana);
      const igual =
        a && a.aberto === h.aberto && hhmm(a.abertura) === h.abertura && hhmm(a.fechamento) === h.fechamento && (hhmm(a.almoco_inicio) || null) === h.almoco_inicio && (hhmm(a.almoco_fim) || null) === h.almoco_fim;
      if (igual) continue;
      const { error } = await supabase
        .from("business_hours")
        .update({ aberto: h.aberto, abertura: h.abertura, fechamento: h.fechamento, almoco_inicio: h.almoco_inicio || null, almoco_fim: h.almoco_fim || null })
        .eq("dia_semana", h.dia_semana);
      if (error) {
        setSalvando(false);
        return toast(errorMessage(error), "error");
      }
    }
    if (intervalo !== site.settings.intervalo_min) {
      const { error } = await supabase.from("settings").update({ intervalo_min: intervalo }).eq("id", 1);
      if (error) {
        setSalvando(false);
        return toast(errorMessage(error), "error");
      }
    }
    setSalvando(false);
    toast("Horários salvos.");
    site.reload();
  };

  const bloquear = async () => {
    if (!novo.dia_inteiro && novo.hora_inicio >= novo.hora_fim) return toast("O início do bloqueio precisa ser antes do fim.", "error");
    const { error } = await supabase.from("blocked_dates").insert({
      data: novo.data,
      dia_inteiro: novo.dia_inteiro,
      hora_inicio: novo.dia_inteiro ? null : novo.hora_inicio,
      hora_fim: novo.dia_inteiro ? null : novo.hora_fim,
      motivo: novo.motivo,
      observacao: novo.observacao.trim(),
    });
    if (error) return toast(errorMessage(error), "error");
    toast("Data bloqueada.");
    setNovo((n) => ({ ...n, observacao: "" }));
    carregar();
    site.reload();
  };

  const remover = async (b: BlockedDate) => {
    if (!confirmAction(`Remover o bloqueio de ${fmtDateLong(b.data)}?`)) return;
    const { error } = await supabase.from("blocked_dates").delete().eq("id", b.id);
    if (error) return toast(errorMessage(error), "error");
    toast("Bloqueio removido.");
    carregar();
    site.reload();
  };

  if (!horas) return <Spinner />;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="glass card stack">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Horário de funcionamento</h3>
          <label className="row small muted" style={{ gap: 8 }}>
            Intervalo entre horários
            <select className="input" style={{ width: 110 }} value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
              {[15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Aberto</th>
                <th>Abertura</th>
                <th>Fechamento</th>
                <th>Almoço início</th>
                <th>Almoço fim</th>
              </tr>
            </thead>
            <tbody>
              {ORDEM_DIAS.map((d) => {
                const h = horas.find((x) => x.dia_semana === d)!;
                if (!h) return null;
                return (
                  <tr key={d} style={{ opacity: h.aberto ? 1 : 0.6 }}>
                    <td>
                      <b>{DIAS[d]}</b>
                    </td>
                    <td>
                      <label className="check">
                        <input type="checkbox" checked={h.aberto} onChange={(e) => editar(d, "aberto", e.target.checked)} />
                        {h.aberto ? "Aberto" : "Fechado"}
                      </label>
                    </td>
                    <td>
                      <input className="input" type="time" value={h.abertura} disabled={!h.aberto} onChange={(e) => editar(d, "abertura", e.target.value)} />
                    </td>
                    <td>
                      <input className="input" type="time" value={h.fechamento} disabled={!h.aberto} onChange={(e) => editar(d, "fechamento", e.target.value)} />
                    </td>
                    <td>
                      <input className="input" type="time" value={h.almoco_inicio ?? ""} disabled={!h.aberto} onChange={(e) => editar(d, "almoco_inicio", e.target.value || null)} />
                    </td>
                    <td>
                      <input className="input" type="time" value={h.almoco_fim ?? ""} disabled={!h.aberto} onChange={(e) => editar(d, "almoco_fim", e.target.value || null)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Deixe o almoço em branco se não houver pausa.</p>
        <div>
          <button className="btn primary" disabled={salvando} onClick={salvarHorarios}>
            {salvando ? "Salvando..." : "Salvar horários"}
          </button>
        </div>
      </section>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="glass card stack">
          <h3 style={{ margin: 0 }}>Bloquear data</h3>
          <label className="field">
            Data
            <input className="input" type="date" min={todayISO()} value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
          </label>
          <div className="tabs">
            <button className={novo.dia_inteiro ? "active" : ""} onClick={() => setNovo({ ...novo, dia_inteiro: true })}>
              Dia inteiro
            </button>
            <button className={!novo.dia_inteiro ? "active" : ""} onClick={() => setNovo({ ...novo, dia_inteiro: false })}>
              Só um período
            </button>
          </div>
          {!novo.dia_inteiro && (
            <div className="grid grid-2">
              <label className="field">
                Das
                <input className="input" type="time" value={novo.hora_inicio} onChange={(e) => setNovo({ ...novo, hora_inicio: e.target.value })} />
              </label>
              <label className="field">
                Até
                <input className="input" type="time" value={novo.hora_fim} onChange={(e) => setNovo({ ...novo, hora_fim: e.target.value })} />
              </label>
            </div>
          )}
          <label className="field">
            Motivo
            <select className="input" value={novo.motivo} onChange={(e) => setNovo({ ...novo, motivo: e.target.value as BlockMotivo })}>
              {(Object.keys(MOTIVO_LABEL) as BlockMotivo[]).map((m) => (
                <option key={m} value={m}>
                  {MOTIVO_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Observação (opcional)
            <input className="input" value={novo.observacao} maxLength={200} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} />
          </label>
          <button className="btn primary" onClick={bloquear}>
            <Icon name="lock" /> Bloquear
          </button>
          <p className="muted small" style={{ margin: 0 }}>Agendamentos que já existem nessa data continuam na agenda; o bloqueio impede novos.</p>
        </section>

        <section className="glass card stack">
          <h3 style={{ margin: 0 }}>Próximos bloqueios</h3>
          {bloqueios.length === 0 && <Empty>Nenhum bloqueio futuro.</Empty>}
          {bloqueios.map((b) => (
            <div key={b.id} className="row between appt" style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <b>{fmtDateLong(b.data)}</b>
                <div className="muted small">
                  {b.dia_inteiro ? "Dia inteiro" : `${hhmm(b.hora_inicio)} – ${hhmm(b.hora_fim)}`} · {MOTIVO_LABEL[b.motivo]}
                  {b.observacao ? ` · ${b.observacao}` : ""}
                </div>
              </div>
              <button className="btn sm danger" onClick={() => remover(b)}>
                Remover
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
