import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, supabase } from "../../lib/supabase";
import type { Settings, Textos } from "../../lib/types";
import { THEMES } from "../../config/defaults";
import { maskPhone, fmtPhone } from "../../lib/format";
import { useSite } from "../../site/SiteContext";
import { useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";

const CAMPOS_TEXTO: { key: keyof Textos; label: string; longo?: boolean }[] = [
  { key: "hero_titulo", label: "Título principal (topo do site)" },
  { key: "hero_subtitulo", label: "Subtítulo do topo", longo: true },
  { key: "sobre_titulo", label: "Título da seção Sobre" },
  { key: "sobre_texto", label: "Texto da seção Sobre", longo: true },
  { key: "agendar_titulo", label: "Título da página de agendamento" },
  { key: "agendar_texto", label: "Texto da página de agendamento", longo: true },
  { key: "contato_titulo", label: "Título da seção Contato" },
  { key: "rodape", label: "Texto do rodapé" },
];

export function Configuracoes() {
  const site = useSite();
  const toast = useToast();
  const [form, setForm] = useState<Settings>(site.settings);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setForm({ ...site.settings, whatsapp: maskPhone(fmtPhone(site.settings.whatsapp)) });
  }, [site.settings]);

  // Pré-visualização ao vivo do tema escolhido (volta ao salvo se sair sem salvar)
  useEffect(() => {
    site.previewTheme(form.tema !== site.settings.tema ? form.tema : null);
  }, [form.tema, site.settings.tema]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => site.previewTheme(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTexto = (k: keyof Textos, v: string) => setForm((f) => ({ ...f, textos: { ...f.textos, [k]: v } }));

  const salvar = async () => {
    if (form.nome.trim().length < 2) return toast("Informe o nome da barbearia.", "error");
    setSalvando(true);
    const { error } = await supabase
      .from("settings")
      .update({
        nome: form.nome.trim(),
        slogan: form.slogan.trim(),
        whatsapp: form.whatsapp.replace(/\D/g, ""),
        endereco: form.endereco.trim(),
        instagram: form.instagram.trim().replace(/^@/, ""),
        tema: form.tema,
        textos: form.textos,
      })
      .eq("id", 1);
    setSalvando(false);
    if (error) return toast(errorMessage(error), "error");
    toast("Configurações salvas. O site já está atualizado.");
    await site.reload();
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="glass card stack">
        <h3 style={{ margin: 0 }}>Dados da barbearia</h3>
        <div className="grid grid-2">
          <label className="field">
            Nome
            <input className="input" value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </label>
          <label className="field">
            Slogan
            <input className="input" value={form.slogan} onChange={(e) => set("slogan", e.target.value)} />
          </label>
          <label className="field">
            WhatsApp da barbearia (recebe os agendamentos)
            <input className="input" inputMode="tel" value={form.whatsapp} onChange={(e) => set("whatsapp", maskPhone(e.target.value))} placeholder="(11) 98765-4321" />
          </label>
          <label className="field">
            Instagram
            <input className="input" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@barbeariamoriah" />
          </label>
        </div>
        <label className="field">
          Endereço
          <input className="input" value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, número, bairro, cidade" />
        </label>
      </section>

      <section className="glass card stack">
        <h3 style={{ margin: 0 }}>Aparência</h3>
        <p className="muted small" style={{ margin: 0 }}>Clique em um tema para ver como fica. Ele só vale para todos depois de salvar.</p>
        <div className="grid grid-4">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-option ${form.tema === t.id ? "on" : ""}`} onClick={() => set("tema", t.id)}>
              <b>{t.nome}</b>
              {site.settings.tema === t.id && <div className="muted small">tema atual</div>}
              <div className="swatches">
                {t.cores.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="glass card stack">
        <h3 style={{ margin: 0 }}>Textos do site</h3>
        <div className="grid grid-2">
          {CAMPOS_TEXTO.map((c) => (
            <label key={c.key} className="field">
              {c.label}
              {c.longo ? (
                <textarea className="input" value={form.textos[c.key] ?? ""} onChange={(e) => setTexto(c.key, e.target.value)} />
              ) : (
                <input className="input" value={form.textos[c.key] ?? ""} onChange={(e) => setTexto(c.key, e.target.value)} />
              )}
            </label>
          ))}
        </div>
      </section>

      <div className="row">
        <button className="btn primary" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "Salvar configurações"}
        </button>
        <a className="btn" href="/" target="_blank" rel="noreferrer">
          Ver o site
        </a>
        <span className="spacer" />
        <Link className="btn ghost" to="/admin/minha-conta">
          <Icon name="key" /> Trocar minha senha
        </Link>
      </div>
    </div>
  );
}
