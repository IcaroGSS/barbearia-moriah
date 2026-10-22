-- Nome do cargo com acento no registro de atividades ("recepção" em vez de "recepcao")
create or replace function public.cargo_label(p public.cargo)
returns text language sql immutable set search_path = '' as $$
  select case p when 'dono' then 'dono' when 'gerente' then 'gerente' when 'barbeiro' then 'barbeiro' when 'recepcao' then 'recepção' end;
$$;

create or replace function public.profiles_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() = new.id then
    return new;
  end if;
  if old.status = 'pendente' and new.status = 'aprovado' then
    perform public.log_activity('usuario.aprovar',
      'aprovou acesso de ' || new.nome || ' como ' || public.cargo_label(new.cargo), 'profiles', new.id::text);
  elsif new.status is distinct from old.status then
    perform public.log_activity('usuario.' || new.status::text,
      case new.status when 'bloqueado' then 'bloqueou ' when 'aprovado' then 'desbloqueou ' else 'alterou o status de ' end || new.nome,
      'profiles', new.id::text);
  elsif new.cargo is distinct from old.cargo or new.permissoes is distinct from old.permissoes then
    perform public.log_activity('usuario.permissoes',
      'alterou cargo/permissões de ' || new.nome || ' (' || public.cargo_label(new.cargo) || ')', 'profiles', new.id::text);
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_log() from public, anon, authenticated;
