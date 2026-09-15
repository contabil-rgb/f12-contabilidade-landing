-- Portal de Gestao Contabil - Checklist de documentos mensais
-- Etapa 1: seed inicial do catalogo de itens.
-- Execute depois de supabase/checklist.sql.
-- Pode ser executado mais de uma vez com seguranca.

insert into public.checklist_itens (descricao, ordem, ativo)
values
  ('Informação sobre alterações de constituição da empresa.', 10, true),
  ('Movimentação do fluxo de caixa da empresa (Identificando cada recebimento/pagamento NF, NFC, Recibo e etc);', 20, true),
  ('Relatório de caixinha (entrada e saída em dinheiro)', 30, true),
  ('Extratos Bancários de todas as contas em formato OFX, Excel e PDF;', 40, true),
  ('Extrato de Aplicações Financeiras em PDF, contendo: Aplicação, Resgate, Rendimento Bruto e Impostos retidos;', 50, true),
  ('Comprovantes de SISPAG FORNECEDORES em PDF', 60, true),
  ('Comprovantes de SISPAG SALÁRIOS em PDF', 70, true),
  ('Extrato detalhado da administradora de cartão de crédito – Vendas recebidas e tarifas descontadas;', 80, true),
  ('Contratos ou controles auxiliares de Empréstimos, financiamentos, Consórcios, Seguros, leasing ou arrendamentos em curso e seus devidos saldos devedores;', 90, true),
  ('Fatura de Cartão Crédito Pessoa Jurídica;', 100, true),
  ('Valor distribuído de lucro no período para cada sócio', 110, true),
  ('Relação de compras de bens do ativo imobilizado do período (acompanhados das respectivas notas fiscais);', 120, true)
on conflict (descricao)
do update set ordem = excluded.ordem,
              ativo = excluded.ativo;
