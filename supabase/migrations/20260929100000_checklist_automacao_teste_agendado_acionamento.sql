-- Portal de Gestao Contabil - Acionamento automatico do teste agendado
-- Etapa 8, parte 4: cron isolado para agendamentos em modo TESTE.
-- Nao ativa a automacao mensal e nao altera os destinatarios congelados no agendamento.

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invocar_checklist_automacao_edge_interno(
  p_funcao text,
  p_corpo jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url_base text;
  v_chave_interna text;
  v_requisicao_id bigint;
begin
  if p_funcao not in (
    'coordenar-checklist-automacao',
    'processar-checklist-automacao',
    'processar-checklist-automacao-agendada-teste'
  ) then
    raise exception 'Funcao da automacao nao permitida: %.', p_funcao;
  end if;

  select s.decrypted_secret
    into v_url_base
  from vault.decrypted_secrets s
  where s.name = 'checklist_automacao_project_url'
  order by s.updated_at desc
  limit 1;

  select s.decrypted_secret
    into v_chave_interna
  from vault.decrypted_secrets s
  where s.name = 'checklist_automacao_internal_key'
  order by s.updated_at desc
  limit 1;

  if nullif(trim(v_url_base), '') is null
     or nullif(trim(v_chave_interna), '') is null then
    raise exception 'Segredos do agendamento da automacao nao configurados no Vault.';
  end if;

  select net.http_post(
    url := rtrim(v_url_base, '/') || '/functions/v1/' || p_funcao,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_chave_interna,
      'Authorization', 'Bearer ' || v_chave_interna
    ),
    body := coalesce(p_corpo, '{}'::jsonb),
    timeout_milliseconds := 30000
  )
  into v_requisicao_id;

  return v_requisicao_id;
end;
$$;

revoke all
on function public.invocar_checklist_automacao_edge_interno(text, jsonb)
from public, anon, authenticated;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname = 'checklist-automacao-teste-agendado-manaus'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'checklist-automacao-teste-agendado-manaus',
  '* * * * *',
  $cron$
    select public.invocar_checklist_automacao_edge_interno(
      'processar-checklist-automacao-agendada-teste',
      '{"limite_agendamentos": 1, "limite_trabalhos": 10, "duracao_reserva_minutos": 10}'::jsonb
    )
    where exists (
      select 1
      from public.checklist_automacao_configuracao c
      where c.id = 1
        and c.modo = 'TESTE'
        and c.ativa = false
    )
    and exists (
      select 1
      from public.checklist_automacao_agendamentos_teste a
      where (
        a.status = 'AGENDADO'
        and a.disponivel_em <= now()
      ) or (
        a.status = 'PROCESSANDO'
        and a.reserva_expira_em <= now()
        and a.falhas_processamento < 3
      )
    );
  $cron$
);

commit;

