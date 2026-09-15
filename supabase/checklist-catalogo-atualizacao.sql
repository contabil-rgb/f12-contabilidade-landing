-- Portal de Gestao Contabil - Checklist de documentos mensais
-- Atualizacao do catalogo ativo do checklist.
-- Execute no Supabase SQL Editor para substituir o catalogo ativo pelos itens abaixo.
-- Itens antigos ficam inativos e os vinculos antigos dos clientes tambem ficam inativos.

begin;

with novos_itens (descricao, ordem) as (
  values
    ('Informação sobre alterações de constituição da empresa.', 10),
    ('Movimentação do fluxo de caixa da empresa (Identificando cada recebimento/pagamento NF, NFC, Recibo e etc);', 20),
    ('Relatório de caixinha (entrada e saída em dinheiro)', 30),
    ('Extratos Bancários de todas as contas em formato OFX, Excel e PDF;', 40),
    ('Extrato de Aplicações Financeiras em PDF, contendo: Aplicação, Resgate, Rendimento Bruto e Impostos retidos;', 50),
    ('Comprovantes de SISPAG FORNECEDORES em PDF', 60),
    ('Comprovantes de SISPAG SALÁRIOS em PDF', 70),
    ('Extrato detalhado da administradora de cartão de crédito – Vendas recebidas e tarifas descontadas;', 80),
    ('Contratos ou controles auxiliares de Empréstimos, financiamentos, Consórcios, Seguros, leasing ou arrendamentos em curso e seus devidos saldos devedores;', 90),
    ('Fatura de Cartão Crédito Pessoa Jurídica;', 100),
    ('Valor distribuído de lucro no período para cada sócio', 110),
    ('Relação de compras de bens do ativo imobilizado do período (acompanhados das respectivas notas fiscais);', 120)
), itens_atualizados as (
  insert into public.checklist_itens (descricao, ordem, ativo)
  select descricao, ordem, true
  from novos_itens
  on conflict (descricao)
  do update set ordem = excluded.ordem,
                ativo = true
  returning id, descricao
), itens_desejados as (
  select i.id
  from public.checklist_itens i
  join novos_itens n on n.descricao = i.descricao
), itens_inativados as (
  update public.checklist_itens i
  set ativo = false
  where not exists (
    select 1
    from itens_desejados d
    where d.id = i.id
  )
  returning i.id
)
update public.checklist_clientes_itens cci
set ativo = false
where exists (
  select 1
  from itens_inativados i
  where i.id = cci.item_id
);

commit;
