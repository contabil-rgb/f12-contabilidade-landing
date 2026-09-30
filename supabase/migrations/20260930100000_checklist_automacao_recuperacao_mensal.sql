-- Recuperacao automatica da execucao mensal.
-- O coordenador tenta novamente a cada cinco minutos entre 08:00 e 12:00
-- de Manaus. O worker permanece ate 13:00 para escoar lotes e tentativas.
-- A chave idempotente mensal impede execucoes duplicadas.

begin;

create or replace function public.registrar_checklist_automacao_recuperacao_interno(
  p_execucao_id uuid,
  p_atraso_minutos integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_execucao public.checklist_automacao_execucoes;
begin
  if p_execucao_id is null then
    raise exception 'A execucao e obrigatoria.';
  end if;
  if p_atraso_minutos is null or p_atraso_minutos < 1 or p_atraso_minutos >= 240 then
    raise exception 'O atraso da recuperacao deve estar entre 1 e 239 minutos.';
  end if;

  update public.checklist_automacao_execucoes e
  set detalhes = coalesce(e.detalhes, '{}'::jsonb) || jsonb_build_object(
        'inicio_recuperado', true,
        'recuperado_em', now(),
        'atraso_inicio_minutos', p_atraso_minutos
      )
  where e.id = p_execucao_id
    and e.acionamento = 'AGENDADO'
  returning * into v_execucao;

  if v_execucao.id is null then
    raise exception 'Execucao mensal agendada nao encontrada.';
  end if;

  return jsonb_build_object(
    'registrado', true,
    'execucao_id', v_execucao.id,
    'atraso_minutos', p_atraso_minutos
  );
end;
$$;

revoke all
on function public.registrar_checklist_automacao_recuperacao_interno(uuid, integer)
from public, anon, authenticated;
grant execute
on function public.registrar_checklist_automacao_recuperacao_interno(uuid, integer)
to service_role;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'checklist-automacao-coordenador-manaus',
      'checklist-automacao-worker-manaus'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'checklist-automacao-coordenador-manaus',
  '*/5 12-15 * * *',
  $cron$
    select public.invocar_checklist_automacao_edge_interno(
      'coordenar-checklist-automacao',
      '{"limite": 10}'::jsonb
    )
    where exists (
      select 1
      from public.checklist_automacao_configuracao c
      where c.id = 1
        and c.ativa
    );
  $cron$
);

select cron.schedule(
  'checklist-automacao-worker-manaus',
  '* 12-16 * * *',
  $cron$
    select public.invocar_checklist_automacao_edge_interno(
      'processar-checklist-automacao',
      '{"limite": 10}'::jsonb
    )
    where exists (
      select 1
      from public.checklist_automacao_configuracao c
      where c.id = 1
        and c.ativa
    )
    and exists (
      select 1
      from public.checklist_automacao_trabalhos t
      where (
        t.status in ('PREPARADO', 'AGUARDANDO_NOVA_TENTATIVA')
        and t.disponivel_em <= now()
      )
      or (
        t.status = 'PROCESSANDO'
        and t.reserva_expira_em <= now()
      )
    );
  $cron$
);

commit;
