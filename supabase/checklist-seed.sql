-- Portal de Gestao Contabil - Checklist de documentos mensais
-- Etapa 1: seed inicial do catalogo de itens.
-- Execute depois de supabase/checklist.sql.
-- Pode ser executado mais de uma vez com seguranca.

insert into public.checklist_itens (descricao, ordem, ativo)
values
  ('Extratos bancarios', 10, true),
  ('Fatura de cartao', 20, true),
  ('Comprovantes de pagamentos', 30, true),
  ('Notas fiscais de entrada', 40, true),
  ('Notas fiscais de saida', 50, true),
  ('Relatorio de vendas', 60, true),
  ('Relatorio de servicos prestados', 70, true),
  ('Contratos de emprestimos', 80, true),
  ('Folha de pagamento', 90, true),
  ('Pro-labore', 100, true),
  ('Recibos de aluguel', 110, true),
  ('Guias pagas', 120, true),
  ('Movimento de caixa', 130, true),
  ('Comprovantes de despesas', 140, true),
  ('Documentos diversos', 150, true)
on conflict (descricao)
do update set ordem = excluded.ordem,
              ativo = excluded.ativo;
