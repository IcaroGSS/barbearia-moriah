-- Valores padrão da primeira instalação (depois tudo é editado pelo painel /admin)
insert into public.settings (id, nome, slogan, whatsapp, endereco, instagram, tema, intervalo_min, textos)
values (
  1,
  'Barbearia Moriah',
  'Estilo, cuidado e tradição em cada corte',
  '',
  '',
  '',
  'ouro',
  30,
  jsonb_build_object(
    'hero_titulo', 'Seu estilo começa aqui',
    'hero_subtitulo', 'Corte, barba e cuidado com hora marcada. Escolha o serviço, o horário e confirme pelo WhatsApp.',
    'sobre_titulo', 'Sobre a Moriah',
    'sobre_texto', 'Uma barbearia feita para você se sentir em casa: ambiente acolhedor, profissionais caprichosos e atendimento pontual.',
    'agendar_titulo', 'Agende seu horário',
    'agendar_texto', 'Escolha os serviços, o dia e o horário. A confirmação é feita pelo WhatsApp.',
    'contato_titulo', 'Onde estamos',
    'rodape', 'Barbearia Moriah. Todos os direitos reservados.'
  )
)
on conflict (id) do nothing;

insert into public.business_hours (dia_semana, aberto, abertura, fechamento, almoco_inicio, almoco_fim) values
  (0, false, '09:00', '13:00', null, null),
  (1, false, '09:00', '19:00', null, null),
  (2, true,  '09:00', '19:00', '12:00', '13:00'),
  (3, true,  '09:00', '19:00', '12:00', '13:00'),
  (4, true,  '09:00', '19:00', '12:00', '13:00'),
  (5, true,  '09:00', '19:00', '12:00', '13:00'),
  (6, true,  '08:00', '17:00', '12:00', '13:00')
on conflict (dia_semana) do nothing;

insert into public.services (nome, descricao, preco, duracao_min, ordem)
select * from (values
  ('Corte', 'Corte masculino com acabamento na máquina e tesoura.', 40.00, 30, 1),
  ('Barba', 'Barba modelada com toalha quente e navalha.', 30.00, 30, 2),
  ('Corte + Barba', 'O combo completo para sair renovado.', 65.00, 60, 3),
  ('Sobrancelha', 'Limpeza e alinhamento na navalha.', 15.00, 15, 4),
  ('Pigmentação', 'Pigmentação de barba ou cabelo para disfarçar falhas.', 35.00, 30, 5)
) as v (nome, descricao, preco, duracao_min, ordem)
where not exists (select 1 from public.services);
