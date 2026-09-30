-- Valida o ajuste sem preparar trabalhos, criar execucoes ou enviar e-mails.

with clientes_esperados as (
  select ac.cliente_id, ac.habilitada
  from public.checklist_automacao_clientes ac
  join public.clientes c on c.id = ac.cliente_id
  where public.checklist_cliente_elegivel_automacao(c.id)
    and ac.competencia_inicial = date '2026-01-01'
    and (
      exists (
        select 1
        from public.checklist_clientes_itens cci
        join public.checklist_itens i on i.id = cci.item_id and i.ativo = true
        where cci.cliente_id = c.id and cci.ativo = true
      )
      or exists (
        select 1
        from public.checklist_clientes_itens_personalizados cip
        where cip.cliente_id = c.id and cip.ativo = true
      )
    )
), candidatos as (
  select
    c.nome_identificacao as cliente,
    candidato.resultado,
    candidato.qtd_pendencias
  from public.listar_checklist_automacao_candidatos_interno(date '2026-09-01', 'TESTE') candidato
  join public.clientes c on c.id = candidato.cliente_id
  join public.checklist_automacao_clientes ac on ac.cliente_id = c.id
  where ac.habilitada = true
), competencias_itens_habilitados as (
  select
    c.nome_identificacao as cliente,
    count(*) filter (where item.competencia_inicial is null) as itens_sem_competencia,
    count(*) filter (where item.competencia_inicial = date '2026-01-01') as itens_desde_janeiro,
    count(*) filter (where item.competencia_inicial > date '2026-01-01') as itens_posteriores
  from public.clientes c
  join public.checklist_automacao_clientes ac
    on ac.cliente_id = c.id
   and ac.habilitada = true
  join lateral (
    select cci.competencia_inicial
    from public.checklist_clientes_itens cci
    join public.checklist_itens i on i.id = cci.item_id and i.ativo = true
    where cci.cliente_id = c.id and cci.ativo = true
    union all
    select cip.competencia_inicial
    from public.checklist_clientes_itens_personalizados cip
    where cip.cliente_id = c.id and cip.ativo = true
  ) item on true
  group by c.id, c.nome_identificacao
)
select jsonb_build_object(
  'resumo', (
    select jsonb_build_object(
      'clientes_com_historico_desde_janeiro', count(*),
      'habilitados', count(*) filter (where habilitada),
      'pausados', count(*) filter (where not habilitada)
    )
    from clientes_esperados
  ),
  'candidatos_habilitados', (
    select coalesce(
      jsonb_agg(to_jsonb(candidatos) order by cliente),
      '[]'::jsonb
    )
    from candidatos
  ),
  'competencias_itens_habilitados', (
    select coalesce(
      jsonb_agg(to_jsonb(competencias_itens_habilitados) order by cliente),
      '[]'::jsonb
    )
    from competencias_itens_habilitados
  ),
  'arquivados_com_competencia_definida', (
    select count(*)
    from public.checklist_automacao_clientes ac
    join public.clientes c on c.id = ac.cliente_id
    where coalesce(c.arquivado, false) = true
      and ac.competencia_inicial is not null
  )
) as validacao;
