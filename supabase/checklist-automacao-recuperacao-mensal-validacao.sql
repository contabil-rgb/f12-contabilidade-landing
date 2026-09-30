-- Validacao somente leitura da recuperacao mensal.

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from (
  select
    'coordenador com recuperacao'::text as verificacao,
    exists (
      select 1 from cron.job
      where jobname = 'checklist-automacao-coordenador-manaus'
        and schedule = '*/5 12-15 * * *'
        and active
    ) as ok,
    'verificacao a cada cinco minutos, das 08:00 as 11:55 de Manaus'::text as detalhe

  union all

  select
    'worker cobre a janela completa',
    exists (
      select 1 from cron.job
      where jobname = 'checklist-automacao-worker-manaus'
        and schedule = '* 12-16 * * *'
        and active
    ),
    'a fila e retomada a cada minuto e pode concluir tentativas ate 12:59 de Manaus'

  union all

  select
    'registro interno protegido',
    not has_function_privilege('anon', 'public.registrar_checklist_automacao_recuperacao_interno(uuid,integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.registrar_checklist_automacao_recuperacao_interno(uuid,integer)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.registrar_checklist_automacao_recuperacao_interno(uuid,integer)', 'EXECUTE'),
    'somente o backend pode registrar uma recuperacao'

  union all

  select
    'modo seguro preservado',
    exists (
      select 1 from public.checklist_automacao_configuracao
      where id = 1 and modo = 'TESTE' and ativa = false
    ),
    'a implantacao nao ativou a automacao global nem o modo REAL'

  union all

  select
    'nenhum trabalho pendente',
    not exists (
      select 1 from public.checklist_automacao_trabalhos
      where status in ('PREPARADO', 'PROCESSANDO', 'AGUARDANDO_NOVA_TENTATIVA')
    ),
    'a validacao nao deixou itens na fila'
) validacoes
order by verificacao;
