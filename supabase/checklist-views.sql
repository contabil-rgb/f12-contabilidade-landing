-- Portal de Gestao Contabil - Checklist de documentos mensais
-- Etapa 1: views de leitura para pendencias e resumo.
-- Execute depois de supabase/checklist.sql e supabase/checklist-funcoes.sql.
-- Pode ser executado mais de uma vez com seguranca.

-- As views projetam competencias dos ultimos 12 meses ate a competencia atual.
-- Para filtros livres no frontend, consulte checklist_status diretamente ou crie RPCs parametrizadas nas proximas etapas.

drop view if exists public.vw_checklist_resumo;
drop view if exists public.vw_checklist_pendencias;

create view public.vw_checklist_pendencias
with (security_invoker = true)
as
with competencias as (
  select
    extract(year from competencia)::integer as ano,
    extract(month from competencia)::integer as mes,
    competencia::date as competencia_inicio
  from generate_series(
    date_trunc('month', current_date) - interval '12 months',
    date_trunc('month', current_date),
    interval '1 month'
  ) competencia
), clientes_ativos as (
  select c.*
  from public.clientes c
  where coalesce(c.arquivado, false) = false
    and lower(coalesce(c.status, '')) <> 'inativo'
)
select
  c.id as cliente_id,
  c.cnpj,
  c.razao_social,
  c.nome_identificacao,
  c.responsavel,
  c.revisor,
  comp.ano,
  comp.mes,
  make_date(comp.ano, comp.mes, 1) as competencia_inicio,
  i.id as item_id,
  i.descricao as item_descricao,
  cci.ordem as item_ordem_cliente,
  coalesce(s.status, 'PENDENTE') as status,
  s.atualizado_em as status_atualizado_em,
  u.nome as status_atualizado_por_nome,
  contato.email,
  contato.cc
from clientes_ativos c
join public.checklist_clientes_itens cci
  on cci.cliente_id = c.id
 and cci.ativo = true
join public.checklist_itens i
  on i.id = cci.item_id
 and i.ativo = true
cross join competencias comp
left join public.checklist_status s
  on s.cliente_id = c.id
 and s.item_id = i.id
 and s.ano = comp.ano
 and s.mes = comp.mes
left join public.usuarios u
  on u.id = s.atualizado_por
left join public.checklist_contatos contato
  on contato.cliente_id = c.id
where coalesce(s.status, 'PENDENTE') = 'PENDENTE';

create view public.vw_checklist_resumo
with (security_invoker = true)
as
with competencias as (
  select
    extract(year from competencia)::integer as ano,
    extract(month from competencia)::integer as mes,
    competencia::date as competencia_inicio
  from generate_series(
    date_trunc('month', current_date) - interval '12 months',
    date_trunc('month', current_date),
    interval '1 month'
  ) competencia
), clientes_ativos as (
  select c.*
  from public.clientes c
  where coalesce(c.arquivado, false) = false
    and lower(coalesce(c.status, '')) <> 'inativo'
), base as (
  select
    c.id as cliente_id,
    c.cnpj,
    c.razao_social,
    c.nome_identificacao,
    c.responsavel,
    c.revisor,
    comp.ano,
    comp.mes,
    i.id as item_id,
    coalesce(s.status, 'PENDENTE') as status
  from clientes_ativos c
  join public.checklist_clientes_itens cci
    on cci.cliente_id = c.id
   and cci.ativo = true
  join public.checklist_itens i
    on i.id = cci.item_id
   and i.ativo = true
  cross join competencias comp
  left join public.checklist_status s
    on s.cliente_id = c.id
   and s.item_id = i.id
   and s.ano = comp.ano
   and s.mes = comp.mes
)
select
  cliente_id,
  cnpj,
  razao_social,
  nome_identificacao,
  responsavel,
  revisor,
  ano,
  mes,
  count(*)::integer as total_itens,
  count(*) filter (where status = 'OK')::integer as qtd_ok,
  count(*) filter (where status = 'NA')::integer as qtd_nao_aplicavel,
  count(*) filter (where status = 'ERP')::integer as qtd_erp,
  count(*) filter (where status = 'PENDENTE')::integer as qtd_pendentes,
  case
    when count(*) = 0 then 0
    else round(
      (
        count(*) filter (where status in ('OK', 'NA', 'ERP'))::numeric
        / count(*)::numeric
      ) * 100,
      2
    )
  end as percentual_concluido
from base
group by
  cliente_id,
  cnpj,
  razao_social,
  nome_identificacao,
  responsavel,
  revisor,
  ano,
  mes;

grant select on public.vw_checklist_pendencias to authenticated;
grant select on public.vw_checklist_resumo to authenticated;
