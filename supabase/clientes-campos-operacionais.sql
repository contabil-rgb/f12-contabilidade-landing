-- Portal de Gestao Contabil - Campos operacionais complementares de clientes
-- Esta etapa adiciona colunas que o frontend ja conhece, mas que podem nao
-- existir em bancos antigos. Execute antes de atualizar a view
-- public.vw_clientes_risco_operacional.

alter table public.clientes
  add column if not exists precisa_ata text,
  add column if not exists ata_entregue text,
  add column if not exists data_entrega_ata date,
  add column if not exists enviam_documentos text,
  add column if not exists motivo_atraso text;
