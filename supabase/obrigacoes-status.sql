-- Portal de Gestao Contabil - Camada persistente de status e pendencias das obrigacoes
-- Esta etapa cria helpers SQL e uma view com o status operacional de REINF / ECD / ECF por cliente.
-- Pode ser executado mais de uma vez com seguranca.

create extension if not exists pgcrypto;

create or replace function public.is_text_yes(value text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(value, ''))) in ('sim', 's', 'yes', 'true', '1');
$$;

create or replace function public.is_text_blank(value text)
returns boolean
language sql
immutable
as $$
  select nullif(trim(coalesce(value, '')), '') is null;
$$;

create or replace view public.vw_clientes_obrigacoes_status
with (security_invoker = true)
as
with anexos_mais_recentes as (
  select distinct on (a.cliente_id, a.tipo_anexo)
    a.id,
    a.cliente_id,
    a.tipo_anexo,
    a.nome_arquivo,
    a.caminho_arquivo,
    a.criado_em,
    a.atualizado_em
  from public.anexos a
  order by a.cliente_id, a.tipo_anexo, coalesce(a.atualizado_em, a.criado_em) desc, a.criado_em desc
),
base as (
  select
    c.id as cliente_id,
    c.cnpj,
    c.razao_social,
    c.nome_identificacao,
    c.responsavel,
    c.responsavel_ecd,
    c.regime_tributario,
    c.situacao,
    c.pendencia_tecnica,
    c.cliente_notificado,
    c.data_enviada_reinf as reinf_data_entrega,
    c.data_entrega_ecd,
    c.data_envio_ecd,
    c.ultima_ecd_entregue,
    c.ultima_ecf_entregue,
    c.ecd,
    c.ecf,
    c.status,
    reinf.id as reinf_anexo_id,
    coalesce(reinf.atualizado_em, reinf.criado_em) as reinf_anexo_em,
    ecd.id as ecd_anexo_id,
    coalesce(ecd.atualizado_em, ecd.criado_em) as ecd_anexo_em,
    ecf.id as ecf_anexo_id,
    coalesce(ecf.atualizado_em, ecf.criado_em) as ecf_anexo_em
  from public.clientes c
  left join anexos_mais_recentes reinf
    on reinf.cliente_id = c.id
   and reinf.tipo_anexo = 'recibo_reinf'
  left join anexos_mais_recentes ecd
    on ecd.cliente_id = c.id
   and ecd.tipo_anexo = 'recibo_ecd'
  left join anexos_mais_recentes ecf
    on ecf.cliente_id = c.id
   and ecf.tipo_anexo = 'recibo_ecf'
),
flags as (
  select
    b.*,
    (b.reinf_data_entrega is not null and b.reinf_anexo_id is null and b.reinf_data_entrega < current_date) as reinf_pendente,
    (b.reinf_data_entrega is not null and b.reinf_anexo_id is null) as recibo_reinf_pendente,
    public.is_text_yes(b.ecd) and public.is_text_blank(b.ultima_ecd_entregue) as ecd_pendente,
    public.is_text_yes(b.ecd) and b.data_entrega_ecd is not null and b.data_envio_ecd is null as ecd_aguardando_envio,
    public.is_text_yes(b.ecd) and public.is_text_blank(b.responsavel_ecd) and public.is_text_blank(b.responsavel) as ecd_responsavel_pendente,
    public.is_text_yes(b.ecd) and b.ecd_anexo_id is null as recibo_ecd_pendente,
    public.is_text_yes(b.ecf) and public.is_text_blank(b.ultima_ecf_entregue) as ecf_pendente,
    public.is_text_yes(b.ecf) and b.ecf_anexo_id is null as recibo_ecf_pendente,
    (lower(coalesce(b.situacao, '')) like '%critic%' or public.is_text_yes(b.pendencia_tecnica) or lower(coalesce(b.pendencia_tecnica, '')) like '%pend%') as pendencia_critica
  from base b
)
select
  f.cliente_id,
  f.cnpj,
  f.razao_social,
  f.nome_identificacao,
  coalesce(nullif(f.responsavel_ecd, ''), nullif(f.responsavel, ''), 'Nao informado') as responsavel_exibicao,
  f.regime_tributario,
  f.reinf_data_entrega,
  f.reinf_anexo_em::date as reinf_data_enviada,
  (f.reinf_anexo_id is not null) as reinf_comprovante_anexado,
  f.reinf_pendente,
  f.recibo_reinf_pendente,
  case
    when f.reinf_anexo_id is not null then 'concluido'
    when f.reinf_data_entrega is null then 'sem_data'
    when f.reinf_pendente then 'em_atraso'
    else 'aguardando_envio'
  end as reinf_status_codigo,
  case
    when f.reinf_anexo_id is not null then 'Concluido'
    when f.reinf_data_entrega is null then 'Sem data'
    when f.reinf_pendente then 'Em atraso'
    else 'Aguardando envio'
  end as reinf_status_label,
  f.ecd_pendente,
  f.ecd_aguardando_envio,
  f.ecd_responsavel_pendente,
  f.recibo_ecd_pendente,
  (f.ecd_anexo_id is not null) as ecd_comprovante_anexado,
  case
    when f.ecd_pendente then 'obrigacao_pendente'
    when f.ecd_aguardando_envio then 'aguardando_envio'
    when f.ecd_responsavel_pendente then 'responsavel_pendente'
    when f.recibo_ecd_pendente then 'comprovante_pendente'
    when public.is_text_yes(f.ecd) then 'em_dia'
    else 'nao_aplicavel'
  end as ecd_status_codigo,
  case
    when f.ecd_pendente then 'Obrigacao pendente'
    when f.ecd_aguardando_envio then 'Aguardando envio'
    when f.ecd_responsavel_pendente then 'Responsavel pendente'
    when f.recibo_ecd_pendente then 'Comprovante pendente'
    when public.is_text_yes(f.ecd) then 'Em dia'
    else 'Nao aplicavel'
  end as ecd_status_label,
  f.ecf_pendente,
  f.recibo_ecf_pendente,
  (f.ecf_anexo_id is not null) as ecf_comprovante_anexado,
  case
    when f.ecf_pendente then 'obrigacao_pendente'
    when f.recibo_ecf_pendente then 'comprovante_pendente'
    when public.is_text_yes(f.ecf) then 'em_dia'
    else 'nao_aplicavel'
  end as ecf_status_codigo,
  case
    when f.ecf_pendente then 'Obrigacao pendente'
    when f.recibo_ecf_pendente then 'Comprovante pendente'
    when public.is_text_yes(f.ecf) then 'Em dia'
    else 'Nao aplicavel'
  end as ecf_status_label,
  case
    when f.ecd_pendente or f.ecf_pendente then 'obrigacao_pendente'
    when f.ecd_aguardando_envio then 'aguardando_envio'
    when f.ecd_responsavel_pendente then 'responsavel_pendente'
    when f.recibo_ecd_pendente or f.recibo_ecf_pendente then 'comprovante_pendente'
    else 'em_dia'
  end as obrigacoes_status_codigo,
  case
    when f.ecd_pendente or f.ecf_pendente then 'Obrigacao pendente'
    when f.ecd_aguardando_envio then 'Aguardando envio'
    when f.ecd_responsavel_pendente then 'Responsavel pendente'
    when f.recibo_ecd_pendente or f.recibo_ecf_pendente then 'Comprovante pendente'
    else 'Em dia'
  end as obrigacoes_status_label,
  (
    f.reinf_pendente or
    f.recibo_reinf_pendente or
    f.ecd_pendente or
    f.ecd_aguardando_envio or
    f.ecd_responsavel_pendente or
    f.recibo_ecd_pendente or
    f.ecf_pendente or
    f.recibo_ecf_pendente
  ) as possui_pendencia_obrigacao,
  (
    (
      f.reinf_pendente or
      f.recibo_reinf_pendente or
      f.ecd_pendente or
      f.ecd_aguardando_envio or
      f.ecd_responsavel_pendente or
      f.recibo_ecd_pendente or
      f.ecf_pendente or
      f.recibo_ecf_pendente
    )
    and not public.is_text_yes(f.cliente_notificado)
  ) as comunicacao_pendente,
  f.pendencia_critica,
  (
    case when f.reinf_pendente then 1 else 0 end +
    case when f.recibo_reinf_pendente then 1 else 0 end +
    case when f.ecd_pendente then 1 else 0 end +
    case when f.ecd_aguardando_envio then 1 else 0 end +
    case when f.ecd_responsavel_pendente then 1 else 0 end +
    case when f.recibo_ecd_pendente then 1 else 0 end +
    case when f.ecf_pendente then 1 else 0 end +
    case when f.recibo_ecf_pendente then 1 else 0 end
  ) as pendencias_obrigacoes_total
from flags f;

grant select on public.vw_clientes_obrigacoes_status to authenticated;
