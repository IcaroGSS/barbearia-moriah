import type { Cargo, Permissao, Profile } from "./types";

export const PERMISSOES: { id: Permissao; label: string }[] = [
  { id: "dashboard", label: "Ver dashboard e acessos" },
  { id: "agenda", label: "Ver e gerenciar agenda" },
  { id: "agendamento_manual", label: "Criar agendamento manual" },
  { id: "disponibilidade", label: "Alterar disponibilidade e bloquear datas" },
  { id: "servicos", label: "Gerenciar serviços e preços" },
  { id: "financeiro", label: "Ver financeiro e exportar relatórios" },
  { id: "clientes", label: "Ver lista de clientes" },
  { id: "configuracoes", label: "Alterar configurações e aparência do site" },
];

export const TODAS: Permissao[] = PERMISSOES.map((p) => p.id);

export const PRESETS: Record<Exclude<Cargo, "dono">, Permissao[]> = {
  gerente: TODAS,
  barbeiro: ["agenda", "agendamento_manual"],
  recepcao: ["agenda", "clientes", "agendamento_manual"],
};

export function can(profile: Profile | null, p: Permissao | "usuarios"): boolean {
  if (!profile || profile.status !== "aprovado") return false;
  if (profile.cargo === "dono") return true;
  if (p === "usuarios") return false;
  return profile.permissoes.includes(p);
}
