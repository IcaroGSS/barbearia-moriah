// Valores padrão usados só na primeira instalação (ou enquanto o banco carrega).
// Depois disso tudo é lido do Supabase e editado pelo painel /admin.
import type { BusinessHour, Service, Settings } from "../lib/types";

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  nome: "Barbearia Moriah",
  slogan: "Estilo, cuidado e tradição em cada corte",
  whatsapp: "",
  endereco: "",
  instagram: "",
  tema: "ouro",
  intervalo_min: 30,
  fuso_horario: "America/Sao_Paulo",
  textos: {
    hero_titulo: "Seu estilo começa aqui",
    hero_subtitulo: "Corte, barba e cuidado com hora marcada. Escolha o serviço, o horário e confirme pelo WhatsApp.",
    sobre_titulo: "Sobre a Moriah",
    sobre_texto:
      "Uma barbearia feita para você se sentir em casa: ambiente acolhedor, profissionais caprichosos e atendimento pontual.",
    agendar_titulo: "Agende seu horário",
    agendar_texto: "Escolha os serviços, o dia e o horário. A confirmação é feita pelo WhatsApp.",
    contato_titulo: "Onde estamos",
    rodape: "Barbearia Moriah. Todos os direitos reservados.",
  },
};

export const DEFAULT_SERVICES: Service[] = [
  { id: "padrao-1", nome: "Corte", descricao: "Corte masculino com acabamento na máquina e tesoura.", preco: 40, duracao_min: 30, ativo: true, ordem: 1 },
  { id: "padrao-2", nome: "Barba", descricao: "Barba modelada com toalha quente e navalha.", preco: 30, duracao_min: 30, ativo: true, ordem: 2 },
  { id: "padrao-3", nome: "Corte + Barba", descricao: "O combo completo para sair renovado.", preco: 65, duracao_min: 60, ativo: true, ordem: 3 },
];

export const DEFAULT_HOURS: BusinessHour[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dia_semana: d,
  aberto: d >= 2,
  abertura: d === 6 ? "08:00" : "09:00",
  fechamento: d === 6 ? "17:00" : "19:00",
  almoco_inicio: d >= 2 ? "12:00" : null,
  almoco_fim: d >= 2 ? "13:00" : null,
}));

// Os 4 temas de cores disponíveis no painel
export const THEMES = [
  { id: "ouro", nome: "Ouro Clássico", cores: ["#0d0b08", "#d4a64a", "#f3e6c8"] },
  { id: "navalha", nome: "Navalha Vermelha", cores: ["#0f0f12", "#d9453b", "#f1f1f1"] },
  { id: "oceano", nome: "Oceano Noturno", cores: ["#06131c", "#35b6c9", "#dff6fa"] },
  { id: "floresta", nome: "Floresta", cores: ["#0b120d", "#8fbf6a", "#eef3e4"] },
] as const;
