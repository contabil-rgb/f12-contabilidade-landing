-- Portal de Gestao Contabil - Validacao do acionamento do teste agendado
-- Etapa 8, parte 4: somente leitura; nao cria agendamentos nem envia e-mails.

with verificacoes as (
  select
    'automacao mensal permanece pausada'::text as verificacao,
    exists (
      select 1
      from public.checklist_automacao_configuracao c
      where c.id = 1
        and c.modo = 'TESTE'
        and c.ativa = false
    ) as ok,
    'o cron de teste exige modo TESTE e pausa global'::text as detalhe

  union all

  select
    'funcao interna protegida',
    to_regprocedure('public.invocar_checklist_automacao_edge_interno(text,jsonb)') is not null
    and not has_function_privilege('anon', 'public.invocar_checklist_automacao_edge_interno(text,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.invocar_checklist_automacao_edge_interno(text,jsonb)', 'EXECUTE'),
    'anon e authenticated nao podem invocar Edge Functions internas'

  union all

  select
    'processador agendado permitido',
    pg_get_functiondef('public.invocar_checklist_automacao_edge_interno(text,jsonb)'::regprocedure)
      like '%processar-checklist-automacao-agendada-teste%',
    'a lista interna permite somente as tres funcoes conhecidas da automacao'

  union all

  select
    'cron isolado ativo',
    exists (
      select 1
      from cron.job j
      where j.jobname = 'checklist-automacao-teste-agendado-manaus'
        and j.schedule = '* * * * *'
        and j.active
        and j.command like '%processar-checklist-automacao-agendada-teste%'
    ),
    'o teste agendado e verificado uma vez por minuto'

  union all

  select
    'cron condicionado ao modo seguro',
    exists (
      select 1
      from cron.job j
      where j.jobname = 'checklist-automacao-teste-agendado-manaus'
        and j.command like '%c.modo = ''TESTE''%'
        and j.command like '%c.ativa = false%'
        and j.command like '%a.disponivel_em <= now()%'
    ),
    'nenhuma chamada ocorre sem pausa global e um agendamento vencido'

  union all

  select
    'cron unico para o teste agendado',
    (
      select count(*) = 1
      from cron.job j
      where j.jobname = 'checklist-automacao-teste-agendado-manaus'
    ),
    'reexecucoes da migracao nao duplicam o cron'

  union all

  select
    'crons mensais preservados',
    (
      select count(*) = 2
      from cron.job j
      where j.jobname in (
        'checklist-automacao-coordenador-manaus',
        'checklist-automacao-worker-manaus'
      )
        and j.active
    ),
    'o coordenador e o worker mensal continuam instalados sem alteracao'

  union all

  select
    'credenciais fora do cron',
    not exists (
      select 1
      from cron.job j
      where j.jobname = 'checklist-automacao-teste-agendado-manaus'
        and (
          j.command ilike '%sb_secret_%'
          or j.command ilike '%eyJhbGci%'
          or j.command ilike '%apikey%'
          or j.command ilike '%authorization%'
        )
    ),
    'o cron consulta o Vault por meio da funcao protegida'
)
select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from verificacoes
order by verificacao;

