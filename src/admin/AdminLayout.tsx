import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { allowedSections, canSee, firstAllowedPath, SECTIONS } from "./nav";
import { Icon } from "../components/Icon";
import { supabase } from "../lib/supabase";
import { useSite } from "../site/SiteContext";
import { CARGO_LABEL, fmtDateTime } from "../lib/format";
import { can } from "../lib/permissions";
import { Spinner } from "../components/ui";

type Pendente = { id: string; nome: string; email: string; criado_em: string };

function Bell() {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, nome, email, criado_em")
      .eq("status", "pendente")
      .order("criado_em", { ascending: false });
    setPendentes((data as Pendente[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel("sino-solicitacoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => carregar())
      .subscribe();
    const t = setInterval(carregar, 60_000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(t);
    };
  }, [carregar]);

  return (
    <div style={{ position: "relative" }}>
      <button className="icon-btn" onClick={() => setAberto((a) => !a)} aria-label={`Solicitações de acesso: ${pendentes.length}`}>
        <Icon name="bell" />
        {pendentes.length > 0 && <span className="bell-count">{pendentes.length}</span>}
      </button>
      {aberto && (
        <div className="dropdown glass stack">
          <b>Solicitações de acesso</b>
          {pendentes.length === 0 && <span className="muted small">Nenhuma solicitação pendente.</span>}
          {pendentes.map((p) => (
            <div key={p.id} className="row between">
              <span>
                {p.nome}
                <br />
                <span className="muted small">
                  {p.email} · {fmtDateTime(p.criado_em)}
                </span>
              </span>
            </div>
          ))}
          {pendentes.length > 0 && (
            <Link to="/admin/usuarios?aba=pendentes" className="btn primary sm" onClick={() => setAberto(false)}>
              Ver solicitações
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { profile, loading, signOut } = useAuth();
  const { settings } = useSite();
  const { pathname } = useLocation();
  const [mais, setMais] = useState(false);

  useEffect(() => setMais(false), [pathname]);

  if (loading) return <Spinner />;
  if (!profile) return <Navigate to="/admin/login" replace />;
  if (profile.must_change_password && pathname !== "/admin/minha-conta") return <Navigate to="/admin/minha-conta" replace />;
  if (pathname === "/admin" || pathname === "/admin/") return <Navigate to={firstAllowedPath(profile)} replace />;

  const secao = SECTIONS.find((s) => pathname.startsWith(s.path));
  if (secao && !canSee(profile, secao)) return <Navigate to={firstAllowedPath(profile)} replace />;

  const itens = allowedSections(profile);
  const principais = itens.slice(0, 4);
  const resto = itens.slice(4);

  return (
    <div className="admin">
      <aside className="sidebar glass">
        <Link to="/" className="brand" title="Ver o site">
          <span className="brand-mark">{settings.nome.replace(/^barbearia\s+/i, "").charAt(0).toUpperCase() || "M"}</span>
          <span>{settings.nome}</span>
        </Link>
        {itens.map((s) => (
          <NavLink key={s.path} to={s.path} className="nav-link">
            <Icon name={s.icon} /> {s.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <button className="nav-link" style={{ background: "none", border: 0, font: "inherit", cursor: "pointer" }} onClick={() => signOut()}>
          <Icon name="logout" /> Sair
        </button>
      </aside>

      <main className="admin-main">
        <div className="topbar">
          <h1>{secao?.label ?? "Painel"}</h1>
          <div className="spacer" />
          {can(profile, "usuarios") && <Bell />}
          <Link to="/admin/minha-conta" className="row small" style={{ gap: 8, color: "var(--text)", textDecoration: "none" }}>
            <span className="icon-btn">
              <Icon name="user" />
            </span>
            <span className="hide-sm">
              <b>{profile.nome.split(" ")[0]}</b>
              <br />
              <span className="muted">{profile.cargo ? CARGO_LABEL[profile.cargo] : ""}</span>
            </span>
          </Link>
        </div>
        <Outlet />
      </main>

      {mais && (
        <div className="more-sheet glass stack">
          {resto.map((s) => (
            <NavLink key={s.path} to={s.path} className="nav-link">
              <Icon name={s.icon} /> {s.label}
            </NavLink>
          ))}
          <button className="nav-link" style={{ background: "none", border: 0, font: "inherit", cursor: "pointer", textAlign: "left" }} onClick={() => signOut()}>
            <Icon name="logout" /> Sair
          </button>
        </div>
      )}
      <nav className="bottom-nav glass">
        {principais.map((s) => (
          <NavLink key={s.path} to={s.path}>
            <Icon name={s.icon} />
            {s.label}
          </NavLink>
        ))}
        <button onClick={() => setMais((m) => !m)} aria-expanded={mais}>
          <Icon name="more" />
          Mais
        </button>
      </nav>
    </div>
  );
}
