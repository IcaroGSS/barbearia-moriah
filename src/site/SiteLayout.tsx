import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useSite } from "./SiteContext";
import { trackPageView } from "../lib/tracking";
import { Icon } from "../components/Icon";
import { waLink } from "../lib/whatsapp";

export function SiteLayout() {
  const { settings } = useSite();
  const { pathname } = useLocation();

  useEffect(() => {
    trackPageView(pathname).catch(() => {});
  }, [pathname]);

  const inicial = settings.nome.replace(/^barbearia\s+/i, "").charAt(0).toUpperCase() || "M";

  return (
    <>
      <header className="site-header glass">
        <Link to="/" className="brand">
          <span className="brand-mark">{inicial}</span>
          <span>{settings.nome}</span>
        </Link>
        <nav className="site-nav">
          <a href="/#servicos">Serviços</a>
          <a href="/#sobre">Sobre</a>
          {(settings.endereco || settings.whatsapp || settings.instagram) && <a href="/#contato">Contato</a>}
          <Link to="/agendar" className="btn primary sm keep">
            Agendar
          </Link>
        </nav>
      </header>
      <Outlet />
      <footer className="site-footer">
        <div className="container row between">
          <span>
            © {new Date().getFullYear()} {settings.textos.rodape}
          </span>
          <span className="row">
            {settings.instagram && (
              <a href={instagramUrl(settings.instagram)} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}>
                <Icon name="instagram" size={18} /> Instagram
              </a>
            )}
            {settings.whatsapp && (
              <a href={waLink(settings.whatsapp, "Olá! Vim pelo site.")} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}>
                <Icon name="whatsapp" size={18} /> WhatsApp
              </a>
            )}
          </span>
        </div>
      </footer>
    </>
  );
}

export function instagramUrl(v: string): string {
  if (/^https?:\/\//.test(v)) return v;
  return `https://instagram.com/${v.replace(/^@/, "")}`;
}
