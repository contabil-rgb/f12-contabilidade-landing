-- Portal de Gestao Contabil - View resumo de follow-ups por cliente
-- Esta etapa depende da tabela public.clientes_followups ja criada.
-- Pode ser executada mais de uma vez com seguranca.
--
-- Contrato da view:
-- - cliente_id
-- - cnpj
-- - razao_social
-- - nome_identificacao
-- - total_followups
-- - followups_abertos
-- - followups_concluidos
-- - followups_cancelados
-- - followups_aguardando_retorno
-- - followups_atrasados
-- - followups_proximos
-- - ultimo_followup_id
-- - ultimo_followup_tipo
-- - ultimo_followup_status
-- - ultimo_followup_data_contato
-- - ultimo_followup_criado_em
-- - proximo_followup_id
-- - proximo_followup_tipo
-- - proximo_followup_status
-- - proximo_followup_prioridade
-- - proximo_followup_data_prevista
-- - proximo_followup_proxima_acao
-- - proximo_followup_descricao
-- - proximo_followup_responsavel_usuario_id
-- - proximo_followup_responsavel_nome
-- - proximo_followup_responsavel_email
-- - dias_para_proximo_followup
-- - followup_pendente
-- - status_followup_codigo
-- - status_followup_label

create or replace view public.vw_clientes_followups_resumo
with (security_invoker = true)
as
with followups_normalizados as (
  select
    f.*,
    lower(trim(coalesce(f.status, ''))) as status_normalizado,
    lower(trim(coalesce(f.prioridade, ''))) as prioridade_normalizada
  from public.clientes_followups f
),
followups_enriquecidos as (
  select
    fn.*,
    (fn.status_normalizado not in ('concluido', 'cancelado')) as aberto,
    (fn.status_normalizado = 'concluido') as concluido,
    (fn.status_normalizado = 'cancelado') as cancelado,
    (fn.status_normalizado = 'aguardando retorno') as aguardando_retorno,
    (
      fn.status_normalizado not in ('concluido', 'cancelado')
      and fn.data_prevista is not null
      and fn.data_prevista < current_date
    ) as atrasado,
    (
      fn.status_normalizado not in ('concluido', 'cancelado')
      and fn.data_prevista is not null
      and fn.data_prevista >= current_date
      and fn.data_prevista <= (current_date + 3)
    ) as proximo,
    case
      when fn.status_normalizado = 'aguardando retorno' then 0
      when fn.prioridade_normalizada = 'alta' then 1
      when fn.prioridade_normalizada = 'media' then 2
      else 3
    end as prioridade_ordem
  from followups_normalizados fn
),
agregado as (
  select
    fe.cliente_id,
    count(*) as total_followups,
    count(*) filter (where fe.aberto) as followups_abertos,
    count(*) filter (where fe.concluido) as followups_concluidos,
    count(*) filter (where fe.cancelado) as followups_cancelados,
    count(*) filter (where fe.aguardando_retorno) as followups_aguardando_retorno,
    count(*) filter (where fe.atrasado) as followups_atrasados,
    count(*) filter (where fe.proximo) as followups_proximos
  from followups_enriquecidos fe
  group by fe.cliente_id
),
ultimo_followup as (
  select *
  from (
    select
      fe.*,
      row_number() over (
        partition by fe.cliente_id
        order by coalesce(fe.data_contato, fe.criado_em::date) desc, fe.criado_em desc
      ) as rn
    from followups_enriquecidos fe
  ) ranked
  where ranked.rn = 1
),
proximo_followup as (
  select *
  from (
    select
      fe.*,
      row_number() over (
        partition by fe.cliente_id
        order by
          case when fe.atrasado then 0 else 1 end,
          case when fe.data_prevista is null then 1 else 0 end,
          fe.data_prevista asc,
          fe.prioridade_ordem asc,
          fe.criado_em desc
      ) as rn
    from followups_enriquecidos fe
    where fe.aberto
  ) ranked
  where ranked.rn = 1
)
select
  c.id as cliente_id,
  c.cnpj,
  c.razao_social,
  c.nome_identificacao,
  coalesce(a.total_followups, 0) as total_followups,
  coalesce(a.followups_abertos, 0) as followups_abertos,
  coalesce(a.followups_concluidos, 0) as followups_concluidos,
  coalesce(a.followups_cancelados, 0) as followups_cancelados,
  coalesce(a.followups_aguardando_retorno, 0) as followups_aguardando_retorno,
  coalesce(a.followups_atrasados, 0) as followups_atrasados,
  coalesce(a.followups_proximos, 0) as followups_proximos,
  uf.id as ultimo_followup_id,
  uf.tipo as ultimo_followup_tipo,
  uf.status as ultimo_followup_status,
  uf.data_contato as ultimo_followup_data_contato,
  uf.criado_em as ultimo_followup_criado_em,
  pf.id as proximo_followup_id,
  pf.tipo as proximo_followup_tipo,
  pf.status as proximo_followup_status,
  pf.prioridade as proximo_followup_prioridade,
  pf.data_prevista as proximo_followup_data_prevista,
  pf.proxima_acao as proximo_followup_proxima_acao,
  pf.descricao as proximo_followup_descricao,
  pf.responsavel_usuario_id as proximo_followup_responsavel_usuario_id,
  ru.nome as proximo_followup_responsavel_nome,
  ru.email as proximo_followup_responsavel_email,
  case
    when pf.data_prevista is not null then pf.data_prevista - current_date
    else null
  end as dias_para_proximo_followup,
  (coalesce(a.followups_abertos, 0) > 0) as followup_pendente,
  case
    when coalesce(a.followups_atrasados, 0) > 0 then 'prazo_vencido'
    when coalesce(a.followups_aguardando_retorno, 0) > 0 then 'aguardando_retorno'
    when coalesce(a.followups_proximos, 0) > 0 then 'prazo_proximo'
    when coalesce(a.followups_abertos, 0) > 0 then 'em_aberto'
    when coalesce(a.followups_concluidos, 0) > 0 then 'concluido'
    else 'sem_followup'
  end as status_followup_codigo,
  case
    when coalesce(a.followups_atrasados, 0) > 0 then 'Prazo vencido'
    when coalesce(a.followups_aguardando_retorno, 0) > 0 then 'Aguardando retorno'
    when coalesce(a.followups_proximos, 0) > 0 then 'Prazo proximo'
    when coalesce(a.followups_abertos, 0) > 0 then 'Em aberto'
    when coalesce(a.followups_concluidos, 0) > 0 then 'Concluido'
    else 'Sem follow-up'
  end as status_followup_label
from public.clientes c
left join agregado a
  on a.cliente_id = c.id
left join ultimo_followup uf
  on uf.cliente_id = c.id
left join proximo_followup pf
  on pf.cliente_id = c.id
left join public.usuarios ru
  on ru.id = pf.responsavel_usuario_id;

grant select on public.vw_clientes_followups_resumo to authenticated;
