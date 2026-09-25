with verificacoes as (
  select
    'automacao permanece pausada'::text as verificacao,
    exists (
      select 1
      from public.checklist_automacao_configuracao c
      where c.id = 1
        and c.ativa = false
        and c.modo = 'TESTE'
    ) as ok,
    'a instalacao do agendamento nao habilita os envios'::text as detalhe

  union all

  select
    'extensoes do agendamento',
    (
      select count(*) = 2
      from pg_extension e
      where e.extname in ('pg_cron', 'pg_net')
    ),
    'pg_cron e pg_net instalados'

  union all

  select
    'segredos no Vault',
    (
      select count(distinct s.name) = 2
      from vault.secrets s
      where s.name in (
        'checklist_automacao_project_url',
        'checklist_automacao_internal_key'
      )
    ),
    'URL do projeto e chave interna armazenadas sem aparecer no agendamento'

  union all

  select
    'funcao interna protegida',
    to_regprocedure(
      'public.invocar_checklist_automacao_edge_interno(text,jsonb)'
    ) is not null
    and not has_function_privilege(
      'anon',
      'public.invocar_checklist_automacao_edge_interno(text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.invocar_checklist_automacao_edge_interno(text,jsonb)',
      'EXECUTE'
    ),
    'anon e authenticated nao podem invocar as Edge Functions internas'

  union all

  select
    'coordenador diario',
    exists (
      select 1
      from cron.job j
      where j.jobname = 'checklist-automacao-coordenador-manaus'
        and j.schedule = '0 12 * * *'
        and j.active
        and j.command like '%coordenar-checklist-automacao%'
        and j.command like '%c.ativa%'
    ),
    '12:00 UTC corresponde a 08:00 em Manaus; a funcao valida o segundo dia util'

  union all

  select
    'worker durante a janela de novas tentativas',
    exists (
      select 1
      from cron.job j
      where j.jobname = 'checklist-automacao-worker-manaus'
        and j.schedule = '* 12 * * *'
        and j.active
        and j.command like '%processar-checklist-automacao%'
        and j.command like '%c.ativa%'
        and j.command like '%t.disponivel_em%'
    ),
    'consulta trabalhos vencidos a cada minuto entre 08:00 e 08:59 em Manaus'

  union all

  select
    'somente dois agendamentos',
    (
      select count(*) = 2
      from cron.job j
      where j.jobname like 'checklist-automacao-%-manaus'
    ),
    'uma coordenacao diaria e um consumidor temporario da fila'

  union all

  select
    'credenciais fora dos comandos',
    not exists (
      select 1
      from cron.job j
      where j.jobname like 'checklist-automacao-%-manaus'
        and (
          j.command ilike '%sb_secret_%'
          or j.command ilike '%eyJhbGci%'
          or j.command ilike '%apikey%'
        )
    ),
    'os comandos do cron chamam apenas a funcao protegida que consulta o Vault'
)
select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from verificacoes
order by verificacao;
