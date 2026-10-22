import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSite } from "../SiteContext";
import { errorMessage, supabase } from "../../lib/supabase";
import {
  DIAS_CURTOS,
  MESES,
  addDays,
  fmtDateLong,
  hhmm,
  maskPhone,
  minutesToLabel,
  money,
  parseISO,
  toISO,
  todayISO,
} from "../../lib/format";
import { bookingMessage, waLink } from "../../lib/whatsapp";
import { Icon } from "../../components/Icon";
import type { ServiceSnapshot } from "../../lib/types";

const DIAS_A_FRENTE = 60;

type Resultado = { id: string; data: string; hora_inicio: string; hora_fim: string; valor_total: number; servicos: ServiceSnapshot[] };

export function Booking() {
  const { settings, services, hours, blocked, fromDb, loading } = useSite();
  const hoje = todayISO(settings.fuso_horario);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [mesVisivel, setMesVisivel] = useState(hoje.slice(0, 7));
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ r: Resultado; link: string } | null>(null);
  const [recarregar, setRecarregar] = useState(0);

  const escolhidos = useMemo(() => services.filter((s) => selecionados.includes(s.id)), [services, selecionados]);
  const duracao = escolhidos.reduce((t, s) => t + s.duracao_min, 0);
  const total = escolhidos.reduce((t, s) => t + Number(s.preco), 0);
  const limite = addDays(hoje, DIAS_A_FRENTE);

  // Dias fechados ou bloqueados o dia inteiro não aparecem como disponíveis
  const diaDisponivel = (iso: string) => {
    if (iso < hoje || iso > limite) return false;
    const h = hours.find((x) => x.dia_semana === parseISO(iso).getDay());
    if (!h || !h.aberto) return false;
    return !blocked.some((b) => b.data === iso && b.dia_inteiro);
  };

  useEffect(() => {
    setHora(null);
    if (!data || !duracao) {
      setHorarios(null);
      return;
    }
    let vivo = true;
    setCarregandoHorarios(true);
    supabase
      .rpc("get_available_slots", { p_data: data, p_duracao_min: duracao })
      .then(({ data: rows, error }) => {
        if (!vivo) return;
        setCarregandoHorarios(false);
        if (error) {
          setErro(errorMessage(error));
          setHorarios([]);
          return;
        }
        setHorarios(((rows ?? []) as { hora: string }[]).map((r) => hhmm(r.hora)));
      });
    return () => {
      vivo = false;
    };
  }, [data, duracao, recarregar]);

  const toggle = (id: string) => setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const confirmar = async () => {
    setErro(null);
    const digitos = whatsapp.replace(/\D/g, "");
    if (nome.trim().length < 2) return setErro("Informe seu nome.");
    if (digitos.length < 10) return setErro("Informe seu WhatsApp com DDD.");
    if (!data || !hora || !selecionados.length) return setErro("Escolha serviço, data e horário.");

    setEnviando(true);
    // 1) salva o agendamento como "pendente"
    const { data: r, error } = await supabase.rpc("create_public_appointment", {
      p_nome: nome.trim(),
      p_whatsapp: digitos,
      p_servicos: selecionados,
      p_data: data,
      p_hora: hora,
      p_observacao: obs.trim(),
    });
    setEnviando(false);
    if (error) {
      setErro(errorMessage(error));
      // o horário pode ter sido ocupado por outra pessoa: recarrega a lista
      setRecarregar((n) => n + 1);
      return;
    }
    const res = r as Resultado;
    // 2) só depois abre o WhatsApp com a mensagem pronta
    const link = waLink(
      settings.whatsapp,
      bookingMessage({ barbearia: settings.nome, nome: nome.trim(), servicos: res.servicos, data: res.data, hora: res.hora_inicio, total: Number(res.valor_total), observacao: obs.trim() }),
    );
    setResultado({ r: res, link });
    window.location.href = link;
  };

  if (resultado) {
    return (
      <main className="container section">
        <div className="glass card center" style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 44 }}>✂️</div>
          <h2>Agendamento enviado!</h2>
          <p className="muted">
            {fmtDateLong(resultado.r.data)} às {resultado.r.hora_inicio}. Seu horário fica reservado como <b>pendente</b> até a
            barbearia confirmar pelo WhatsApp.
          </p>
          <div className="stack" style={{ marginTop: 16 }}>
            <a className="btn whatsapp block" href={resultado.link}>
              <Icon name="whatsapp" /> Abrir o WhatsApp
            </a>
            <Link className="btn block" to="/">
              Voltar ao início
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [ano, mes] = mesVisivel.split("-").map(Number);
  const primeiro = new Date(ano, mes - 1, 1);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const celulas: (string | null)[] = [
    ...Array(primeiro.getDay()).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => toISO(new Date(ano, mes - 1, i + 1))),
  ];
  const podeVoltar = mesVisivel > hoje.slice(0, 7);
  const podeAvancar = mesVisivel < limite.slice(0, 7);
  const mudarMes = (n: number) => {
    const d = new Date(ano, mes - 1 + n, 1);
    setMesVisivel(toISO(d).slice(0, 7));
  };

  const passo = !selecionados.length ? 1 : !data ? 2 : !hora ? 3 : 4;

  return (
    <main className="container section" style={{ paddingTop: 40 }}>
      <div className="eyebrow">Agendamento</div>
      <h1 className="section-title">{settings.textos.agendar_titulo}</h1>
      <p className="muted">{settings.textos.agendar_texto}</p>

      {!loading && !fromDb && (
        <div className="alert warn" style={{ margin: "16px 0" }}>
          O agendamento online está temporariamente indisponível. Fale com a gente pelo WhatsApp.
        </div>
      )}

      <div className="steps">
        {["Serviços", "Data", "Horário", "Seus dados"].map((s, i) => (
          <span key={s} className={passo >= i + 1 ? "on" : ""}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="stack">
            <section className="glass card stack">
              <h3>1. Escolha os serviços</h3>
              {loading && <p className="muted">Carregando serviços...</p>}
              {services.map((s) => (
                <label key={s.id} className={`choice ${selecionados.includes(s.id) ? "on" : ""}`}>
                  <input type="checkbox" checked={selecionados.includes(s.id)} onChange={() => toggle(s.id)} />
                  <span style={{ flex: 1 }}>
                    <b>{s.nome}</b>
                    <br />
                    <span className="muted small">{minutesToLabel(s.duracao_min)}</span>
                  </span>
                  <b>{money(s.preco)}</b>
                </label>
              ))}
            </section>

            <section className="glass card stack">
              <div className="row between">
                <h3 style={{ margin: 0 }}>2. Escolha o dia</h3>
                <div className="row" style={{ gap: 6 }}>
                  <button className="icon-btn" disabled={!podeVoltar} onClick={() => mudarMes(-1)} aria-label="Mês anterior">
                    <Icon name="chevronLeft" />
                  </button>
                  <b style={{ minWidth: 120, textAlign: "center", textTransform: "capitalize" }}>
                    {MESES[mes - 1]} {ano}
                  </b>
                  <button className="icon-btn" disabled={!podeAvancar} onClick={() => mudarMes(1)} aria-label="Próximo mês">
                    <Icon name="chevronRight" />
                  </button>
                </div>
              </div>
              <div className="calendar">
                {DIAS_CURTOS.map((d) => (
                  <div key={d} className="dow">
                    {d}
                  </div>
                ))}
                {celulas.map((iso, i) =>
                  iso ? (
                    <button
                      key={iso}
                      disabled={!diaDisponivel(iso) || !selecionados.length}
                      className={`${data === iso ? "on" : ""} ${iso === hoje ? "today" : ""}`}
                      onClick={() => setData(iso)}
                      title={!selecionados.length ? "Escolha um serviço primeiro" : undefined}
                    >
                      {Number(iso.slice(8))}
                    </button>
                  ) : (
                    <span key={`v${i}`} />
                  ),
                )}
              </div>
              {!selecionados.length && <p className="muted small">Escolha pelo menos um serviço para ver os dias.</p>}
            </section>
          </div>

          <div className="stack summary">
            <section className="glass card stack">
              <h3>3. Escolha o horário</h3>
              {!data && <p className="muted">Selecione um dia no calendário.</p>}
              {data && carregandoHorarios && <p className="muted">Buscando horários livres...</p>}
              {data && !carregandoHorarios && horarios && horarios.length === 0 && (
                <p className="muted">Não há horários livres nesse dia para {minutesToLabel(duracao)}. Tente outro dia.</p>
              )}
              {data && !carregandoHorarios && horarios && horarios.length > 0 && (
                <>
                  <p className="muted small" style={{ margin: 0 }}>
                    {fmtDateLong(data)} · duração {minutesToLabel(duracao)}
                  </p>
                  <div className="slots">
                    {horarios.map((h) => (
                      <button key={h} className={hora === h ? "on" : ""} onClick={() => setHora(h)}>
                        {h}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="glass card stack">
              <h3>4. Seus dados</h3>
              <label className="field">
                Nome
                <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120} />
              </label>
              <label className="field">
                WhatsApp
                <input
                  className="input"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 98765-4321"
                />
              </label>
              <label className="field">
                Observação (opcional)
                <textarea className="input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} />
              </label>

              <div className="alert">
                <div className="row between">
                  <span className="muted">Serviços</span>
                  <b>{escolhidos.map((s) => s.nome).join(" + ") || "—"}</b>
                </div>
                <div className="row between">
                  <span className="muted">Quando</span>
                  <b>{data && hora ? `${fmtDateLong(data)}, ${hora}` : "—"}</b>
                </div>
                <div className="row between">
                  <span className="muted">Total</span>
                  <b style={{ color: "var(--accent-2)", fontSize: "1.2rem" }}>{money(total)}</b>
                </div>
              </div>

              {erro && <div className="alert error">{erro}</div>}
              <button className="btn whatsapp block" disabled={enviando || !hora || !fromDb} onClick={confirmar}>
                <Icon name="whatsapp" /> {enviando ? "Salvando..." : "Confirmar pelo WhatsApp"}
              </button>
              <p className="muted small center" style={{ margin: 0 }}>
                Seu horário fica reservado como pendente e a confirmação é feita pelo WhatsApp.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
