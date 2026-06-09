-- Portal de Gestao Contabil - Limpeza do legado de acompanhamento antigo
-- Use este script apenas em bases ja existentes, depois de atualizar
-- public.vw_clientes_acompanhamento_operacional para a versao simplificada.
-- Remove colunas que o portal atual nao usa mais.
-- Pode ser executado mais de uma vez com seguranca.

alter table public.clientes
  drop column if exists proxima_acao,
  drop column if exists prazo_proxima_acao;
