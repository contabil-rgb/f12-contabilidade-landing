-- Portal de Gestao Contabil - Validacao da base da automacao de lembretes
-- Execute depois de 20260924110000_checklist_automacao_base.sql.
-- Este script apenas consulta a estrutura e os dados iniciais.

with verificacoes as (
  select
    'tabelas da automacao'::text as verificacao,
    (
      to_regclass('public.checklist_automacao_configuracao') is not null
      and to_regclass('public.checklist_automacao_clientes') is not null
      and to_regclass('public.checklist_automacao_feriados') is not null
      and to_regclass('public.checklist_automacao_execucoes') is not null
      and to_regclass('public.checklist_automacao_auditoria') is not null
    ) as ok,
    'cinco tabelas esperadas'::text as detalhe

  union all

  select
    'configuracao inicial segura',
    exists (
      select 1
      from public.checklist_automacao_configuracao c
      where c.id = 1
        and c.ativa = false
        and c.modo = 'TESTE'
        and c.fuso_horario = 'America/Manaus'
        and c.dia_util_ordem = 2
        and c.horario_local = time '08:00'
        and c.tentativas_max = 3
        and c.intervalos_tentativas_minutos = array[0, 15, 45]
    ),
    'pausada, modo TESTE, Manaus, 08:00 e tres tentativas'

  union all

  select
    'clientes protegidos',
    (
      (select count(*) from public.checklist_automacao_clientes)
        = (select count(*) from public.clientes)
      and not exists (
        select 1
        from public.checklist_automacao_clientes ac
        where ac.habilitada = true
      )
    ),
    'todos os clientes existentes com automacao desabilitada'

  union all

  select
    'calendario de Manaus',
    (
      (select count(*) from public.checklist_automacao_feriados where extract(year from data) = 2026) = 15
      and public.checklist_data_pascoa(2026) = date '2026-04-05'
      and exists (
        select 1
        from public.checklist_automacao_feriados
        where data = date '2026-09-05'
          and abrangencia = 'ESTADUAL'
          and ativo = true
      )
      and exists (
        select 1
        from public.checklist_automacao_feriados
        where data = date '2026-02-17'
          and abrangencia = 'MUNICIPAL'
          and ativo = true
      )
    ),
    '15 feriados de 2026, incluindo Carnaval municipal e 5 de setembro estadual'

  union all

  select
    'calculo do segundo dia util',
    (
      public.checklist_segundo_dia_util_manaus(2026, 1) = date '2026-01-05'
      and public.checklist_segundo_dia_util_manaus(2026, 2) = date '2026-02-03'
      and public.checklist_segundo_dia_util_manaus(2027, 1) = date '2027-01-05'
    ),
    'janeiro/2026, fevereiro/2026 e janeiro/2027 conferidos'

  union all

  select
    'RLS das tabelas',
    not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'checklist_automacao_configuracao',
          'checklist_automacao_clientes',
          'checklist_automacao_feriados',
          'checklist_automacao_execucoes',
          'checklist_automacao_auditoria'
        )
        and c.relrowsecurity = false
    ),
    'RLS ativo nas cinco tabelas'

  union all

  select
    'gravacao direta bloqueada',
    (
      not has_table_privilege('authenticated', 'public.checklist_automacao_configuracao', 'INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated', 'public.checklist_automacao_clientes', 'INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated', 'public.checklist_automacao_feriados', 'INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated', 'public.checklist_automacao_execucoes', 'INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated', 'public.checklist_automacao_auditoria', 'INSERT,UPDATE,DELETE')
    ),
    'authenticated consulta, mas nao grava diretamente'

  union all

  select
    'funcoes de calendario',
    (
      to_regprocedure('public.checklist_data_pascoa(integer)') is not null
      and to_regprocedure('public.popular_checklist_feriados_manaus(integer)') is not null
      and to_regprocedure('public.checklist_eh_dia_util_manaus(date)') is not null
      and to_regprocedure('public.checklist_segundo_dia_util_manaus(integer,integer)') is not null
    ),
    'quatro funcoes disponiveis'

  union all

  select
    'nenhuma execucao criada',
    not exists (select 1 from public.checklist_automacao_execucoes),
    'a Etapa 2 nao inicia nem agenda execucoes'
)
select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from verificacoes
order by verificacao;

