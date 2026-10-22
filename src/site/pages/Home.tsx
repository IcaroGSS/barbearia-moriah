import { Link } from "react-router-dom";
import { useSite } from "../SiteContext";
import { DIAS, hhmm, minutesToLabel, money } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { waLink } from "../../lib/whatsapp";
import { SectionLink, instagramUrl } from "../SiteLayout";

export function Home() {
  const { settings, services, hours } = useSite();
  const t = settings.textos;

  return (
    <main>
      <section className="hero container">
        <div className="hero-card glass">
          <div>
            <div className="eyebrow">{settings.slogan}</div>
            <h1>{t.hero_titulo}</h1>
            <p>{t.hero_subtitulo}</p>
            <div className="row" style={{ marginTop: 22 }}>
              <Link to="/agendar" className="btn primary">
                <Icon name="agenda" /> Agendar horário
              </Link>
              <SectionLink id="servicos" className="btn">
                Ver serviços
              </SectionLink>
            </div>
          </div>
          <div className="hero-badge" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="20" cy="46" r="7" />
              <circle cx="44" cy="46" r="7" />
              <path d="M25 41 46 10M39 41 18 10" />
            </svg>
          </div>
        </div>
      </section>

      <section id="servicos" className="section container">
        <div className="eyebrow">Serviços</div>
        <h2 className="section-title">O que fazemos</h2>
        <div className="grid grid-3" style={{ marginTop: 20 }}>
          {services.map((s) => (
            <article key={s.id} className="glass service-card">
              <h3 style={{ margin: 0 }}>{s.nome}</h3>
              {s.descricao && <p className="muted" style={{ margin: 0 }}>{s.descricao}</p>}
              <div className="spacer" />
              <div className="row between">
                <span className="price">{money(s.preco)}</span>
                <span className="muted small">
                  <Icon name="clock" size={14} /> {minutesToLabel(s.duracao_min)}
                </span>
              </div>
            </article>
          ))}
        </div>
        <div className="center" style={{ marginTop: 24 }}>
          <Link to="/agendar" className="btn primary">
            Agendar agora
          </Link>
        </div>
      </section>

      <section id="sobre" className="section container">
        <div className="grid grid-2">
          <div className="glass card">
            <div className="eyebrow">Sobre</div>
            <h2 className="section-title">{t.sobre_titulo}</h2>
            <p className="muted" style={{ whiteSpace: "pre-line" }}>{t.sobre_texto}</p>
          </div>
          <div className="glass card">
            <div className="eyebrow">Horários</div>
            <h2 className="section-title">Funcionamento</h2>
            <table className="table">
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const h = hours.find((x) => x.dia_semana === d);
                  return (
                    <tr key={d}>
                      <td>{DIAS[d]}</td>
                      <td style={{ textAlign: "right" }} className={h?.aberto ? "" : "muted"}>
                        {h?.aberto ? `${hhmm(h.abertura)} – ${hhmm(h.fechamento)}` : "Fechado"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {(settings.endereco || settings.whatsapp || settings.instagram) && (
      <section id="contato" className="section container">
        <div className="glass card">
          <div className="eyebrow">Contato</div>
          <h2 className="section-title">{t.contato_titulo}</h2>
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            {settings.endereco && (
              <a className="choice" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.endereco)}`} target="_blank" rel="noreferrer">
                <Icon name="pin" /> <span>{settings.endereco}</span>
              </a>
            )}
            {settings.whatsapp && (
              <a className="choice" href={waLink(settings.whatsapp, "Olá! Vim pelo site.")} target="_blank" rel="noreferrer">
                <Icon name="whatsapp" /> <span>Falar no WhatsApp</span>
              </a>
            )}
            {settings.instagram && (
              <a className="choice" href={instagramUrl(settings.instagram)} target="_blank" rel="noreferrer">
                <Icon name="instagram" /> <span>@{settings.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}</span>
              </a>
            )}
          </div>
        </div>
      </section>
      )}
    </main>
  );
}
