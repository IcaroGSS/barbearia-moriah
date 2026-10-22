import type { Permissao, Profile } from "../lib/types";
import { can } from "../lib/permissions";

export type Section = {
  path: string;
  label: string;
  icon: string;
  /** Basta ter uma das permissões da lista */
  perm: Permissao[] | "usuarios" | null;
};

export const SECTIONS: Section[] = [
  { path: "/admin/dashboard", label: "Dashboard", icon: "dashboard", perm: ["dashboard"] },
  { path: "/admin/agenda", label: "Agenda", icon: "agenda", perm: ["agenda", "agendamento_manual"] },
  { path: "/admin/disponibilidade", label: "Disponibilidade", icon: "clock", perm: ["disponibilidade"] },
  { path: "/admin/servicos", label: "Serviços", icon: "scissors", perm: ["servicos"] },
  { path: "/admin/financeiro", label: "Financeiro", icon: "money", perm: ["financeiro"] },
  { path: "/admin/clientes", label: "Clientes", icon: "users", perm: ["clientes"] },
  { path: "/admin/configuracoes", label: "Configurações", icon: "settings", perm: ["configuracoes"] },
  { path: "/admin/usuarios", label: "Usuários", icon: "shield", perm: "usuarios" },
  { path: "/admin/atividades", label: "Atividades", icon: "list", perm: "usuarios" },
  { path: "/admin/minha-conta", label: "Minha conta", icon: "user", perm: null },
];

export function allowedSections(p: Profile | null): Section[] {
  return SECTIONS.filter((s) => canSee(p, s));
}

export function canSee(p: Profile | null, s: Section): boolean {
  if (s.perm === null) return !!p && p.status === "aprovado";
  if (s.perm === "usuarios") return can(p, "usuarios");
  return s.perm.some((x) => can(p, x));
}

/** Primeira seção que a pessoa pode ver (para onde vai depois do login). */
export function firstAllowedPath(p: Profile | null): string {
  if (p?.must_change_password) return "/admin/minha-conta";
  return allowedSections(p)[0]?.path ?? "/admin/minha-conta";
}
