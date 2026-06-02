-- Portal de Gestao Contabil - Camada persistente de acompanhamento operacional
-- Esta etapa depende das colunas adicionadas em clientes-campos-acompanhamento.sql
-- e da funcao public.is_text_yes criada em obrigacoes-status.sql.
-- Pode ser executado mais de uma vez com seguranca.
--
-- Contrato da view:
-- - cliente_id
-- - cliente_notificado_bool
-- - data_notificacao_cliente
-- - status_retorno_cliente
-- - data_retorno_cliente
-- - proxima_acao
-- - prazo_proxima_acao
-- - retorno_recebido
-- - aguardando_retorno
-- - sem_retorno
-- - prazo_proxima_acao_vencido
-- - prazo_proxima_acao_proximo
-- - acompanhamento_pendente
-- - dias_sem_retorno
-- - dias_para_prazo
-- - status_acompanhamento_codigo
-- - status_acompanhamento_label

create or replace view public.vw_clientes_acompanhamento_operacional
with (security_invoker = true)
as
with base as (
  select
    c.id as cliente_id,
    c.cnpj,
    c.razao_social,
    c.nome_identificacao,
    c.cliente_notificado,
    c.data_notificacao_cliente,
    c.status_retorno_cliente,
    c.data_retorno_cliente,
    c.proxima_acao,
    c.prazo_proxima_acao
  from public.clientes c
),
flags as (
  select
    b.*,
    public.is_text_yes(b.cliente_notificado) as cliente_notificado_bool,
    lower(trim(coalesce(b.status_retorno_cliente, ''))) as status_retorno_cliente_normalizado,
    case
      when b.data_notificacao_cliente is not null then current_date - b.data_notificacao_cliente
      else null
    end as dias_sem_retorno_base,
    case
      when b.prazo_proxima_acao is not null then b.prazo_proxima_acao - current_date
      else null
    end as dias_para_prazo
  from base b
),
status_base as (
  select
    f.*,
    (
      f.data_retorno_cliente is not null
      or f.status_retorno_cliente_normalizado = lower('Retorno recebido')
      or f.status_retorno_cliente_normalizado = lower('Concluido')
    ) as retorno_recebido,
    (
      f.cliente_notificado_bool
      and f.status_retorno_cliente_normalizado = lower('Sem retorno')
      and f.data_retorno_cliente is null
    ) as sem_retorno,
    (
      f.prazo_proxima_acao is not null
      and f.prazo_proxima_acao < current_date
    ) as prazo_proxima_acao_vencido,
    (
      f.prazo_proxima_acao is not null
      and f.prazo_proxima_acao >= current_date
      and f.prazo_proxima_acao <= (current_date + 3)
    ) as prazo_proxima_acao_proximo
  from flags f
),
status_flags as (
  select
    s.*,
    (
      s.cliente_notificado_bool
      and not s.retorno_recebido
      and (
        s.status_retorno_cliente_normalizado = ''
        or s.status_retorno_cliente_normalizado = lower('Aguardando retorno')
        or s.status_retorno_cliente_normalizado = lower('Sem retorno')
      )
    ) as aguardando_retorno
  from status_base s
)
select
  sf.cliente_id,
  sf.cnpj,
  sf.razao_social,
  sf.nome_identificacao,
  sf.cliente_notificado_bool,
  sf.data_notificacao_cliente,
  sf.status_retorno_cliente,
  sf.data_retorno_cliente,
  sf.proxima_acao,
  sf.prazo_proxima_acao,
  sf.retorno_recebido,
  sf.aguardando_retorno,
  sf.sem_retorno,
  sf.prazo_proxima_acao_vencido,
  sf.prazo_proxima_acao_proximo,
  (
    sf.aguardando_retorno
    or sf.prazo_proxima_acao_vencido
    or sf.prazo_proxima_acao_proximo
  ) as acompanhamento_pendente,
  case
    when sf.aguardando_retorno then sf.dias_sem_retorno_base
    else null
  end as dias_sem_retorno,
  sf.dias_para_prazo,
  case
    when sf.prazo_proxima_acao_vencido then 'prazo_vencido'
    when sf.sem_retorno then 'sem_retorno'
    when sf.aguardando_retorno then 'aguardando_retorno'
    when sf.retorno_recebido then 'retorno_recebido'
    when sf.cliente_notificado_bool then 'notificado'
    else 'sem_notificacao'
  end as status_acompanhamento_codigo,
  case
    when sf.prazo_proxima_acao_vencido then 'Prazo vencido'
    when sf.sem_retorno then 'Sem retorno'
    when sf.aguardando_retorno then 'Aguardando retorno'
    when sf.retorno_recebido then 'Retorno recebido'
    when sf.cliente_notificado_bool then 'Notificado'
    else 'Sem notificacao'
  end as status_acompanhamento_label
from status_flags sf;

grant select on public.vw_clientes_acompanhamento_operacional to authenticated;
