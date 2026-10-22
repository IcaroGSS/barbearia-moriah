import type { Appointment, ServiceSnapshot } from "./types";
import { fmtDateLong, hhmm, money } from "./format";

/** Número no formato internacional exigido pelo wa.me (adiciona 55 se faltar). */
export function waNumber(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length <= 11 ? `55${d}` : d;
}

export function waLink(numero: string, mensagem: string): string {
  const n = waNumber(numero);
  const texto = encodeURIComponent(mensagem);
  return n ? `https://wa.me/${n}?text=${texto}` : `https://wa.me/?text=${texto}`;
}

const nomesServicos = (s: ServiceSnapshot[]) => s.map((x) => x.nome).join(" + ");

/** Mensagem que o cliente envia para a barbearia ao agendar pelo site. */
export function bookingMessage(p: {
  barbearia: string;
  nome: string;
  servicos: ServiceSnapshot[];
  data: string;
  hora: string;
  total: number;
  observacao?: string;
}): string {
  const linhas = [
    `Olá, ${p.barbearia}! Acabei de agendar pelo site:`,
    ``,
    `*Nome:* ${p.nome}`,
    `*Serviço:* ${nomesServicos(p.servicos)}`,
    `*Data:* ${fmtDateLong(p.data)}`,
    `*Horário:* ${hhmm(p.hora)}`,
    `*Valor:* ${money(p.total)}`,
  ];
  if (p.observacao) linhas.push(`*Observação:* ${p.observacao}`);
  linhas.push(``, `Podem confirmar, por favor?`);
  return linhas.join("\n");
}

/** Mensagem que a barbearia envia ao cliente pelo painel. */
export function clientMessage(tipo: "confirmacao" | "lembrete", a: Appointment, barbearia: string): string {
  const primeiro = a.cliente_nome.split(" ")[0];
  const quando = `${fmtDateLong(a.data).toLowerCase()} às ${hhmm(a.hora_inicio)}`;
  if (tipo === "confirmacao") {
    return `Olá, ${primeiro}! Aqui é da ${barbearia}. Seu horário para ${nomesServicos(a.servicos)} está confirmado para ${quando}. Valor: ${money(a.valor_total)}. Até lá!`;
  }
  return `Olá, ${primeiro}! Passando para lembrar do seu horário na ${barbearia}: ${nomesServicos(a.servicos)}, ${quando}. Se precisar remarcar, é só responder esta mensagem.`;
}
