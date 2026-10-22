import { useCallback, useEffect, useState } from "react";
import { errorMessage, supabase } from "../../lib/supabase";
import type { Service } from "../../lib/types";
import { minutesToLabel, money } from "../../lib/format";
import { Empty, Modal, Spinner, confirmAction, useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useSite } from "../../site/SiteContext";

type Rascunho = { id?: string; nome: string; descricao: string; preco: string; duracao_min: number; ativo: boolean };

export function Servicos() {
  const toast = useToast();
  const site = useSite();
  const [lista, setLista] = useState<Service[] | null>(null);
  const [form, setForm] = useState<Rascunho | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("services").select("*").order("ordem").order("nome");
    setLista(((data as Service[]) ?? []).map((s) => ({ ...s, preco: Number(s.preco) })));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const depois = () => {
    carregar();
    site.reload();
  };

  const salvar = async () => {
    if (!form) return;
    const preco = Number(form.preco.replace(",", "."));
    if (form.nome.trim().length < 1) return toast("Informe o nome do serviço.", "error");
    if (Number.isNaN(preco) || preco < 0) return toast("Preço inválido.", "error");
    if (!form.duracao_min || form.duracao_min < 5) return toast("Duração mínima de 5 minutos.", "error");
    const dados = { nome: form.nome.trim(), descricao: form.descricao.trim(), preco, duracao_min: form.duracao_min, ativo: form.ativo };
    const { error } = form.id
      ? await supabase.from("services").update(dados).eq("id", form.id)
      : await supabase.from("services").insert({ ...dados, ordem: (lista?.length ?? 0) + 1 });
    if (error) return toast(errorMessage(error), "error");
    toast(form.id ? "Serviço atualizado." : "Serviço criado.");
    setForm(null);
    depois();
  };

  const alternar = async (s: Service) => {
    const { error } = await supabase.from("services").update({ ativo: !s.ativo }).eq("id", s.id);
    if (error) return toast(errorMessage(error), "error");
    depois();
  };

  const mover = async (i: number, dir: -1 | 1) => {
    if (!lista) return;
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setLista(nova);
    const results = await Promise.all(nova.map((s, idx) => (s.ordem !== idx + 1 ? supabase.from("services").update({ ordem: idx + 1 }).eq("id", s.id) : null)));
    const falha = results.find((r) => r?.error);
    if (falha?.error) toast(errorMessage(falha.error), "error");
    depois();
  };

  const excluir = async (s: Service) => {
    if (!confirmAction(`Excluir o serviço "${s.nome}"? Os agendamentos antigos continuam com o nome e o valor da época. Se preferir só esconder do site, use "Desativar".`)) return;
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) return toast(errorMessage(error), "error");
    toast("Serviço excluído.");
    depois();
  };

  if (!lista) return <Spinner />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between">
        <p className="muted" style={{ margin: 0 }}>A ordem abaixo é a mesma exibida no site. Serviços desativados não aparecem para os clientes.</p>
        <button className="btn primary" onClick={() => setForm({ nome: "", descricao: "", preco: "", duracao_min: 30, ativo: true })}>
          <Icon name="plus" /> Novo serviço
        </button>
      </div>
      <div className="glass card stack">
        {lista.length === 0 && <Empty>Nenhum serviço cadastrado.</Empty>}
        {lista.map((s, i) => (
          <div key={s.id} className="appt" style={{ gridTemplateColumns: "auto 1fr auto", opacity: s.ativo ? 1 : 0.55 }}>
            <div className="stack" style={{ gap: 2 }}>
              <button className="btn sm ghost" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">
                <Icon name="up" size={16} />
              </button>
              <button className="btn sm ghost" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">
                <Icon name="down" size={16} />
              </button>
            </div>
            <div>
              <b>{s.nome}</b> {!s.ativo && <span className="badge st-cancelado">Desativado</span>}
              <div className="muted small">
                {money(s.preco)} · {minutesToLabel(s.duracao_min)}
                {s.descricao ? ` · ${s.descricao}` : ""}
              </div>
            </div>
            <div className="actions">
              <button className="btn sm" onClick={() => alternar(s)}>
                {s.ativo ? "Desativar" : "Ativar"}
              </button>
              <button className="btn sm ghost" onClick={() => setForm({ id: s.id, nome: s.nome, descricao: s.descricao, preco: s.preco.toFixed(2), duracao_min: s.duracao_min, ativo: s.ativo })} aria-label="Editar">
                <Icon name="edit" size={16} />
              </button>
              <button className="btn sm ghost" onClick={() => excluir(s)} aria-label="Excluir">
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <Modal
          title={form.id ? "Editar serviço" : "Novo serviço"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button className="btn primary" onClick={salvar}>
                Salvar
              </button>
            </>
          }
        >
          <label className="field">
            Nome
            <input className="input" value={form.nome} maxLength={80} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </label>
          <label className="field">
            Descrição
            <textarea className="input" value={form.descricao} maxLength={500} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </label>
          <div className="grid grid-2">
            <label className="field">
              Preço (R$)
              <input className="input" inputMode="decimal" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
            </label>
            <label className="field">
              Duração
              <select className="input" value={form.duracao_min} onChange={(e) => setForm({ ...form, duracao_min: Number(e.target.value) })}>
                {Array.from(new Set([10, 15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, form.duracao_min])).sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {minutesToLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo (aparece no site)
          </label>
        </Modal>
      )}
    </div>
  );
}
