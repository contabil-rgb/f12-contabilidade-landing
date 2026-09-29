-- Alinha a competencia inicial da automacao com o historico ja exibido no checklist.
-- Preserva o estado habilitado/pausado e ignora clientes inativos ou arquivados.

begin;

update public.checklist_automacao_clientes ac
set competencia_inicial = date '2026-01-01',
    alterado_por = null
from public.clientes c
where c.id = ac.cliente_id
  and coalesce(c.arquivado, false) = false
  and lower(coalesce(c.status, '')) <> 'inativo'
  and ac.competencia_inicial is distinct from date '2026-01-01'
  and (
    exists (
      select 1
      from public.checklist_clientes_itens cci
      join public.checklist_itens i
        on i.id = cci.item_id
       and i.ativo = true
      where cci.cliente_id = c.id
        and cci.ativo = true
    )
    or exists (
      select 1
      from public.checklist_clientes_itens_personalizados cip
      where cip.cliente_id = c.id
        and cip.ativo = true
    )
  );

-- Os itens abaixo foram vinculados em lote em 28/09/2026, mas ja apareciam
-- no acompanhamento dos meses anteriores. O corte preserva itens realmente
-- novos que forem cadastrados depois deste ajuste.
update public.checklist_clientes_itens cci
set competencia_inicial = date '2026-01-01',
    atualizado_em = now()
from public.checklist_automacao_clientes ac,
     public.clientes c,
     public.checklist_itens i
where ac.cliente_id = cci.cliente_id
  and c.id = cci.cliente_id
  and i.id = cci.item_id
  and ac.competencia_inicial = date '2026-01-01'
  and coalesce(c.arquivado, false) = false
  and lower(coalesce(c.status, '')) <> 'inativo'
  and cci.ativo = true
  and i.ativo = true
  and cci.competencia_inicial > date '2026-01-01'
  and cci.criado_em < timestamptz '2026-09-29 00:00:00+00';

update public.checklist_clientes_itens_personalizados cip
set competencia_inicial = date '2026-01-01',
    atualizado_em = now()
from public.checklist_automacao_clientes ac,
     public.clientes c
where ac.cliente_id = cip.cliente_id
  and c.id = cip.cliente_id
  and ac.competencia_inicial = date '2026-01-01'
  and coalesce(c.arquivado, false) = false
  and lower(coalesce(c.status, '')) <> 'inativo'
  and cip.ativo = true
  and cip.competencia_inicial > date '2026-01-01'
  and cip.criado_em < timestamptz '2026-09-29 00:00:00+00';

commit;
