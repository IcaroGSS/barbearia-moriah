import { useEffect, useState } from "react";
import { errorMessage, supabase } from "../../lib/supabase";
import { fmtDate, fmtPhone, money } from "../../lib/format";
import { waLink } from "../../lib/whatsapp";
import { Empty, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";

type Cliente = {
  cliente_whatsapp: string;
  cliente_nome: string;
  visitas: number;
  agendamentos: number;
  ultimo_atendimento: string | null;
  total_gasto: number;
};

export function Clientes() {
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Cliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("list_clients", { p_busca: busca });
      if (error) return setErro(errorMessage(error));
      setErro(null);
      setLista((data as Cliente[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row">
        <div style={{ position: "relative", flex: 1, maxWidth: 420 }}>
          <input className="input" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ paddingLeft: 40 }} />
          <span style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }}>
            <Icon name="search" size={18} />
          </span>
        </div>
        {lista && <span className="muted small">{lista.length} cliente(s)</span>}
      </div>
      {erro && <div className="alert error">{erro}</div>}
      {!lista && !erro && <Spinner />}
      {lista && (
        <div className="glass card table-wrap">
          {lista.length === 0 ? (
            <Empty>Nenhum cliente encontrado.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>WhatsApp</th>
                  <th>Visitas</th>
                  <th>Último atendimento</th>
                  <th style={{ textAlign: "right" }}>Total gasto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.cliente_whatsapp}>
                    <td>
                      <b>{c.cliente_nome}</b>
                      <div className="muted small">{c.agendamentos} agendamento(s)</div>
                    </td>
                    <td>{fmtPhone(c.cliente_whatsapp)}</td>
                    <td>{c.visitas}</td>
                    <td>{c.ultimo_atendimento ? fmtDate(c.ultimo_atendimento) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{money(c.total_gasto)}</td>
                    <td>
                      <a className="btn whatsapp sm" href={waLink(c.cliente_whatsapp, `Olá, ${c.cliente_nome.split(" ")[0]}!`)} target="_blank" rel="noreferrer">
                        <Icon name="whatsapp" size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
