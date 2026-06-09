-- Portal de Gestao Contabil - Campos operacionais e contabeis complementares
-- Esta etapa adiciona colunas que o frontend ja conhece, mas que podem nao
-- existir em bancos antigos. Execute antes de atualizar a view
-- public.vw_clientes_risco_operacional.

alter table public.clientes
  add column if not exists dificuldade text,
  add column if not exists lucro text,
  add column if not exists primeira_competencia text,
  add column if not exists tem_folha text,
  add column if not exists ultima_importacao date,
  add column if not exists ultima_competencia_entregue text,
  add column if not exists precisa_ata text,
  add column if not exists ata_entregue text,
  add column if not exists data_entrega_ata date,
  add column if not exists enviam_documentos text,
  add column if not exists modo_entrega text,
  add column if not exists curva_envio text,
  add column if not exists ultima_competencia_enviada text,
  add column if not exists data_envio_documentos date,
  add column if not exists revisado_coordenador text,
  add column if not exists lancamentos_padrao text,
  add column if not exists motivo_atraso text;
