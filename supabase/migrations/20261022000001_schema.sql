-- =====================================================================
-- Barbearia Moriah: esquema completo (tabelas, RLS, funções e gatilhos)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.cargo as enum ('dono', 'gerente', 'barbeiro', 'recepcao');
create type public.profile_status as enum ('pendente', 'aprovado', 'bloqueado');
create type public.appointment_status as enum ('pendente', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu');
create type public.block_motivo as enum ('folga', 'feriado', 'compromisso', 'outro');

-- Chaves de permissão que o dono pode marcar por usuário
create or replace function public.all_permissions()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'dashboard',           -- Ver dashboard e acessos
    'agenda',              -- Ver e gerenciar agenda
    'agendamento_manual',  -- Criar agendamento manual
    'disponibilidade',     -- Alterar disponibilidade e bloquear datas
    'servicos',            -- Gerenciar serviços e preços
    'financeiro',          -- Ver financeiro e exportar relatórios
    'clientes',            -- Ver lista de clientes
    'configuracoes'        -- Alterar configurações e aparência do site
  ]::text[];
$$;

-- Presets sugeridos ao escolher o cargo
create or replace function public.permission_preset(p_cargo public.cargo)
returns text[] language sql immutable set search_path = '' as $$
  select case p_cargo
    when 'dono'     then public.all_permissions()
    when 'gerente'  then public.all_permissions()
    when 'barbeiro' then array['agenda', 'agendamento_manual']
    when 'recepcao' then array['agenda', 'clientes', 'agendamento_manual']
  end::text[];
$$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table public.settings (
  id            smallint primary key default 1 check (id = 1),
  nome          text not null default 'Barbearia Moriah',
  slogan        text not null default '',
  whatsapp      text not null default '',
  endereco      text not null default '',
  instagram     text not null default '',
  tema          text not null default 'ouro',
  intervalo_min smallint not null default 30 check (intervalo_min in (15, 30, 45, 60)),
  textos        jsonb not null default '{}'::jsonb,
  fuso_horario  text not null default 'America/Sao_Paulo',
  atualizado_em timestamptz not null default now()
);

create table public.services (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) between 1 and 80),
  descricao   text not null default '' check (length(descricao) <= 500),
  preco       numeric(10, 2) not null check (preco >= 0),
  duracao_min integer not null check (duracao_min between 5 and 480),
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  criado_em   timestamptz not null default now()
);

create table public.business_hours (
  dia_semana    smallint primary key check (dia_semana between 0 and 6),  -- 0 = domingo
  aberto        boolean not null default true,
  abertura      time not null default '09:00',
  fechamento    time not null default '19:00',
  almoco_inicio time,
  almoco_fim    time,
  check (abertura < fechamento),
  check ((almoco_inicio is null) = (almoco_fim is null)),
  check (almoco_inicio is null or almoco_inicio < almoco_fim)
);

create table public.blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  dia_inteiro boolean not null default true,
  hora_inicio time,
  hora_fim    time,
  motivo      public.block_motivo not null default 'folga',
  observacao  text not null default '' check (length(observacao) <= 200),
  criado_por  uuid references auth.users (id) on delete set null,
  criado_em   timestamptz not null default now(),
  check (dia_inteiro or (hora_inicio is not null and hora_fim is not null and hora_inicio < hora_fim))
);
create index blocked_dates_data_idx on public.blocked_dates (data);

create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  cliente_nome     text not null check (length(trim(cliente_nome)) between 1 and 120),
  cliente_whatsapp text not null check (cliente_whatsapp ~ '^[0-9]{8,15}$'),
  -- Instantâneo dos serviços no momento do agendamento: [{id, nome, preco, duracao_min}]
  servicos         jsonb not null default '[]'::jsonb check (jsonb_typeof(servicos) = 'array'),
  data             date not null,
  hora_inicio      time not null,
  hora_fim         time not null,
  valor_total      numeric(10, 2) not null default 0 check (valor_total >= 0),
  status           public.appointment_status not null default 'pendente',
  observacao       text not null default '' check (length(observacao) <= 500),
  origem           text not null default 'site' check (origem in ('site', 'manual')),
  criado_por       uuid references auth.users (id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  check (hora_inicio < hora_fim),
  -- Dois agendamentos ativos (pendente/confirmado) nunca se sobrepõem
  constraint appointments_sem_sobreposicao exclude using gist (
    tsrange(data + hora_inicio, data + hora_fim) with &&
  ) where (status in ('pendente', 'confirmado'))
);
create index appointments_data_idx on public.appointments (data, hora_inicio);
create index appointments_whatsapp_idx on public.appointments (cliente_whatsapp);

create table public.page_views (
  id          bigint generated always as identity primary key,
  visto_em    timestamptz not null default now(),
  pagina      text not null check (length(pagina) between 1 and 200),
  sessao_id   text not null check (length(sessao_id) between 8 and 64),
  origem      text not null default '' check (length(origem) <= 500),
  dispositivo text not null check (dispositivo in ('mobile', 'desktop'))
);
create index page_views_visto_em_idx on public.page_views (visto_em);

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  nome                 text not null check (length(trim(nome)) between 1 and 120),
  email                text not null,
  whatsapp             text,
  cargo                public.cargo,           -- nulo enquanto pendente
  status               public.profile_status not null default 'pendente',
  permissoes           text[] not null default '{}' check (permissoes <@ public.all_permissions()),
  aprovado_por         uuid references public.profiles (id) on delete set null,
  aprovado_em          timestamptz,
  ultimo_acesso        timestamptz,
  must_change_password boolean not null default false,
  criado_em            timestamptz not null default now(),
  check (status = 'pendente' or cargo is not null)
);
-- Só pode existir um dono
create unique index profiles_um_dono on public.profiles ((true)) where cargo = 'dono';
create index profiles_status_idx on public.profiles (status);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  ator_id     uuid references public.profiles (id) on delete set null,
  ator_nome   text not null default 'Sistema',
  acao        text not null,
  descricao   text not null,
  entidade    text,
  entidade_id text,
  criado_em   timestamptz not null default now()
);
create index activity_log_criado_em_idx on public.activity_log (criado_em desc);
create index activity_log_ator_idx on public.activity_log (ator_id);

-- ---------------------------------------------------------------------
-- Funções de acesso (usadas pelas políticas RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'aprovado'
  );
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'aprovado' and cargo = 'dono'
  );
$$;

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and status = 'aprovado'
      and (cargo = 'dono' or p = any (permissoes))
  );
$$;

-- ---------------------------------------------------------------------
-- Registro de atividades (uso interno pelos gatilhos)
-- ---------------------------------------------------------------------
create or replace function public.log_activity(p_acao text, p_descricao text, p_entidade text, p_entidade_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if v_uid is null then
    return;  -- visitantes e a service role (Edge Functions registram por conta própria)
  end if;
  select nome into v_nome from public.profiles where id = v_uid;
  insert into public.activity_log (ator_id, ator_nome, acao, descricao, entidade, entidade_id)
  values (v_uid, coalesce(v_nome, 'Usuário'), p_acao, coalesce(v_nome, 'Usuário') || ' ' || p_descricao, p_entidade, p_entidade_id);
end;
$$;

create or replace function public.fmt_slot(p_data date, p_hora time)
returns text language sql immutable set search_path = '' as $$
  select to_char(p_data, 'DD/MM') || ' ' || to_char(p_hora, 'HH24:MI');
$$;

-- ---------------------------------------------------------------------
-- Perfis: criação automática, proteção do dono e sincronia de e-mail
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_primeiro boolean;
begin
  -- Evita que dois cadastros simultâneos virem dono
  perform pg_advisory_xact_lock(hashtext('barbearia_primeiro_dono'));
  select not exists (select 1 from public.profiles) into v_primeiro;

  insert into public.profiles (id, nome, email, whatsapp, cargo, status, permissoes, aprovado_em)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'whatsapp', ''), '\D', '', 'g'), ''),
    case when v_primeiro then 'dono'::public.cargo end,
    case when v_primeiro then 'aprovado'::public.profile_status else 'pendente'::public.profile_status end,
    case when v_primeiro then public.all_permissions() else '{}'::text[] end,
    case when v_primeiro then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    if old.cargo = 'dono' then
      raise exception 'O dono não pode ser excluído';
    end if;
    return old;
  end if;

  new.id := old.id;
  new.criado_em := old.criado_em;

  -- Regras que valem para todos, inclusive a service role
  if old.cargo = 'dono' and (new.cargo is distinct from 'dono' or new.status <> 'aprovado') then
    raise exception 'O dono não pode ser rebaixado nem bloqueado';
  end if;
  if new.cargo = 'dono' and old.cargo is distinct from 'dono' then
    raise exception 'Não é possível atribuir o cargo de dono';
  end if;

  -- Usuário comum editando o próprio perfil: só nome, WhatsApp, último acesso
  -- e desligar o aviso de troca de senha
  if v_uid is not null and not public.is_owner() then
    if new.cargo is distinct from old.cargo
       or new.status is distinct from old.status
       or new.permissoes is distinct from old.permissoes
       or new.aprovado_por is distinct from old.aprovado_por
       or new.aprovado_em is distinct from old.aprovado_em
       or new.email is distinct from old.email
       or (new.must_change_password and not old.must_change_password) then
      raise exception 'Sem permissão para alterar estes campos';
    end if;
  end if;

  if new.whatsapp is not null then
    new.whatsapp := nullif(regexp_replace(new.whatsapp, '\D', '', 'g'), '');
  end if;
  return new;
end;
$$;

create trigger profiles_guard_upd before update on public.profiles
  for each row execute function public.profiles_guard();
create trigger profiles_guard_del before delete on public.profiles
  for each row execute function public.profiles_guard();

-- Registro das mudanças que o dono faz direto pelo painel (aprovar, cargo, permissões)
create or replace function public.profiles_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() = new.id then
    return new;
  end if;
  if old.status = 'pendente' and new.status = 'aprovado' then
    perform public.log_activity('usuario.aprovar',
      'aprovou acesso de ' || new.nome || ' como ' || new.cargo::text, 'profiles', new.id::text);
  elsif new.status is distinct from old.status then
    perform public.log_activity('usuario.' || new.status::text,
      case new.status when 'bloqueado' then 'bloqueou ' when 'aprovado' then 'desbloqueou ' else 'alterou o status de ' end || new.nome,
      'profiles', new.id::text);
  elsif new.cargo is distinct from old.cargo or new.permissoes is distinct from old.permissoes then
    perform public.log_activity('usuario.permissoes',
      'alterou cargo/permissões de ' || new.nome, 'profiles', new.id::text);
  end if;
  return new;
end;
$$;

create trigger profiles_log after update on public.profiles
  for each row execute function public.profiles_log();

-- O próprio usuário marca o último acesso ao abrir o painel
create or replace function public.touch_last_access()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set ultimo_acesso = now()
  where id = (select auth.uid()) and status = 'aprovado';
$$;

-- Depois de trocar a senha em "Minha conta"
create or replace function public.clear_must_change_password()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false
  where id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Agendamentos: normalização, cálculo de valores e registro de atividades
-- ---------------------------------------------------------------------
-- Reconstrói o instantâneo dos serviços a partir dos ids enviados
create or replace function public.build_services_snapshot(p_servicos jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('id', s.id, 'nome', s.nome, 'preco', s.preco, 'duracao_min', s.duracao_min)
           order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(p_servicos) with ordinality as e (x, ord)
  join public.services s on s.id = (
    case when jsonb_typeof(e.x) = 'string' then e.x #>> '{}' else e.x ->> 'id' end
  )::uuid;
$$;

create or replace function public.appointments_prepare()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric;
  v_dur integer;
begin
  new.cliente_whatsapp := regexp_replace(coalesce(new.cliente_whatsapp, ''), '\D', '', 'g');
  new.cliente_nome := trim(new.cliente_nome);
  new.atualizado_em := now();

  if tg_op = 'INSERT' or new.servicos is distinct from old.servicos then
    new.servicos := public.build_services_snapshot(new.servicos);
    if jsonb_array_length(new.servicos) = 0 then
      raise exception 'Escolha pelo menos um serviço';
    end if;
    select coalesce(sum((x ->> 'preco')::numeric), 0), coalesce(sum((x ->> 'duracao_min')::int), 0)
      into v_total, v_dur
      from jsonb_array_elements(new.servicos) x;
    -- Valor e fim calculados automaticamente, a não ser que tenham sido informados à mão
    if tg_op = 'INSERT' then
      if new.valor_total is null or new.valor_total = 0 then new.valor_total := v_total; end if;
      if new.hora_fim is null then new.hora_fim := new.hora_inicio + make_interval(mins => v_dur); end if;
    else
      if new.valor_total is not distinct from old.valor_total then new.valor_total := v_total; end if;
      if new.hora_fim is not distinct from old.hora_fim then
        new.hora_fim := new.hora_inicio + make_interval(mins => v_dur);
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.criado_em := now();
  elsif new.hora_inicio is distinct from old.hora_inicio
        and new.hora_fim is not distinct from old.hora_fim then
    -- Mudou só o início: mantém a duração
    new.hora_fim := new.hora_inicio + (old.hora_fim - old.hora_inicio);
  end if;
  return new;
end;
$$;

create trigger appointments_prepare before insert or update on public.appointments
  for each row execute function public.appointments_prepare();

create or replace function public.appointments_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_quando text;
  v_verbo text;
begin
  if tg_op = 'DELETE' then
    perform public.log_activity('agendamento.excluir',
      'excluiu o agendamento de ' || old.cliente_nome || ' – ' || public.fmt_slot(old.data, old.hora_inicio),
      'appointments', old.id::text);
    return old;
  end if;

  v_quando := public.fmt_slot(new.data, new.hora_inicio);
  if tg_op = 'INSERT' then
    perform public.log_activity('agendamento.criar',
      'criou agendamento manual para ' || new.cliente_nome || ' – ' || v_quando,
      'appointments', new.id::text);
  elsif new.status is distinct from old.status then
    v_verbo := case new.status
      when 'confirmado' then 'confirmou o agendamento de '
      when 'concluido' then 'concluiu o agendamento de '
      when 'cancelado' then 'cancelou o agendamento de '
      when 'nao_compareceu' then 'marcou falta no agendamento de '
      else 'voltou para pendente o agendamento de '
    end;
    perform public.log_activity('agendamento.' || new.status::text, v_verbo || new.cliente_nome || ' – ' || v_quando,
      'appointments', new.id::text);
  else
    perform public.log_activity('agendamento.editar',
      'editou o agendamento de ' || new.cliente_nome || ' – ' || v_quando,
      'appointments', new.id::text);
  end if;
  return new;
end;
$$;

create trigger appointments_log after insert or update or delete on public.appointments
  for each row execute function public.appointments_log();

-- ---------------------------------------------------------------------
-- Registro de atividades das demais tabelas
-- ---------------------------------------------------------------------
create or replace function public.services_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('servico.criar', 'criou o serviço ' || new.nome, 'services', new.id::text);
  elsif tg_op = 'DELETE' then
    perform public.log_activity('servico.excluir', 'excluiu o serviço ' || old.nome, 'services', old.id::text);
    return old;
  elsif new.ativo is distinct from old.ativo then
    perform public.log_activity('servico.' || case when new.ativo then 'ativar' else 'desativar' end,
      case when new.ativo then 'ativou' else 'desativou' end || ' o serviço ' || new.nome, 'services', new.id::text);
  elsif (new.nome, new.descricao, new.preco, new.duracao_min) is distinct from (old.nome, old.descricao, old.preco, old.duracao_min) then
    perform public.log_activity('servico.editar', 'editou o serviço ' || new.nome, 'services', new.id::text);
  end if;
  return new;
end;
$$;
create trigger services_log after insert or update or delete on public.services
  for each row execute function public.services_log();

create or replace function public.business_hours_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity('disponibilidade.horario',
    'alterou o horário de ' || (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[new.dia_semana + 1],
    'business_hours', new.dia_semana::text);
  return new;
end;
$$;
create trigger business_hours_log after update on public.business_hours
  for each row when (old is distinct from new) execute function public.business_hours_log();

create or replace function public.blocked_dates_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.blocked_dates;
  v_periodo text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  v_periodo := to_char(r.data, 'DD/MM') ||
    case when r.dia_inteiro then '' else ' ' || to_char(r.hora_inicio, 'HH24:MI') || '–' || to_char(r.hora_fim, 'HH24:MI') end;
  if tg_op = 'INSERT' then
    perform public.log_activity('bloqueio.criar', 'bloqueou ' || v_periodo || ' (' || r.motivo::text || ')', 'blocked_dates', r.id::text);
  elsif tg_op = 'DELETE' then
    perform public.log_activity('bloqueio.remover', 'removeu o bloqueio de ' || v_periodo, 'blocked_dates', r.id::text);
  else
    perform public.log_activity('bloqueio.editar', 'editou o bloqueio de ' || v_periodo, 'blocked_dates', r.id::text);
  end if;
  return r;
end;
$$;
create trigger blocked_dates_log after insert or update or delete on public.blocked_dates
  for each row execute function public.blocked_dates_log();

create or replace function public.blocked_dates_prepare()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.dia_inteiro then
    new.hora_inicio := null;
    new.hora_fim := null;
  end if;
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
  end if;
  return new;
end;
$$;
create trigger blocked_dates_prepare before insert or update on public.blocked_dates
  for each row execute function public.blocked_dates_prepare();

create or replace function public.settings_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := 1;
  new.atualizado_em := now();
  -- Quem só tem "disponibilidade" muda apenas o intervalo; quem só tem "configurações" não muda o intervalo
  if auth.uid() is not null then
    if new.intervalo_min is distinct from old.intervalo_min and not public.has_perm('disponibilidade') then
      raise exception 'Sem permissão para alterar o intervalo entre horários';
    end if;
    if (new.nome, new.slogan, new.whatsapp, new.endereco, new.instagram, new.tema, new.textos, new.fuso_horario)
       is distinct from (old.nome, old.slogan, old.whatsapp, old.endereco, old.instagram, old.tema, old.textos, old.fuso_horario)
       and not public.has_perm('configuracoes') then
      raise exception 'Sem permissão para alterar as configurações do site';
    end if;
  end if;
  if new.tema is distinct from old.tema
     and (new.nome, new.slogan, new.whatsapp, new.endereco, new.instagram, new.intervalo_min, new.textos)
         is not distinct from (old.nome, old.slogan, old.whatsapp, old.endereco, old.instagram, old.intervalo_min, old.textos) then
    perform public.log_activity('config.tema', 'mudou o tema do site para ' || new.tema, 'settings', '1');
  elsif new.intervalo_min is distinct from old.intervalo_min then
    perform public.log_activity('disponibilidade.intervalo', 'mudou o intervalo entre horários para ' || new.intervalo_min || ' min', 'settings', '1');
  else
    perform public.log_activity('config.editar', 'alterou as configurações do site', 'settings', '1');
  end if;
  return new;
end;
$$;
create trigger settings_log before update on public.settings
  for each row when (old is distinct from new) execute function public.settings_log();

-- Visitante nunca escolhe a data/hora do page_view
create or replace function public.page_views_prepare()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.visto_em := now();
  return new;
end;
$$;
create trigger page_views_prepare before insert on public.page_views
  for each row execute function public.page_views_prepare();

-- ---------------------------------------------------------------------
-- Disponibilidade pública
-- ---------------------------------------------------------------------
-- Retorna o motivo pelo qual um intervalo não pode ser agendado, ou null se estiver livre
create or replace function public.slot_error(p_data date, p_inicio time, p_fim time, p_ignorar uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  s public.settings;
  h public.business_hours;
begin
  select * into s from public.settings where id = 1;
  select * into h from public.business_hours where dia_semana = extract(dow from p_data)::int;

  if p_fim <= p_inicio then return 'Horário inválido'; end if;
  if h.dia_semana is null or not h.aberto then return 'Fechado neste dia'; end if;
  if p_inicio < h.abertura or p_fim > h.fechamento then return 'Fora do horário de funcionamento'; end if;
  if h.almoco_inicio is not null and h.almoco_inicio < p_fim and h.almoco_fim > p_inicio then
    return 'Horário de almoço';
  end if;
  if (p_data + p_inicio) <= (now() at time zone coalesce(s.fuso_horario, 'America/Sao_Paulo')) then
    return 'Esse horário já passou';
  end if;
  if exists (
    select 1 from public.blocked_dates b
    where b.data = p_data and (b.dia_inteiro or (b.hora_inicio < p_fim and b.hora_fim > p_inicio))
  ) then
    return 'Data ou período bloqueado';
  end if;
  if exists (
    select 1 from public.appointments a
    where a.data = p_data
      and a.status in ('pendente', 'confirmado')
      and a.hora_inicio < p_fim and a.hora_fim > p_inicio
      and (p_ignorar is null or a.id <> p_ignorar)
  ) then
    return 'Horário já ocupado';
  end if;
  return null;
end;
$$;

-- Horários livres para uma data, considerando a duração total dos serviços
create or replace function public.get_available_slots(p_data date, p_duracao_min integer)
returns table (hora time) language plpgsql stable security definer set search_path = '' as $$
declare
  s public.settings;
  h public.business_hours;
  v_passo interval;
  v_dur interval;
  t time;
begin
  select * into s from public.settings where id = 1;
  select * into h from public.business_hours where dia_semana = extract(dow from p_data)::int;
  if h.dia_semana is null or not h.aberto then return; end if;
  if exists (select 1 from public.blocked_dates b where b.data = p_data and b.dia_inteiro) then return; end if;

  v_passo := make_interval(mins => coalesce(s.intervalo_min, 30));
  v_dur := make_interval(mins => greatest(coalesce(p_duracao_min, 0), 5));
  t := h.abertura;
  while t + v_dur <= h.fechamento and t + v_dur > t loop
    if public.slot_error(p_data, t, t + v_dur) is null then
      hora := t;
      return next;
    end if;
    exit when t + v_passo <= t;  -- passaria da meia-noite
    t := t + v_passo;
  end loop;
end;
$$;

-- Horários ocupados (só data e hora, sem dados do cliente)
create or replace function public.get_busy_slots(p_de date, p_ate date)
returns table (data date, hora_inicio time, hora_fim time)
language sql stable security definer set search_path = '' as $$
  select a.data, a.hora_inicio, a.hora_fim
  from public.appointments a
  where a.data between p_de and least(p_ate, p_de + 92)
    and a.status in ('pendente', 'confirmado')
  order by 1, 2;
$$;

-- Agendamento feito pelo visitante no site (sempre "pendente")
create or replace function public.create_public_appointment(
  p_nome text,
  p_whatsapp text,
  p_servicos uuid[],
  p_data date,
  p_hora time,
  p_observacao text default ''
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.settings;
  v_whats text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_snapshot jsonb;
  v_total numeric;
  v_dur integer;
  v_fim time;
  v_erro text;
  v_hoje date;
  v_id uuid;
begin
  select * into s from public.settings where id = 1;
  v_hoje := (now() at time zone coalesce(s.fuso_horario, 'America/Sao_Paulo'))::date;

  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe seu nome'; end if;
  if length(v_whats) < 10 or length(v_whats) > 13 then raise exception 'Informe um WhatsApp válido com DDD'; end if;
  if p_servicos is null or cardinality(p_servicos) = 0 then raise exception 'Escolha pelo menos um serviço'; end if;
  if cardinality(p_servicos) > 6 then raise exception 'Escolha no máximo 6 serviços'; end if;
  if p_data < v_hoje or p_data > v_hoje + 90 then raise exception 'Escolha uma data nos próximos 90 dias'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', sv.id, 'nome', sv.nome, 'preco', sv.preco, 'duracao_min', sv.duracao_min) order by u.ord), '[]'),
         coalesce(sum(sv.preco), 0), coalesce(sum(sv.duracao_min), 0)
    into v_snapshot, v_total, v_dur
    from unnest(p_servicos) with ordinality as u (id, ord)
    join public.services sv on sv.id = u.id and sv.ativo;
  if jsonb_array_length(v_snapshot) <> cardinality(p_servicos) then
    raise exception 'Algum serviço escolhido não está mais disponível';
  end if;

  -- Evita spam: no máximo 3 agendamentos pendentes futuros por WhatsApp
  if (select count(*) from public.appointments a
      where a.cliente_whatsapp = v_whats and a.status = 'pendente' and a.data >= v_hoje) >= 3 then
    raise exception 'Você já tem agendamentos pendentes. Fale com a barbearia pelo WhatsApp.';
  end if;

  perform pg_advisory_xact_lock(hashtext('agenda_' || p_data::text));
  v_fim := p_hora + make_interval(mins => v_dur);
  if v_fim <= p_hora then raise exception 'Horário inválido'; end if;
  v_erro := public.slot_error(p_data, p_hora, v_fim);
  if v_erro is not null then raise exception '%', v_erro; end if;

  insert into public.appointments (cliente_nome, cliente_whatsapp, servicos, data, hora_inicio, hora_fim, valor_total, status, observacao, origem)
  values (trim(p_nome), v_whats, v_snapshot, p_data, p_hora, v_fim, v_total, 'pendente', left(coalesce(p_observacao, ''), 500), 'site')
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'data', p_data, 'hora_inicio', to_char(p_hora, 'HH24:MI'), 'hora_fim', to_char(v_fim, 'HH24:MI'),
    'valor_total', v_total, 'servicos', v_snapshot
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Relatórios do painel
-- ---------------------------------------------------------------------
create or replace function public.month_metrics(p_inicio date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text := coalesce((select fuso_horario from public.settings where id = 1), 'America/Sao_Paulo');
  v_fim date := (p_inicio + interval '1 month')::date;
  v_acessos bigint;
  v_visitantes bigint;
  v_ag bigint;
  v_fat numeric;
  v_prev numeric;
  v_concl bigint;
begin
  select count(*), count(distinct sessao_id) into v_acessos, v_visitantes
    from public.page_views
   where visto_em >= (p_inicio::timestamp at time zone v_tz) and visto_em < (v_fim::timestamp at time zone v_tz);

  select count(*) filter (where status <> 'cancelado'),
         coalesce(sum(valor_total) filter (where status = 'concluido'), 0),
         coalesce(sum(valor_total) filter (where status in ('pendente', 'confirmado')), 0),
         count(*) filter (where status = 'concluido')
    into v_ag, v_fat, v_prev, v_concl
    from public.appointments where data >= p_inicio and data < v_fim;

  return jsonb_build_object(
    'acessos', v_acessos,
    'visitantes', v_visitantes,
    'agendamentos', v_ag,
    'faturamento', v_fat,
    'previsto', v_prev,
    'ticket_medio', case when v_concl > 0 then round(v_fat / v_concl, 2) else 0 end,
    'conversao', case when v_visitantes > 0 then round(v_ag::numeric * 100 / v_visitantes, 1) else 0 end
  );
end;
$$;

create or replace function public.dashboard_summary(p_mes date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text := coalesce((select fuso_horario from public.settings where id = 1), 'America/Sao_Paulo');
  v_ini date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_hoje date := (now() at time zone v_tz)::date;
begin
  if not public.has_perm('dashboard') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'mes', v_ini,
    'atual', public.month_metrics(v_ini),
    'anterior', public.month_metrics((v_ini - interval '1 month')::date),
    'acessos_por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', extract(day from d)::int, 'acessos', coalesce(c.n, 0)) order by d), '[]')
      from generate_series(v_ini, v_fim - 1, interval '1 day') d
      left join (
        select (visto_em at time zone v_tz)::date as dia, count(*) n
        from public.page_views
        where visto_em >= (v_ini::timestamp at time zone v_tz) and visto_em < (v_fim::timestamp at time zone v_tz)
        group by 1
      ) c on c.dia = d::date
    ),
    'faturamento_6_meses', (
      select jsonb_agg(jsonb_build_object('mes', m::date, 'faturamento', coalesce(f.total, 0)) order by m)
      from generate_series(v_ini - interval '5 months', v_ini, interval '1 month') m
      left join (
        select date_trunc('month', data) as mes, sum(valor_total) total
        from public.appointments
        where status = 'concluido' and data >= v_ini - interval '5 months' and data < v_fim
        group by 1
      ) f on f.mes = m
    ),
    'servicos_top', (
      select coalesce(jsonb_agg(t order by t.quantidade desc, t.receita desc), '[]')
      from (
        select x ->> 'nome' as nome, count(*) as quantidade, sum((x ->> 'preco')::numeric) as receita
        from public.appointments a, jsonb_array_elements(a.servicos) x
        where a.data >= v_ini and a.data < v_fim and a.status in ('pendente', 'confirmado', 'concluido')
        group by 1 order by 2 desc limit 8
      ) t
    ),
    'por_hora', (
      select coalesce(jsonb_agg(jsonb_build_object('hora', h, 'quantidade', n) order by h), '[]')
      from (
        select extract(hour from hora_inicio)::int h, count(*) n
        from public.appointments
        where data >= v_ini and data < v_fim and status in ('pendente', 'confirmado', 'concluido')
        group by 1
      ) x
    ),
    'por_dia_semana', (
      select coalesce(jsonb_agg(jsonb_build_object('dia_semana', d, 'quantidade', n) order by d), '[]')
      from (
        select extract(dow from data)::int d, count(*) n
        from public.appointments
        where data >= v_ini and data < v_fim and status in ('pendente', 'confirmado', 'concluido')
        group by 1
      ) x
    ),
    'hoje', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', id, 'cliente_nome', cliente_nome, 'cliente_whatsapp', cliente_whatsapp,
               'servicos', servicos, 'hora_inicio', to_char(hora_inicio, 'HH24:MI'), 'hora_fim', to_char(hora_fim, 'HH24:MI'),
               'valor_total', valor_total, 'status', status) order by hora_inicio), '[]')
      from public.appointments where data = v_hoje and status <> 'cancelado'
    )
  );
end;
$$;

create or replace function public.finance_report(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('financeiro') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'resumo', (
      select jsonb_build_object(
        'faturamento', coalesce(sum(valor_total) filter (where status = 'concluido'), 0),
        'previsto', coalesce(sum(valor_total) filter (where status in ('pendente', 'confirmado')), 0),
        'atendimentos', count(*) filter (where status = 'concluido'),
        'cancelamentos', count(*) filter (where status = 'cancelado'),
        'faltas', count(*) filter (where status = 'nao_compareceu'),
        'total', count(*))
      from public.appointments where data between p_de and p_ate
    ),
    'por_servico', (
      select coalesce(jsonb_agg(t order by t.receita desc), '[]')
      from (
        select x ->> 'nome' as nome, count(*) as quantidade, sum((x ->> 'preco')::numeric) as receita
        from public.appointments a, jsonb_array_elements(a.servicos) x
        where a.data between p_de and p_ate and a.status = 'concluido'
        group by 1
      ) t
    ),
    'por_mes', (
      select coalesce(jsonb_agg(t order by t.mes), '[]')
      from (
        select date_trunc('month', data)::date as mes,
               sum(valor_total) filter (where status = 'concluido') as faturamento,
               count(*) filter (where status = 'concluido') as atendimentos
        from public.appointments where data between p_de and p_ate
        group by 1
      ) t
    ),
    'linhas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'data', data, 'hora_inicio', to_char(hora_inicio, 'HH24:MI'), 'cliente_nome', cliente_nome,
               'cliente_whatsapp', cliente_whatsapp,
               'servicos', (select string_agg(x ->> 'nome', ' + ') from jsonb_array_elements(servicos) x),
               'valor_total', valor_total, 'status', status, 'origem', origem) order by data, hora_inicio), '[]')
      from public.appointments where data between p_de and p_ate
    )
  );
end;
$$;

create or replace function public.list_clients(p_busca text default '')
returns table (
  cliente_whatsapp text, cliente_nome text, visitas bigint, agendamentos bigint,
  ultimo_atendimento date, total_gasto numeric
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_busca text := trim(coalesce(p_busca, ''));
  v_digitos text := regexp_replace(v_busca, '\D', '', 'g');
begin
  if not public.has_perm('clientes') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query
    select a.cliente_whatsapp,
           (array_agg(a.cliente_nome order by a.data desc, a.hora_inicio desc))[1],
           count(*) filter (where a.status = 'concluido'),
           count(*),
           max(a.data) filter (where a.status = 'concluido'),
           coalesce(sum(a.valor_total) filter (where a.status = 'concluido'), 0)
    from public.appointments a
    group by a.cliente_whatsapp
    having v_busca = ''
        or bool_or(a.cliente_nome ilike '%' || v_busca || '%')
        or (v_digitos <> '' and a.cliente_whatsapp like '%' || v_digitos || '%')
    order by 5 desc nulls last, 2;
end;
$$;

-- Contador do sino (só para o dono)
create or replace function public.pending_requests_count()
returns integer language sql stable security definer set search_path = '' as $$
  select case when public.is_owner()
    then (select count(*)::int from public.profiles where status = 'pendente') else 0 end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.settings       enable row level security;
alter table public.services       enable row level security;
alter table public.business_hours enable row level security;
alter table public.blocked_dates  enable row level security;
alter table public.appointments   enable row level security;
alter table public.page_views     enable row level security;
alter table public.profiles       enable row level security;
alter table public.activity_log   enable row level security;

-- settings
create policy "settings: leitura pública" on public.settings for select to anon, authenticated using (true);
create policy "settings: editar com permissão" on public.settings for update to authenticated
  using (public.has_perm('configuracoes') or public.has_perm('disponibilidade'))
  with check (public.has_perm('configuracoes') or public.has_perm('disponibilidade'));

-- services
create policy "services: ativos são públicos" on public.services for select to anon using (ativo);
create policy "services: equipe vê todos" on public.services for select to authenticated using (ativo or public.is_staff());
create policy "services: criar" on public.services for insert to authenticated with check (public.has_perm('servicos'));
create policy "services: editar" on public.services for update to authenticated
  using (public.has_perm('servicos')) with check (public.has_perm('servicos'));
create policy "services: excluir" on public.services for delete to authenticated using (public.has_perm('servicos'));

-- business_hours
create policy "business_hours: leitura pública" on public.business_hours for select to anon, authenticated using (true);
create policy "business_hours: editar" on public.business_hours for update to authenticated
  using (public.has_perm('disponibilidade')) with check (public.has_perm('disponibilidade'));

-- blocked_dates
create policy "blocked_dates: leitura pública" on public.blocked_dates for select to anon, authenticated using (true);
create policy "blocked_dates: criar" on public.blocked_dates for insert to authenticated with check (public.has_perm('disponibilidade'));
create policy "blocked_dates: editar" on public.blocked_dates for update to authenticated
  using (public.has_perm('disponibilidade')) with check (public.has_perm('disponibilidade'));
create policy "blocked_dates: excluir" on public.blocked_dates for delete to authenticated using (public.has_perm('disponibilidade'));

-- appointments (visitante agenda pela função create_public_appointment)
create policy "appointments: ler" on public.appointments for select to authenticated
  using (public.has_perm('agenda') or public.has_perm('financeiro') or public.has_perm('clientes') or public.has_perm('dashboard'));
create policy "appointments: criar manual" on public.appointments for insert to authenticated
  with check (public.has_perm('agendamento_manual') and origem = 'manual');
create policy "appointments: editar" on public.appointments for update to authenticated
  using (public.has_perm('agenda')) with check (public.has_perm('agenda'));
create policy "appointments: excluir" on public.appointments for delete to authenticated using (public.has_perm('agenda'));

-- page_views
create policy "page_views: registrar visita" on public.page_views for insert to anon, authenticated with check (true);
create policy "page_views: ler" on public.page_views for select to authenticated using (public.has_perm('dashboard'));

-- profiles
create policy "profiles: ver o próprio" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: dono vê todos" on public.profiles for select to authenticated using (public.is_owner());
create policy "profiles: editar o próprio" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and status = 'aprovado') with check (id = (select auth.uid()));
create policy "profiles: dono edita" on public.profiles for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- activity_log
create policy "activity_log: só o dono" on public.activity_log for select to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
revoke all on public.profiles from anon;
revoke insert, delete on public.profiles from authenticated;
revoke all on public.appointments from anon;
revoke all on public.page_views from anon;
grant insert on public.page_views to anon;
revoke update, delete on public.page_views from authenticated;
revoke insert, delete on public.settings from anon, authenticated;
revoke insert, delete on public.business_hours from anon, authenticated;
revoke insert, update, delete on public.services, public.blocked_dates from anon;
revoke update, delete, truncate on public.settings, public.business_hours from anon;

-- Funções internas: ninguém chama direto
revoke execute on function public.log_activity(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.build_services_snapshot(jsonb) from public, anon;
revoke execute on function public.month_metrics(date) from public, anon, authenticated;
revoke execute on function public.slot_error(date, time, time, uuid) from public, anon;

-- Funções do painel: só usuários logados (cada uma checa permissão por dentro)
revoke execute on function public.dashboard_summary(date) from public, anon;
revoke execute on function public.finance_report(date, date) from public, anon;
revoke execute on function public.list_clients(text) from public, anon;
revoke execute on function public.pending_requests_count() from public, anon;
revoke execute on function public.touch_last_access() from public, anon;
revoke execute on function public.clear_must_change_password() from public, anon;

-- Funções públicas do site
grant execute on function public.get_available_slots(date, integer) to anon, authenticated;
grant execute on function public.get_busy_slots(date, date) to anon, authenticated;
grant execute on function public.create_public_appointment(text, text, uuid[], date, time, text) to anon, authenticated;

-- Realtime para o sino de solicitações e para a agenda
alter publication supabase_realtime add table public.profiles, public.appointments;
