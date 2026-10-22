import type { AppointmentStatus, BlockMotivo, Cargo } from "./types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v: number | string | null | undefined) => brl.format(Number(v ?? 0));

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
};

export const CARGO_LABEL: Record<Cargo, string> = {
  dono: "Dono",
  gerente: "Gerente",
  barbeiro: "Barbeiro",
  recepcao: "Recepção",
};

export const MOTIVO_LABEL: Record<BlockMotivo, string> = {
  folga: "Folga",
  feriado: "Feriado",
  compromisso: "Compromisso",
  outro: "Outro",
};

/** "2026-11-14" no fuso informado (padrão: horário de Brasília). */
export function todayISO(tz = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function startOfWeek(iso: string): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() - d.getDay());
  return toISO(d);
}

export function monthStart(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

export function addMonths(iso: string, n: number): string {
  const d = parseISO(monthStart(iso));
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

export function monthLabel(iso: string): string {
  const d = parseISO(iso);
  const m = MESES[d.getMonth()];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} de ${d.getFullYear()}`;
}

export const fmtDate = (iso: string) => {
  const d = parseISO(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const fmtDateLong = (iso: string) => {
  const d = parseISO(iso);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
};

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

export const fmtDateTime = (ts: string | null | undefined) =>
  ts
    ? new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "Nunca";

export function minutesToLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Formata um WhatsApp brasileiro: 11987654321 -> (11) 98765-4321 */
export function fmtPhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw ?? "";
}

/** Máscara enquanto digita */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function pctChange(atual: number, anterior: number): number | null {
  if (!anterior) return atual ? null : 0;
  return ((atual - anterior) / anterior) * 100;
}
