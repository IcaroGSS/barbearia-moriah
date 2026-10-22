import { useEffect, useMemo, useState } from "react";
import { Modal, useToast } from "../../components/ui";
import { errorMessage, supabase } from "../../lib/supabase";
import type { Appointment, AppointmentStatus, Service } from "../../lib/types";
import { STATUS_LABEL, hhmm, maskPhone, minutesToLabel, money, todayISO, fmtPhone } from "../../lib/format";

type Props = {
  appointment?: Appointment | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function AppointmentForm({ appointment, defaultDate, onClose, onSaved }: Props) {
  const toast = useToast();
  const editando = !!appointment;
  const [services, setServices] = useState<Service[]>([]);
  const [nome, setNome] = useState(appointment?.cliente_nome ?? "");
  const [whatsapp, setWhatsapp] = useState(appointment ? maskPhone(fmtPhone(appointment.cliente_whatsapp)) : "");
  const [ids, setIds] = useState<string[]>(appointment?.servicos.map((s) => s.id) ?? []);
  const [data, setData] = useState(appointment?.data ?? defaultDate ?? todayISO());
  const [hora, setHora] = useState(hhmm(appointment?.hora_inicio) || "");
  const [status, setStatus] = useState<AppointmentStatus>(appointment?.status ?? "confirmado");
  const [obs, setObs] = useState(appointment?.observacao ?? "");
  const [valor, setValor] = useState<string>(appointment ? String(appointment.valor_total) : "");
  const [slots, setSlots] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("services")
      .select("*")
      .order("ordem")
      .then(({ data }) => setServices(((data as Service[]) ?? []).map((s) => ({ ...s, preco: Number(s.preco) }))));
  }, []);

  const escolhidos = useMemo(() => ids.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[], [ids, services]);
  const duracao = escolhidos.reduce((t, s) => t + s.duracao_min, 0);
  const totalCalculado = escolhidos.reduce((t, s) => t + s.preco, 0);
  const servicosMudaram = editando && ids.join() !== appointment!.servicos.map((s) => s.id).join();

  useEffect(() => {
    if (!data || !duracao) return setSlots([]);
    supabase.rpc("get_available_slots", { p_data: data, p_duracao_min: duracao }).then(({ data: rows }) => {
      setSlots(((rows ?? []) as { hora: string }[]).map((r) => hhmm(r.hora)));
    });
  }, [data, duracao]);

  // Sugestão de valor acompanha os serviços, a não ser que a pessoa digite outro
  useEffect(() => {
    if (!editando || servicosMudaram) setValor(totalCalculado ? totalCalculado.toFixed(2) : "");
  }, [totalCalculado]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));

  const salvar = async () => {
    setErro(null);
    if (nome.trim().length < 2) return setErro("Informe o nome do cliente.");
    if (whatsapp.replace(/\D/g, "").length < 10) return setErro("Informe o WhatsApp com DDD.");
    if (!ids.length) return setErro("Escolha pelo menos um serviço.");
    if (!/^\d{2}:\d{2}$/.test(hora)) return setErro("Escolha o horário.");
    const valorNum = Number(String(valor).replace(",", "."));
    if (Number.isNaN(valorNum) || valorNum < 0) return setErro("Valor inválido.");

    setSalvando(true);
    const base = {
      cliente_nome: nome.trim(),
      cliente_whatsapp: whatsapp.replace(/\D/g, ""),
      data,
      hora_inicio: hora,
      status,
      observacao: obs.trim(),
      valor_total: valorNum,
    };
    let error;
    if (editando) {
      const mudouHorario = hora !== hhmm(appointment!.hora_inicio) || data !== appointment!.data;
      const payload: Record<string, unknown> = { ...base };
      if (servicosMudaram) payload.servicos = ids;
      // novo fim = início + duração atual dos serviços
      if (servicosMudaram || mudouHorario) {
        const [h, m] = hora.split(":").map(Number);
        const fim = h * 60 + m + (duracao || 30);
        payload.hora_fim = `${String(Math.floor(fim / 60) % 24).padStart(2, "0")}:${String(fim % 60).padStart(2, "0")}`;
      }
      ({ error } = await supabase.from("appointments").update(payload).eq("id", appointment!.id));
    } else {
      ({ error } = await supabase.from("appointments").insert({ ...base, servicos: ids, origem: "manual" }));
    }
    setSalvando(false);
    if (error) return setErro(errorMessage(error));
    toast(editando ? "Agendamento atualizado." : "Agendamento criado.");
    onSaved();
    onClose();
  };

  const horaNaLista = slots.includes(hora);

  return (
    <Modal
      title={editando ? "Editar agendamento" : "Novo agendamento"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      {erro && <div className="alert error">{erro}</div>}
      <div className="grid grid-2">
        <label className="field">
          Cliente
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="field">
          WhatsApp
          <input className="input" value={whatsapp} inputMode="tel" onChange={(e) => setWhatsapp(maskPhone(e.target.value))} />
        </label>
      </div>
      <div className="field">
        Serviços
        <div className="stack" style={{ gap: 6 }}>
          {services
            .filter((s) => s.ativo || ids.includes(s.id))
            .map((s) => (
              <label key={s.id} className={`choice ${ids.includes(s.id) ? "on" : ""}`} style={{ padding: "8px 12px" }}>
                <input type="checkbox" checked={ids.includes(s.id)} onChange={() => toggle(s.id)} />
                <span style={{ flex: 1 }}>
                  {s.nome} <span className="muted small">· {minutesToLabel(s.duracao_min)}</span>
                </span>
                <span>{money(s.preco)}</span>
              </label>
            ))}
        </div>
      </div>
      <div className="grid grid-2">
        <label className="field">
          Data
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="field">
          Horário {duracao ? <span className="small">({minutesToLabel(duracao)})</span> : null}
          <select className="input" value={horaNaLista ? hora : "__outro"} onChange={(e) => e.target.value !== "__outro" && setHora(e.target.value)}>
            <option value="__outro">{hora && !horaNaLista ? `${hora} (manual)` : "Escolha..."}</option>
            {slots.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Ou digite outro horário (encaixe)
        <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </label>
      <div className="grid grid-2">
        <label className="field">
          Status
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
            {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Valor (R$)
          <input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Observação
        <textarea className="input" value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>
    </Modal>
  );
}
