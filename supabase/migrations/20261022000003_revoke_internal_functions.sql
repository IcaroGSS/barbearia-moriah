-- Funções de gatilho e auxiliares internas não precisam ser chamadas pela API
revoke execute on function
  public.appointments_log(), public.appointments_prepare(),
  public.blocked_dates_log(), public.blocked_dates_prepare(),
  public.business_hours_log(), public.profiles_guard(), public.profiles_log(),
  public.services_log(), public.settings_log(), public.page_views_prepare(),
  public.build_services_snapshot(jsonb), public.slot_error(date, time, time, uuid)
from public, anon, authenticated;

-- Funções de checagem de acesso: só fazem sentido para quem está logado
revoke execute on function public.is_staff(), public.is_owner(), public.has_perm(text) from public, anon;
