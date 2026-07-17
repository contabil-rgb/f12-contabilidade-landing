-- Portal de Gestao Contabil - Datas separadas para ECF
-- Adiciona campos de data de entrega e data enviada da ECF na base de clientes.
-- Pode ser executado mais de uma vez sem erro.

alter table public.clientes
add column if not exists data_entrega_ecf date,
add column if not exists data_envio_ecf date;
