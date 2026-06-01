-- Portal de Gestao Contabil - Campos operacionais de comunicacao e acompanhamento
-- Esta etapa complementa public.clientes com datas e status de retorno do cliente.
-- Pode ser executado mais de uma vez com seguranca.

alter table public.clientes
  add column if not exists data_notificacao_cliente date,
  add column if not exists status_retorno_cliente text,
  add column if not exists data_retorno_cliente date,
  add column if not exists prazo_proxima_acao date;

insert into public.listagens (categoria, valor, ordem)
values
  ('status_retorno_cliente', 'Aguardando retorno', 1),
  ('status_retorno_cliente', 'Retorno recebido', 2),
  ('status_retorno_cliente', 'Sem retorno', 3),
  ('status_retorno_cliente', 'Concluido', 4)
on conflict (categoria, valor) do nothing;
