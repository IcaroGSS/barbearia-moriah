import { useEffect, type MouseEvent, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
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
          <SectionLink id="servicos">Serviços</SectionLink>
          <SectionLink id="sobre">Sobre</SectionLink>
          {(settings.endereco || settings.whatsapp || settings.instagram) && <SectionLink id="contato">Contato</SectionLink>}
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
            <Link to="/admin/login" className="muted">
              Área da equipe
            </Link>
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

/** Link para uma seção da página inicial (funciona com rotas normais e com #) */
export function SectionLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const ir = (e: MouseEvent) => {
    e.preventDefault();
    const rolar = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    if (pathname === "/") rolar();
    else {
      nav("/");
      setTimeout(rolar, 150);
    }
  };
  return (
    <a href={`#${id}`} className={className} onClick={ir}>
      {children}
    </a>
  );
}

export function instagramUrl(v: string): string {
  if (/^https?:\/\//.test(v)) return v;
  return `https://instagram.com/${v.replace(/^@/, "")}`;
}
