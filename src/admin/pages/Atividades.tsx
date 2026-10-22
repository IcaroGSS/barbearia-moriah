import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ActivityLog } from "../../lib/types";
import { addDays, fmtDateTime, todayISO } from "../../lib/format";
import { Empty, Spinner } from "../../components/ui";

const LIMITE = 300;

export function Atividades() {
  const hoje = todayISO();
  const [de, setDe] = useState(addDays(hoje, -30));
  const [ate, setAte] = useState(hoje);
  const [ator, setAtor] = useState("");
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([]);
  const [lista, setLista] = useState<ActivityLog[] | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, nome")
      .neq("status", "pendente")
      .order("nome")
      .then(({ data }) => setPessoas(data ?? []));
  }, []);

  useEffect(() => {
    setLista(null);
    // limites do dia no horário local do navegador
    let q = supabase
      .from("activity_log")
      .select("*")
      .gte("criado_em", new Date(`${de}T00:00:00`).toISOString())
      .lt("criado_em", new Date(`${addDays(ate, 1)}T00:00:00`).toISOString())
      .order("criado_em", { ascending: false })
      .limit(LIMITE);
    if (ator) q = q.eq("ator_id", ator);
    q.then(({ data }) => setLista((data as ActivityLog[]) ?? []));
  }, [de, ate, ator]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="glass card row">
        <label className="row small muted" style={{ gap: 6 }}>
          Usuário
          <select className="input" style={{ width: 200 }} value={ator} onChange={(e) => setAtor(e.target.value)}>
            <option value="">Todos</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="row small muted" style={{ gap: 6 }}>
          De
          <input className="input" type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} style={{ width: 160 }} />
        </label>
        <label className="row small muted" style={{ gap: 6 }}>
          até
          <input className="input" type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} style={{ width: 160 }} />
        </label>
      </div>
      {!lista && <Spinner />}
      {lista && (
        <div className="glass card">
          {lista.length === 0 ? (
            <Empty>Nenhuma atividade no período.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Quando</th>
                    <th>O que aconteceu</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((l) => (
                    <tr key={l.id}>
                      <td className="muted">{fmtDateTime(l.criado_em)}</td>
                      <td>{l.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lista.length === LIMITE && <p className="muted small">Mostrando as {LIMITE} mais recentes. Use os filtros para ver outras.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
