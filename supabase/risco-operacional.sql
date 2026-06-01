-- Portal de Gestao Contabil - Camada persistente de risco operacional resumido
-- Esta etapa depende de public.vw_clientes_obrigacoes_status ja criada em
-- obrigacoes-status.sql.
-- Para bancos antigos, execute antes o arquivo
-- public/clientes-campos-operacionais.sql.
-- Pode ser executado mais de uma vez com seguranca.
--
-- Contrato da view:
-- - cliente_id
-- - dias_atraso
-- - competencia_em_dia_bool
-- - em_atraso
-- - situacao_critica
-- - pendencia_tecnica
-- - documentos_atrasados
-- - has_pendencia
-- - risco_codigo
-- - risco_label
-- - ata_pendente

create or replace function public.is_text_no(value text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(value, ''))) in ('nao', 'não', 'n', 'no', 'false', '0');
$$;

create or replace view public.vw_clientes_risco_operacional
with (security_invoker = true)
as
with base as (
  select
    c.id as cliente_id,
    c.cnpj,
    c.razao_social,
    c.nome_identificacao,
    c.situacao,
    c.pendencia_tecnica,
    c.competencia_em_dia,
    c.dias_atraso,
    c.precisa_ata,
    c.ata_entregue,
    c.enviam_documentos,
    c.motivo_atraso,
    o.reinf_pendente,
    o.recibo_reinf_pendente,
    o.ecd_pendente,
    o.ecd_aguardando_envio,
    o.ecd_responsavel_pendente,
    o.recibo_ecd_pendente,
    o.ecf_pendente,
    o.recibo_ecf_pendente,
    o.comunicacao_pendente,
    o.pendencia_critica,
    o.possui_pendencia_obrigacao,
    o.pendencias_obrigacoes_total
  from public.clientes c
  left join public.vw_clientes_obrigacoes_status o
    on o.cliente_id = c.id
),
flags as (
  select
    b.*,
    coalesce(nullif(replace(trim(coalesce(b.dias_atraso::text, '')), ',', '.'), ''), '0')::numeric as dias_atraso_num,
    public.is_text_yes(b.competencia_em_dia) as competencia_em_dia_bool,
    (
      public.is_text_no(b.competencia_em_dia) or
      coalesce(nullif(replace(trim(coalesce(b.dias_atraso::text, '')), ',', '.'), ''), '0')::numeric > 0 or
      lower(coalesce(b.situacao, '')) like '%atras%' or
      lower(coalesce(b.situacao, '')) like '%critic%'
    ) as em_atraso,
    (
      lower(coalesce(b.situacao, '')) like '%critic%'
    ) as situacao_critica,
    (
      public.is_text_yes(b.pendencia_tecnica) or
      lower(coalesce(b.pendencia_tecnica, '')) like '%pend%'
    ) as pendencia_tecnica_bool,
    (
      public.is_text_no(b.enviam_documentos) or
      lower(coalesce(b.motivo_atraso, '')) like '%doc%'
    ) as documentos_atrasados,
    (
      public.is_text_yes(b.precisa_ata) and not public.is_text_yes(b.ata_entregue)
    ) as ata_pendente
  from base b
)
select
  f.cliente_id,
  f.cnpj,
  f.razao_social,
  f.nome_identificacao,
  f.dias_atraso_num as dias_atraso,
  f.competencia_em_dia_bool,
  f.em_atraso,
  f.situacao_critica,
  f.pendencia_tecnica_bool as pendencia_tecnica,
  f.documentos_atrasados,
  (
    f.em_atraso or
    coalesce(f.possui_pendencia_obrigacao, false) or
    f.pendencia_tecnica_bool or
    f.documentos_atrasados or
    f.ata_pendente
  ) as has_pendencia,
  case
    when f.situacao_critica or f.pendencia_tecnica_bool or coalesce(f.pendencia_critica, false) then 'danger'
    when (
      f.em_atraso or
      coalesce(f.possui_pendencia_obrigacao, false) or
      f.documentos_atrasados or
      f.ata_pendente
    ) then 'warning'
    else 'ok'
  end as risco_codigo,
  case
    when f.situacao_critica or f.pendencia_tecnica_bool or coalesce(f.pendencia_critica, false) then 'Crítico'
    when (
      f.em_atraso or
      coalesce(f.possui_pendencia_obrigacao, false) or
      f.documentos_atrasados or
      f.ata_pendente
    ) then 'Atenção'
    else 'Em dia'
  end as risco_label,
  coalesce(f.comunicacao_pendente, false) as comunicacao_pendente,
  coalesce(f.pendencia_critica, false) as pendencia_critica,
  coalesce(f.pendencias_obrigacoes_total, 0) as pendencias_obrigacoes_total,
  f.ata_pendente
from flags f;

grant select on public.vw_clientes_risco_operacional to authenticated;
