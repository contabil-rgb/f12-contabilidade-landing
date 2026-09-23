-- Portal de Gestao Contabil - Validacao do historico de envios do checklist
-- Execute no SQL Editor DEPOIS da migracao:
-- supabase/migrations/20260922110000_checklist_envios_historico.sql
-- e da migracao complementar:
-- supabase/migrations/20260922123000_checklist_envios_reserva_idempotente.sql
--
-- Este arquivo e somente para leitura. Ele nao altera tabelas nem dados.

begin transaction read only;

-- 1. Resumo dos registros preservados e sua classificacao.
select
  count(*) as total_registros,
  count(*) filter (where origem = 'MANUAL') as manuais,
  count(*) filter (where origem = 'AUTOMATICO') as automaticos,
  count(*) filter (where status = 'PROCESSANDO') as processando,
  count(*) filter (where status = 'ENVIADO') as enviados,
  count(*) filter (where status = 'FALHOU') as falhas,
  count(*) filter (where status = 'CANCELADO') as cancelados
from public.checklist_envios;

-- 2. Inconsistencias de dados. Todos os resultados devem ser zero.
select
  count(*) filter (
    where cliente_nome is null or nullif(btrim(cliente_nome), '') is null
  ) as cliente_sem_identificacao,
  count(*) filter (
    where chave_idempotencia is null or nullif(btrim(chave_idempotencia), '') is null
  ) as sem_chave_idempotencia,
  count(*) filter (where tentativa < 1) as tentativa_invalida,
  count(*) filter (where jsonb_typeof(competencias) <> 'array') as competencias_invalidas,
  count(*) filter (where jsonb_typeof(itens_cobrados) <> 'array') as itens_cobrados_invalidos,
  count(*) filter (where status = 'ENVIADO' and enviado_em is null) as enviado_sem_data,
  count(*) filter (where status in ('ENVIADO', 'FALHOU', 'CANCELADO') and finalizado_em is null) as finalizado_sem_data,
  count(*) filter (where status = 'FALHOU' and nullif(btrim(coalesce(erro_mensagem, '')), '') is null) as falha_sem_mensagem
from public.checklist_envios;

-- 3. Colunas esperadas na tabela.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'checklist_envios'
order by ordinal_position;

-- 4. Restricoes, incluindo preservacao do historico ao excluir cliente.
select
  conname as restricao,
  contype as tipo,
  pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.checklist_envios'::regclass
order by conname;

-- 5. Indices utilizados pelos filtros, paginacao e idempotencia.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'checklist_envios'
order by indexname;

-- 6. RPCs necessarias para o fluxo e para a pagina de historico.
select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'iniciar_checklist_envio_portal',
    'reservar_checklist_envio_portal',
    'finalizar_checklist_envio_portal',
    'registrar_checklist_envio_portal',
    'listar_checklist_envios_portal'
  )
order by p.proname;

-- 7. RLS e policies. A tabela deve estar com RLS ativo e somente policy de leitura.
select
  c.relrowsecurity as rls_ativo,
  c.relforcerowsecurity as rls_forcado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'checklist_envios';

select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'checklist_envios'
order by policyname;

-- 8. Privilegios do perfil autenticado.
select
  has_table_privilege('authenticated', 'public.checklist_envios', 'SELECT') as pode_consultar,
  has_table_privilege('authenticated', 'public.checklist_envios', 'INSERT') as pode_inserir_diretamente,
  has_table_privilege('authenticated', 'public.checklist_envios', 'UPDATE') as pode_editar_diretamente,
  has_table_privilege('authenticated', 'public.checklist_envios', 'DELETE') as pode_excluir_diretamente;

-- 9. Resultado consolidado. Todas as linhas devem apresentar OK.
with verificacoes as (
  select
    'colunas do historico'::text as verificacao,
    (
      select count(*) = 13
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'checklist_envios'
        and column_name in (
          'cliente_nome',
          'cliente_cnpj',
          'itens_cobrados',
          'origem',
          'status',
          'tentativa',
          'chave_idempotencia',
          'execucao_id',
          'erro_codigo',
          'erro_mensagem',
          'iniciado_em',
          'finalizado_em',
          'atualizado_em'
        )
    ) as ok,
    '13 colunas complementares esperadas'::text as detalhe

  union all

  select
    'dados preservados e consistentes',
    not exists (
      select 1
      from public.checklist_envios e
      where e.cliente_nome is null
        or nullif(btrim(e.cliente_nome), '') is null
        or e.chave_idempotencia is null
        or nullif(btrim(e.chave_idempotencia), '') is null
        or e.tentativa < 1
        or jsonb_typeof(e.competencias) <> 'array'
        or jsonb_typeof(e.itens_cobrados) <> 'array'
        or (e.status = 'ENVIADO' and e.enviado_em is null)
        or (e.status in ('ENVIADO', 'FALHOU', 'CANCELADO') and e.finalizado_em is null)
    ),
    'nenhuma inconsistencia estrutural nos registros'

  union all

  select
    'historico preservado ao excluir cliente',
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.checklist_envios'::regclass
        and conname = 'checklist_envios_cliente_id_fkey'
        and pg_get_constraintdef(oid) ilike '%ON DELETE SET NULL%'
    ),
    'FK de cliente usa ON DELETE SET NULL'

  union all

  select
    'RPCs do historico',
    to_regprocedure('public.iniciar_checklist_envio_portal(jsonb)') is not null
      and to_regprocedure('public.finalizar_checklist_envio_portal(uuid,text,jsonb)') is not null
      and to_regprocedure('public.reservar_checklist_envio_portal(jsonb)') is not null
      and to_regprocedure('public.registrar_checklist_envio_portal(jsonb)') is not null
      and to_regprocedure('public.listar_checklist_envios_portal(jsonb)') is not null,
    'cinco RPCs disponiveis'

  union all

  select
    'RLS da tabela',
    (
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'checklist_envios'
    ),
    'RLS deve permanecer ativo'

  union all

  select
    'gravacao direta bloqueada',
    has_table_privilege('authenticated', 'public.checklist_envios', 'SELECT')
      and not has_table_privilege('authenticated', 'public.checklist_envios', 'INSERT')
      and not has_table_privilege('authenticated', 'public.checklist_envios', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.checklist_envios', 'DELETE'),
    'authenticated consulta, mas nao grava diretamente'
)
select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from verificacoes
order by verificacao;

rollback;
