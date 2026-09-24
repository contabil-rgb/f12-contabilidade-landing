-- Portal de Gestao Contabil - Preparacao transacional da automacao
-- Etapa 3: seleciona pendencias e prepara trabalhos idempotentes.
-- Nao cria cron, nao chama Edge Functions e nao envia e-mails.

begin;

alter table public.checklist_clientes_itens
  add column if not exists competencia_inicial date;

alter table public.checklist_clientes_itens_personalizados
  add column if not exists competencia_inicial date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.checklist_clientes_itens'::regclass
      and conname = 'checklist_clientes_itens_competencia_inicial_check'
  ) then
    alter table public.checklist_clientes_itens
      add constraint checklist_clientes_itens_competencia_inicial_check
      check (
        competencia_inicial is null
        or competencia_inicial = date_trunc('month', competencia_inicial)::date
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.checklist_clientes_itens_personalizados'::regclass
      and conname = 'checklist_itens_personalizados_competencia_inicial_check'
  ) then
    alter table public.checklist_clientes_itens_personalizados
      add constraint checklist_itens_personalizados_competencia_inicial_check
      check (
        competencia_inicial is null
        or competencia_inicial = date_trunc('month', competencia_inicial)::date
      );
  end if;
end;
$$;

create or replace function public.checklist_definir_competencia_novo_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.competencia_inicial is null
     and (
       tg_op = 'INSERT'
       or (tg_op = 'UPDATE' and new.ativo = true and old.ativo = false)
     ) then
    new.competencia_inicial := date_trunc(
      'month',
      (now() at time zone 'America/Manaus')::date
    )::date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checklist_clientes_itens_competencia_inicial
  on public.checklist_clientes_itens;
create trigger trg_checklist_clientes_itens_competencia_inicial
before insert or update of ativo, competencia_inicial on public.checklist_clientes_itens
for each row execute function public.checklist_definir_competencia_novo_item();

drop trigger if exists trg_checklist_itens_personalizados_competencia_inicial
  on public.checklist_clientes_itens_personalizados;
create trigger trg_checklist_itens_personalizados_competencia_inicial
before insert or update of ativo, competencia_inicial on public.checklist_clientes_itens_personalizados
for each row execute function public.checklist_definir_competencia_novo_item();

create table if not exists public.checklist_automacao_trabalhos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.checklist_automacao_execucoes(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nome text not null,
  cliente_cnpj text,
  modo text not null,
  status text not null default 'PREPARADO',
  motivo text,
  competencias jsonb not null default '[]'::jsonb,
  itens_cobrados jsonb not null default '[]'::jsonb,
  qtd_pendencias integer not null default 0,
  destinatario_original text,
  cc_original text,
  destinatario_efetivo text,
  cc_efetivo text,
  assunto text not null,
  chave_idempotencia text not null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_automacao_trabalhos_modo_check check (modo in ('TESTE', 'REAL')),
  constraint checklist_automacao_trabalhos_status_check check (status in ('PREPARADO', 'IGNORADO', 'CANCELADO')),
  constraint checklist_automacao_trabalhos_competencias_check check (jsonb_typeof(competencias) = 'array'),
  constraint checklist_automacao_trabalhos_itens_check check (jsonb_typeof(itens_cobrados) = 'array'),
  constraint checklist_automacao_trabalhos_quantidade_check check (qtd_pendencias >= 0),
  constraint checklist_automacao_trabalhos_cliente_nome_check check (nullif(btrim(cliente_nome), '') is not null),
  constraint checklist_automacao_trabalhos_assunto_check check (nullif(btrim(assunto), '') is not null),
  constraint checklist_automacao_trabalhos_destinatario_check check (
    status <> 'PREPARADO'
    or nullif(btrim(destinatario_efetivo), '') is not null
  ),
  constraint checklist_automacao_trabalhos_execucao_cliente_unique unique (execucao_id, cliente_id),
  constraint checklist_automacao_trabalhos_chave_unique unique (chave_idempotencia)
);

create index if not exists idx_checklist_automacao_trabalhos_execucao_status
  on public.checklist_automacao_trabalhos (execucao_id, status);

create index if not exists idx_checklist_automacao_trabalhos_cliente_criado
  on public.checklist_automacao_trabalhos (cliente_id, criado_em desc);

drop trigger if exists trg_checklist_automacao_trabalhos_atualizado_em
  on public.checklist_automacao_trabalhos;
create trigger trg_checklist_automacao_trabalhos_atualizado_em
before update on public.checklist_automacao_trabalhos
for each row execute function public.checklist_automacao_set_atualizado_em();

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
    where coalesce(c.arquivado, false) = false
      and lower(coalesce(c.status, '')) <> 'inativo'
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

create or replace function public.preparar_checklist_automacao_interno(
  p_competencia_referencia date,
  p_acionamento text default 'SIMULACAO',
  p_chave_idempotencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.checklist_automacao_configuracao;
  v_competencia date;
  v_acionamento text;
  v_hoje_manaus date;
  v_segundo_dia_util date;
  v_agendada_para timestamp with time zone;
  v_chave text;
  v_execucao public.checklist_automacao_execucoes;
  v_resumo jsonb;
  v_trabalhos jsonb;
begin
  v_competencia := date_trunc('month', p_competencia_referencia)::date;
  v_acionamento := upper(nullif(btrim(coalesce(p_acionamento, '')), ''));

  if p_competencia_referencia is null or p_competencia_referencia <> v_competencia then
    raise exception 'A competencia de referencia deve ser o primeiro dia do mes.';
  end if;

  if v_acionamento not in ('AGENDADO', 'MANUAL', 'SIMULACAO') then
    raise exception 'Tipo de acionamento invalido.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao c
  where c.id = 1
  for update;

  if v_config.id is null then
    raise exception 'Configuracao global da automacao nao encontrada.';
  end if;

  v_hoje_manaus := (now() at time zone v_config.fuso_horario)::date;
  v_segundo_dia_util := public.checklist_segundo_dia_util_manaus(
    extract(year from v_competencia)::integer,
    extract(month from v_competencia)::integer
  );
  v_agendada_para := (
    v_segundo_dia_util + v_config.horario_local
  ) at time zone v_config.fuso_horario;

  select jsonb_build_object(
    'total_clientes', count(*),
    'preparados', count(*) filter (where c.resultado = 'PREPARADO'),
    'desabilitados', count(*) filter (where c.resultado = 'DESABILITADO'),
    'configuracao_incompleta', count(*) filter (where c.resultado = 'CONFIGURACAO_INCOMPLETA'),
    'sem_pendencias', count(*) filter (where c.resultado = 'SEM_PENDENCIAS'),
    'sem_contato', count(*) filter (where c.resultado = 'SEM_CONTATO'),
    'total_pendencias', coalesce(sum(c.qtd_pendencias) filter (where c.resultado = 'PREPARADO'), 0)
  )
  into v_resumo
  from public.listar_checklist_automacao_candidatos_interno(
    v_competencia,
    v_config.modo
  ) c;

  if v_acionamento = 'SIMULACAO' then
    select coalesce(
      jsonb_agg(to_jsonb(c) order by c.cliente_nome)
        filter (where c.resultado <> 'DESABILITADO'),
      '[]'::jsonb
    )
    into v_trabalhos
    from public.listar_checklist_automacao_candidatos_interno(
      v_competencia,
      v_config.modo
    ) c;

    return jsonb_build_object(
      'simulacao', true,
      'persistido', false,
      'modo', v_config.modo,
      'competencia_referencia', v_competencia,
      'segundo_dia_util', v_segundo_dia_util,
      'agendada_para', v_agendada_para,
      'resumo', v_resumo,
      'trabalhos', v_trabalhos
    );
  end if;

  if v_config.ativa = false then
    raise exception 'A automacao global esta pausada.';
  end if;

  if v_competencia <> date_trunc('month', v_hoje_manaus)::date then
    raise exception 'A execucao deve usar a competencia do mes atual em Manaus.';
  end if;

  if v_acionamento = 'AGENDADO' and v_hoje_manaus <> v_segundo_dia_util then
    raise exception 'Hoje nao e o segundo dia util da competencia informada.';
  end if;

  v_chave := coalesce(
    nullif(btrim(coalesce(p_chave_idempotencia, '')), ''),
    concat(
      'checklist:',
      to_char(v_competencia, 'YYYY-MM'),
      ':',
      lower(v_config.modo),
      ':',
      lower(v_acionamento)
    )
  );

  insert into public.checklist_automacao_execucoes (
    competencia_referencia,
    segundo_dia_util,
    agendada_para,
    modo,
    acionamento,
    status,
    chave_idempotencia,
    iniciado_em
  )
  values (
    v_competencia,
    v_segundo_dia_util,
    v_agendada_para,
    v_config.modo,
    v_acionamento,
    'PREPARANDO',
    v_chave,
    now()
  )
  on conflict do nothing
  returning * into v_execucao;

  if v_execucao.id is null then
    select * into v_execucao
    from public.checklist_automacao_execucoes e
    where e.chave_idempotencia = v_chave
    limit 1;

    if v_execucao.id is null and v_acionamento = 'AGENDADO' then
      select * into v_execucao
      from public.checklist_automacao_execucoes e
      where e.competencia_referencia = v_competencia
        and e.modo = v_config.modo
        and e.acionamento = 'AGENDADO'
      order by e.criado_em
      limit 1;
    end if;

    if v_execucao.id is null then
      raise exception 'Conflito ao recuperar execucao idempotente.';
    end if;

    return jsonb_build_object(
      'simulacao', false,
      'persistido', true,
      'duplicado', true,
      'execucao', to_jsonb(v_execucao),
      'resumo', coalesce(v_execucao.detalhes->'resumo', '{}'::jsonb)
    );
  end if;

  insert into public.checklist_automacao_trabalhos (
    execucao_id,
    cliente_id,
    cliente_nome,
    cliente_cnpj,
    modo,
    status,
    motivo,
    competencias,
    itens_cobrados,
    qtd_pendencias,
    destinatario_original,
    cc_original,
    destinatario_efetivo,
    cc_efetivo,
    assunto,
    chave_idempotencia
  )
  select
    v_execucao.id,
    c.cliente_id,
    c.cliente_nome,
    c.cliente_cnpj,
    v_config.modo,
    case when c.resultado = 'PREPARADO' then 'PREPARADO' else 'IGNORADO' end,
    c.motivo,
    c.competencias,
    c.itens_cobrados,
    c.qtd_pendencias,
    c.destinatario_original,
    c.cc_original,
    c.destinatario_efetivo,
    c.cc_efetivo,
    c.assunto,
    concat(v_execucao.id::text, ':', c.cliente_id::text)
  from public.listar_checklist_automacao_candidatos_interno(
    v_competencia,
    v_config.modo
  ) c
  where c.resultado in ('PREPARADO', 'SEM_CONTATO')
  on conflict do nothing;

  update public.checklist_automacao_execucoes e
  set status = 'AGENDADA',
      total_clientes = coalesce((v_resumo->>'total_clientes')::integer, 0),
      total_trabalhos = coalesce((v_resumo->>'preparados')::integer, 0),
      total_ignorados = (
        coalesce((v_resumo->>'desabilitados')::integer, 0)
        + coalesce((v_resumo->>'configuracao_incompleta')::integer, 0)
        + coalesce((v_resumo->>'sem_pendencias')::integer, 0)
        + coalesce((v_resumo->>'sem_contato')::integer, 0)
      ),
      total_sem_contato = coalesce((v_resumo->>'sem_contato')::integer, 0),
      detalhes = jsonb_build_object('resumo', v_resumo)
  where e.id = v_execucao.id
  returning * into v_execucao;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.cliente_nome), '[]'::jsonb)
  into v_trabalhos
  from public.checklist_automacao_trabalhos t
  where t.execucao_id = v_execucao.id;

  return jsonb_build_object(
    'simulacao', false,
    'persistido', true,
    'duplicado', false,
    'execucao', to_jsonb(v_execucao),
    'resumo', v_resumo,
    'trabalhos', v_trabalhos
  );
end;
$$;

alter table public.checklist_automacao_trabalhos enable row level security;

revoke all on table public.checklist_automacao_trabalhos from anon, authenticated;
grant select on table public.checklist_automacao_trabalhos to authenticated;

drop policy if exists checklist_automacao_trabalhos_select_usuario_ativo
  on public.checklist_automacao_trabalhos;
create policy checklist_automacao_trabalhos_select_usuario_ativo
on public.checklist_automacao_trabalhos
for select to authenticated
using (public.is_portal_usuario_ativo());

revoke all on function public.checklist_definir_competencia_novo_item()
  from public, anon, authenticated;
revoke all on function public.listar_checklist_automacao_candidatos_interno(date, text)
  from public, anon, authenticated;
revoke all on function public.preparar_checklist_automacao_interno(date, text, text)
  from public, anon, authenticated;

grant execute on function public.listar_checklist_automacao_candidatos_interno(date, text) to service_role;
grant execute on function public.preparar_checklist_automacao_interno(date, text, text) to service_role;

commit;
