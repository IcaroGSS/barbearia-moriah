export type Cargo = "dono" | "gerente" | "barbeiro" | "recepcao";
export type ProfileStatus = "pendente" | "aprovado" | "bloqueado";
export type AppointmentStatus = "pendente" | "confirmado" | "concluido" | "cancelado" | "nao_compareceu";
export type BlockMotivo = "folga" | "feriado" | "compromisso" | "outro";

export type Permissao =
  | "dashboard"
  | "agenda"
  | "agendamento_manual"
  | "disponibilidade"
  | "servicos"
  | "financeiro"
  | "clientes"
  | "configuracoes";

export type Textos = {
  hero_titulo?: string;
  hero_subtitulo?: string;
  sobre_titulo?: string;
  sobre_texto?: string;
  agendar_titulo?: string;
  agendar_texto?: string;
  contato_titulo?: string;
  rodape?: string;
};

export type Settings = {
  id: number;
  nome: string;
  slogan: string;
  whatsapp: string;
  endereco: string;
  instagram: string;
  tema: string;
  intervalo_min: number;
  textos: Textos;
  fuso_horario: string;
  atualizado_em?: string;
};

export type Service = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  duracao_min: number;
  ativo: boolean;
  ordem: number;
};

export type BusinessHour = {
  dia_semana: number;
  aberto: boolean;
  abertura: string;
  fechamento: string;
  almoco_inicio: string | null;
  almoco_fim: string | null;
};

export type BlockedDate = {
  id: string;
  data: string;
  dia_inteiro: boolean;
  hora_inicio: string | null;
  hora_fim: string | null;
  motivo: BlockMotivo;
  observacao: string;
};

export type ServiceSnapshot = { id: string; nome: string; preco: number; duracao_min: number };

export type Appointment = {
  id: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  servicos: ServiceSnapshot[];
  data: string;
  hora_inicio: string;
  hora_fim: string;
  valor_total: number;
  status: AppointmentStatus;
  observacao: string;
  origem: "site" | "manual";
  criado_em: string;
};

export type Profile = {
  id: string;
  nome: string;
  email: string;
  whatsapp: string | null;
  cargo: Cargo | null;
  status: ProfileStatus;
  permissoes: Permissao[];
  aprovado_por: string | null;
  aprovado_em: string | null;
  ultimo_acesso: string | null;
  must_change_password: boolean;
  criado_em: string;
};

export type ActivityLog = {
  id: number;
  ator_id: string | null;
  ator_nome: string;
  acao: string;
  descricao: string;
  criado_em: string;
};
