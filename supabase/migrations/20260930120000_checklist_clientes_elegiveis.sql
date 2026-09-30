-- Portal de Gestao Contabil - elegibilidade dos clientes no Checklist Documentos
-- Clientes em distrato, inativos ou arquivados ficam fora das telas e da automacao.

begin;

create or replace function public.checklist_cliente_elegivel_automacao(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and coalesce(c.arquivado, false) = false
      and lower(btrim(coalesce(c.status, ''))) not in ('inativo', 'em distrato')
  );
$$;

revoke all on function public.checklist_cliente_elegivel_automacao(uuid)
  from public, anon, authenticated;
grant execute on function public.checklist_cliente_elegivel_automacao(uuid)
  to service_role;

create or replace function public.checklist_automacao_validar_cliente_elegivel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.habilitada and not public.checklist_cliente_elegivel_automacao(new.cliente_id) then
    raise exception 'Nao e possivel habilitar a automacao para um cliente em distrato, inativo ou arquivado.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checklist_automacao_cliente_elegivel
  on public.checklist_automacao_clientes;
create trigger trg_checklist_automacao_cliente_elegivel
before insert or update of cliente_id, habilitada
on public.checklist_automacao_clientes
for each row execute function public.checklist_automacao_validar_cliente_elegivel();

create or replace function public.checklist_automacao_pausar_cliente_inelegivel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.checklist_cliente_elegivel_automacao(new.id) then
    update public.checklist_automacao_clientes
    set habilitada = false,
        motivo_pausa = 'Cliente em distrato, inativo ou arquivado.'
    where cliente_id = new.id
      and habilitada = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checklist_automacao_pausar_cliente_inelegivel
  on public.clientes;
create trigger trg_checklist_automacao_pausar_cliente_inelegivel
after insert or update of status, arquivado
on public.clientes
for each row execute function public.checklist_automacao_pausar_cliente_inelegivel();

update public.checklist_automacao_clientes ac
set habilitada = false,
    motivo_pausa = 'Cliente em distrato, inativo ou arquivado.'
where ac.habilitada = true
  and not public.checklist_cliente_elegivel_automacao(ac.cliente_id);
create or replace function public.listar_checklist_automacao_candidatos_interno(
  p_competencia_referencia date,
  p_modo text
)
returns table (
  cliente_id uuid,
  cliente_nome text,
  cliente_cnpj text,
  resultado text,
  motivo text,
  competencias jsonb,
  itens_cobrados jsonb,
  qtd_pendencias integer,
  destinatario_original text,
  cc_original text,
  destinatario_efetivo text,
  cc_efetivo text,
  assunto text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_competencia date;
  v_limite date;
  v_modo text;
  v_config public.checklist_automacao_configuracao;
begin
  v_competencia := date_trunc('month', p_competencia_referencia)::date;
  v_limite := (v_competencia - interval '1 month')::date;
  v_modo := upper(nullif(btrim(coalesce(p_modo, '')), ''));

  if p_competencia_referencia is null or p_competencia_referencia <> v_competencia then
    raise exception 'A competencia de referencia deve ser o primeiro dia do mes.';
  end if;

  if v_modo not in ('TESTE', 'REAL') then
    raise exception 'Modo de preparacao invalido.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao c
  where c.id = 1;

  if v_config.id is null then
    raise exception 'Configuracao global da automacao nao encontrada.';
  end if;

  return query
  with clientes_ativos as (
    select
      c.id,
      coalesce(
        nullif(btrim(c.nome_identificacao), ''),
        nullif(btrim(c.razao_social), ''),
        'Cliente sem identificacao'
      ) as nome,
      nullif(btrim(c.cnpj), '') as cnpj,
      ac.habilitada,
      ac.competencia_inicial,
      nullif(btrim(contato.email), '') as email,
      nullif(btrim(contato.cc), '') as cc
    from public.clientes c
    left join public.checklist_automacao_clientes ac on ac.cliente_id = c.id
    left join public.checklist_contatos contato on contato.cliente_id = c.id
    where public.checklist_cliente_elegivel_automacao(c.id)
  ),
  pendencias as (
    select
      ca.id as cliente_id,
      extract(year from competencia)::integer as ano,
      extract(month from competencia)::integer as mes,
      i.id as item_id,
      null::uuid as item_personalizado_id,
      'padrao'::text as item_tipo,
      i.descricao as item_descricao,
      cci.ordem as item_ordem
    from clientes_ativos ca
    join public.checklist_clientes_itens cci
      on cci.cliente_id = ca.id
     and cci.ativo = true
    join public.checklist_itens i
      on i.id = cci.item_id
     and i.ativo = true
    cross join lateral generate_series(
      greatest(
        ca.competencia_inicial,
        coalesce(cci.competencia_inicial, ca.competencia_inicial)
      )::timestamp,
      v_limite::timestamp,
      interval '1 month'
    ) competencia
    left join public.checklist_status s
      on s.cliente_id = ca.id
     and s.item_id = i.id
     and s.ano = extract(year from competencia)::integer
     and s.mes = extract(month from competencia)::integer
    where ca.habilitada = true
      and ca.competencia_inicial is not null
      and coalesce(s.status, 'PENDENTE') = 'PENDENTE'

    union all

    select
      ca.id as cliente_id,
      extract(year from competencia)::integer as ano,
      extract(month from competencia)::integer as mes,
      cip.id as item_id,
      cip.id as item_personalizado_id,
      'personalizado'::text as item_tipo,
      cip.descricao as item_descricao,
      cip.ordem as item_ordem
    from clientes_ativos ca
    join public.checklist_clientes_itens_personalizados cip
      on cip.cliente_id = ca.id
     and cip.ativo = true
    cross join lateral generate_series(
      greatest(
        ca.competencia_inicial,
        coalesce(cip.competencia_inicial, ca.competencia_inicial)
      )::timestamp,
      v_limite::timestamp,
      interval '1 month'
    ) competencia
    left join public.checklist_status_personalizados sp
      on sp.cliente_id = ca.id
     and sp.item_personalizado_id = cip.id
     and sp.ano = extract(year from competencia)::integer
     and sp.mes = extract(month from competencia)::integer
    where ca.habilitada = true
      and ca.competencia_inicial is not null
      and coalesce(sp.status, 'PENDENTE') = 'PENDENTE'
  ),
  competencias_por_cliente as (
    select
      x.cliente_id,
      jsonb_agg(
        jsonb_build_object('ano', x.ano, 'mes', x.mes)
        order by x.ano, x.mes
      ) as competencias
    from (
      select distinct p.cliente_id, p.ano, p.mes
      from pendencias p
    ) x
    group by x.cliente_id
  ),
  itens_por_cliente as (
    select
      p.cliente_id,
      count(*)::integer as qtd_pendencias,
      jsonb_agg(
        jsonb_build_object(
          'ano', p.ano,
          'mes', p.mes,
          'item_id', p.item_id,
          'item_personalizado_id', p.item_personalizado_id,
          'item_tipo', p.item_tipo,
          'item_descricao', p.item_descricao
        )
        order by p.ano, p.mes, p.item_ordem, p.item_descricao
      ) as itens_cobrados
    from pendencias p
    group by p.cliente_id
  )
  select
    ca.id,
    ca.nome,
    ca.cnpj,
    case
      when coalesce(ca.habilitada, false) = false then 'DESABILITADO'
      when ca.competencia_inicial is null then 'CONFIGURACAO_INCOMPLETA'
      when coalesce(ipc.qtd_pendencias, 0) = 0 then 'SEM_PENDENCIAS'
      when v_modo = 'REAL' and ca.email is null then 'SEM_CONTATO'
      else 'PREPARADO'
    end,
    case
      when coalesce(ca.habilitada, false) = false then 'Automacao desabilitada para o cliente.'
      when ca.competencia_inicial is null then 'Competencia inicial nao configurada.'
      when coalesce(ipc.qtd_pendencias, 0) = 0 then 'Nenhuma pendencia anterior a competencia de referencia.'
      when v_modo = 'REAL' and ca.email is null then 'Cliente sem e-mail cadastrado.'
      else null
    end,
    coalesce(cpc.competencias, '[]'::jsonb),
    coalesce(ipc.itens_cobrados, '[]'::jsonb),
    coalesce(ipc.qtd_pendencias, 0),
    ca.email,
    ca.cc,
    case when v_modo = 'TESTE' then v_config.email_teste_destinatario else ca.email end,
    case when v_modo = 'TESTE' then v_config.email_teste_cc else ca.cc end,
    concat(
      case when v_modo = 'TESTE' then '[TESTE] ' else '' end,
      'Lembrete Contabil - pendencias ate ',
      to_char(v_limite, 'MM/YYYY'),
      ' - ',
      ca.nome
    )
  from clientes_ativos ca
  left join competencias_por_cliente cpc on cpc.cliente_id = ca.id
  left join itens_por_cliente ipc on ipc.cliente_id = ca.id
  order by ca.nome, ca.id;
end;
$$;

create or replace function public.validar_checklist_automacao_teste_clientes_interno(
  p_cliente_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente_ids uuid[];
  v_quantidade_validos integer;
begin
  if p_cliente_ids is null
     or cardinality(p_cliente_ids) = 0
     or exists (select 1 from unnest(p_cliente_ids) id where id is null) then
    raise exception 'Selecione ao menos um cliente para o teste.';
  end if;

  select array_agg(x.id order by x.id)
  into v_cliente_ids
  from (
    select distinct id
    from unnest(p_cliente_ids) as u(id)
  ) x;

  if cardinality(v_cliente_ids) > 10 then
    raise exception 'Cada teste pode incluir no maximo 10 clientes.';
  end if;

  select count(*)::integer
  into v_quantidade_validos
  from public.clientes c
  join public.checklist_automacao_clientes ac
    on ac.cliente_id = c.id
   and ac.habilitada = true
   and ac.competencia_inicial is not null
  where c.id = any(v_cliente_ids)
    and public.checklist_cliente_elegivel_automacao(c.id);

  if v_quantidade_validos <> cardinality(v_cliente_ids) then
    raise exception 'O teste aceita somente clientes elegiveis, habilitados e com competencia inicial.';
  end if;

  return v_cliente_ids;
end;
$$;

create or replace function public.obter_checklist_automacao_painel_portal()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_resultado jsonb;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para consultar a automacao.';
  end if;

  select jsonb_build_object(
    'usuario', jsonb_build_object(
      'id', v_usuario.id,
      'nome', v_usuario.nome,
      'email', v_usuario.email,
      'perfil_acesso', v_usuario.perfil_acesso
    ),
    'configuracao', (
      select to_jsonb(c) - 'alterado_por'
      from public.checklist_automacao_configuracao c
      where c.id = 1
    ),
    'regras_fixas', jsonb_build_object(
      'fuso_horario', 'America/Manaus',
      'dia_util_ordem', 2,
      'horario_local', '08:00:00',
      'intervalos_tentativas_minutos', jsonb_build_array(0, 15, 45),
      'maximo_clientes_teste_manual', 10
    ),
    'resumo', jsonb_build_object(
      'clientes_total', (
        select count(*)
        from public.checklist_automacao_clientes ac
        where public.checklist_cliente_elegivel_automacao(ac.cliente_id)
      ),
      'clientes_habilitados', (
        select count(*)
        from public.checklist_automacao_clientes ac
        where ac.habilitada
          and public.checklist_cliente_elegivel_automacao(ac.cliente_id)
      ),
      'execucoes_total', (select count(*) from public.checklist_automacao_execucoes),
      'trabalhos_pendentes', (
        select count(*)
        from public.checklist_automacao_trabalhos
        where status in ('PREPARADO', 'PROCESSANDO', 'AGUARDANDO_NOVA_TENTATIVA')
      )
    ),
    'clientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cliente_id', c.id,
          'nome', coalesce(nullif(c.nome_identificacao, ''), c.razao_social),
          'cnpj', c.cnpj,
          'responsavel', nullif(btrim(c.responsavel), ''),
          'status', c.status,
          'arquivado', coalesce(c.arquivado, false),
          'habilitada', ac.habilitada,
          'competencia_inicial', ac.competencia_inicial,
          'motivo_pausa', ac.motivo_pausa,
          'atualizado_em', ac.atualizado_em
        )
        order by coalesce(nullif(c.nome_identificacao, ''), c.razao_social), c.id
      )
      from public.checklist_automacao_clientes ac
      join public.clientes c on c.id = ac.cliente_id
      where public.checklist_cliente_elegivel_automacao(c.id)
    ), '[]'::jsonb),
    'feriados', coalesce((
      select jsonb_agg(to_jsonb(f) - 'alterado_por' order by f.data, f.nome)
      from public.checklist_automacao_feriados f
      where f.data >= date_trunc('year', now() at time zone 'America/Manaus')::date
        and f.data < (
          date_trunc('year', now() at time zone 'America/Manaus') + interval '2 years'
        )::date
    ), '[]'::jsonb),
    'ultimas_execucoes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
      from (
        select e.*
        from public.checklist_automacao_execucoes e
        order by e.criado_em desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'auditoria_recente', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
      from (
        select a.*
        from public.checklist_automacao_auditoria a
        order by a.criado_em desc
        limit 50
      ) x
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

create or replace function public.atualizar_checklist_automacao_cliente_portal(
  p_cliente_id uuid,
  p_habilitada boolean,
  p_competencia_inicial date default null,
  p_motivo_pausa text default null
)
returns public.checklist_automacao_clientes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_cliente public.clientes;
  v_atual public.checklist_automacao_clientes;
  v_resultado public.checklist_automacao_clientes;
  v_competencia date;
  v_motivo text;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para alterar clientes da automacao.';
  end if;
  if p_cliente_id is null or p_habilitada is null then
    raise exception 'Cliente e estado da automacao sao obrigatorios.';
  end if;

  select * into v_cliente from public.clientes c where c.id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'Cliente nao encontrado.';
  end if;
  if p_habilitada and not public.checklist_cliente_elegivel_automacao(v_cliente.id) then
    raise exception 'Nao e possivel habilitar a automacao para um cliente em distrato, inativo ou arquivado.';
  end if;

  v_competencia := date_trunc('month', p_competencia_inicial)::date;
  v_motivo := nullif(btrim(coalesce(p_motivo_pausa, '')), '');

  if p_habilitada and (
      p_competencia_inicial is null
      or p_competencia_inicial <> v_competencia
      or v_competencia > date_trunc('month', now() at time zone 'America/Manaus')::date
    ) then
    raise exception 'Informe uma competencia inicial mensal que nao esteja no futuro.';
  end if;
  if not p_habilitada and v_motivo is null then
    raise exception 'Informe o motivo da pausa do cliente.';
  end if;

  select * into v_atual
  from public.checklist_automacao_clientes ac
  where ac.cliente_id = p_cliente_id
  for update;

  if v_atual.cliente_id is null then
    insert into public.checklist_automacao_clientes (
      cliente_id,
      habilitada,
      competencia_inicial,
      motivo_pausa,
      alterado_por
    ) values (
      p_cliente_id,
      p_habilitada,
      case when p_habilitada then v_competencia else null end,
      case when p_habilitada then null else v_motivo end,
      v_usuario.id
    ) returning * into v_resultado;
  else
    update public.checklist_automacao_clientes
    set habilitada = p_habilitada,
        competencia_inicial = case
          when p_habilitada then v_competencia
          else competencia_inicial
        end,
        motivo_pausa = case when p_habilitada then null else v_motivo end,
        alterado_por = v_usuario.id
    where cliente_id = p_cliente_id
    returning * into v_resultado;
  end if;

  return v_resultado;
end;
$$;

create or replace function public.listar_checklist_envios_portal(p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_pagina integer;
  v_por_pagina integer;
  v_busca text;
  v_origem text;
  v_status text;
  v_responsavel_id uuid;
  v_ano integer;
  v_mes integer;
  v_data_inicio timestamp with time zone;
  v_data_fim timestamp with time zone;
  v_resultado jsonb;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para consultar historico do checklist.';
  end if;

  if p_filtros is null or jsonb_typeof(p_filtros) <> 'object' then
    raise exception 'Filtros do historico do checklist invalidos.';
  end if;

  v_pagina := greatest(coalesce(nullif(btrim(coalesce(p_filtros->>'pagina', '')), '')::integer, 1), 1);
  v_por_pagina := least(greatest(coalesce(nullif(btrim(coalesce(p_filtros->>'por_pagina', '')), '')::integer, 25), 1), 100);
  v_busca := lower(nullif(btrim(coalesce(p_filtros->>'busca', '')), ''));
  v_origem := upper(nullif(btrim(coalesce(p_filtros->>'origem', '')), ''));
  v_status := upper(nullif(btrim(coalesce(p_filtros->>'status', '')), ''));
  v_responsavel_id := nullif(btrim(coalesce(p_filtros->>'responsavel_id', '')), '')::uuid;
  v_ano := nullif(btrim(coalesce(p_filtros->>'ano', '')), '')::integer;
  v_mes := nullif(btrim(coalesce(p_filtros->>'mes', '')), '')::integer;
  v_data_inicio := nullif(btrim(coalesce(p_filtros->>'data_inicio', '')), '')::timestamp with time zone;
  v_data_fim := nullif(btrim(coalesce(p_filtros->>'data_fim', '')), '')::timestamp with time zone;

  if v_origem is not null and v_origem not in ('MANUAL', 'AUTOMATICO') then
    raise exception 'Origem do historico do checklist invalida.';
  end if;

  if v_status is not null and v_status not in ('PROCESSANDO', 'ENVIADO', 'FALHOU', 'CANCELADO') then
    raise exception 'Status do historico do checklist invalido.';
  end if;

  if v_mes is not null and (v_mes < 1 or v_mes > 12) then
    raise exception 'Mes do historico do checklist invalido.';
  end if;

  if v_ano is not null and (v_ano < 2000 or v_ano > 2100) then
    raise exception 'Ano do historico do checklist invalido.';
  end if;

  if v_data_inicio is not null and v_data_fim is not null and v_data_inicio >= v_data_fim then
    raise exception 'Periodo do historico do checklist invalido.';
  end if;

  with filtrados as (
    select
      e.*,
      coalesce(e.enviado_em, e.finalizado_em, e.iniciado_em, e.criado_em) as evento_em
    from public.checklist_envios e
    where public.checklist_cliente_elegivel_automacao(e.cliente_id)
      and (v_busca is null or
      lower(coalesce(e.cliente_nome, '')) like '%' || v_busca || '%' or
      lower(coalesce(e.cliente_cnpj, '')) like '%' || v_busca || '%' or
      lower(coalesce(e.destinatario, '')) like '%' || v_busca || '%')
      and (v_origem is null or e.origem = v_origem)
      and (v_status is null or e.status = v_status)
      and (v_responsavel_id is null or e.enviado_por = v_responsavel_id)
      and (v_data_inicio is null or coalesce(e.enviado_em, e.finalizado_em, e.iniciado_em, e.criado_em) >= v_data_inicio)
      and (v_data_fim is null or coalesce(e.enviado_em, e.finalizado_em, e.iniciado_em, e.criado_em) < v_data_fim)
      and (
        (v_ano is null and v_mes is null)
        or exists (
          select 1
          from jsonb_array_elements(e.competencias) competencia
          where (v_ano is null or nullif(competencia->>'ano', '')::integer = v_ano)
            and (v_mes is null or nullif(competencia->>'mes', '')::integer = v_mes)
        )
      )
  ),
  pagina as (
    select *
    from filtrados
    order by evento_em desc, id desc
    offset (v_pagina - 1) * v_por_pagina
    limit v_por_pagina
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.evento_em desc, p.id desc)
      from pagina p
    ), '[]'::jsonb),
    'total', (select count(*) from filtrados),
    'pagina', v_pagina,
    'por_pagina', v_por_pagina,
    'resumo', jsonb_build_object(
      'total', (select count(*) from filtrados),
      'enviados', (select count(*) from filtrados where status = 'ENVIADO'),
      'falhas', (select count(*) from filtrados where status = 'FALHOU'),
      'processando', (select count(*) from filtrados where status = 'PROCESSANDO'),
      'cancelados', (select count(*) from filtrados where status = 'CANCELADO'),
      'manuais', (select count(*) from filtrados where origem = 'MANUAL'),
      'automaticos', (select count(*) from filtrados where origem = 'AUTOMATICO')
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.checklist_automacao_validar_cliente_elegivel()
  from public, anon, authenticated;
revoke all on function public.checklist_automacao_pausar_cliente_inelegivel()
  from public, anon, authenticated;

commit;
