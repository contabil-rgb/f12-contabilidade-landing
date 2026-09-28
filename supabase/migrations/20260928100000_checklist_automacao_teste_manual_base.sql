-- Portal de Gestao Contabil - Teste manual da automacao
-- Etapa 7, parte 1: selecao explicita de clientes, preparacao idempotente,
-- auditoria e reserva direcionada. Nao chama Edge Functions nem envia e-mails.

begin;

alter table public.checklist_automacao_auditoria
  drop constraint if exists checklist_automacao_auditoria_entidade_check,
  drop constraint if exists checklist_automacao_auditoria_operacao_check;

alter table public.checklist_automacao_auditoria
  add constraint checklist_automacao_auditoria_entidade_check check (
    entidade in (
      'CONFIGURACAO_GLOBAL',
      'CONFIGURACAO_CLIENTE',
      'FERIADO',
      'EXECUCAO_TESTE'
    )
  ),
  add constraint checklist_automacao_auditoria_operacao_check check (
    operacao in ('INSERT', 'UPDATE', 'DELETE', 'EXECUTAR')
  );

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
    and coalesce(c.arquivado, false) = false
    and lower(coalesce(c.status, '')) <> 'inativo';

  if v_quantidade_validos <> cardinality(v_cliente_ids) then
    raise exception 'O teste aceita somente clientes ativos, habilitados e com competencia inicial.';
  end if;

  return v_cliente_ids;
end;
$$;

create or replace function public.simular_checklist_automacao_teste_portal(
  p_competencia_referencia date,
  p_cliente_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_config public.checklist_automacao_configuracao;
  v_competencia date;
  v_cliente_ids uuid[];
  v_resumo jsonb;
  v_trabalhos jsonb;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para simular o teste da automacao.';
  end if;

  v_competencia := date_trunc('month', p_competencia_referencia)::date;
  if p_competencia_referencia is null or p_competencia_referencia <> v_competencia then
    raise exception 'A competencia de referencia deve ser o primeiro dia do mes.';
  end if;

  if v_competencia > date_trunc('month', now() at time zone 'America/Manaus')::date then
    raise exception 'A competencia de referencia nao pode estar no futuro.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao c
  where c.id = 1;

  if v_config.id is null or v_config.modo <> 'TESTE' then
    raise exception 'O teste manual exige que a automacao esteja no modo TESTE.';
  end if;

  v_cliente_ids := public.validar_checklist_automacao_teste_clientes_interno(p_cliente_ids);

  with candidatos as (
    select c.*
    from public.listar_checklist_automacao_candidatos_interno(v_competencia, 'TESTE') c
    where c.cliente_id = any(v_cliente_ids)
  )
  select
    jsonb_build_object(
      'total_clientes', count(*),
      'preparados', count(*) filter (where resultado = 'PREPARADO'),
      'sem_pendencias', count(*) filter (where resultado = 'SEM_PENDENCIAS'),
      'total_pendencias', coalesce(sum(qtd_pendencias) filter (where resultado = 'PREPARADO'), 0)
    ),
    coalesce(jsonb_agg(to_jsonb(c) order by c.cliente_nome), '[]'::jsonb)
  into v_resumo, v_trabalhos
  from candidatos c;

  return jsonb_build_object(
    'simulacao', true,
    'persistido', false,
    'modo', 'TESTE',
    'automacao_global_pausada', not v_config.ativa,
    'competencia_referencia', v_competencia,
    'cliente_ids', to_jsonb(v_cliente_ids),
    'resumo', v_resumo,
    'trabalhos', v_trabalhos
  );
end;
$$;

create or replace function public.preparar_checklist_automacao_teste_interno(
  p_competencia_referencia date,
  p_cliente_ids uuid[],
  p_chave_requisicao text,
  p_iniciado_por uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_config public.checklist_automacao_configuracao;
  v_competencia date;
  v_cliente_ids uuid[];
  v_segundo_dia_util date;
  v_agendada_para timestamp with time zone;
  v_chave text;
  v_execucao public.checklist_automacao_execucoes;
  v_resumo jsonb;
  v_trabalhos jsonb;
begin
  select * into v_usuario
  from public.usuarios u
  where u.id = p_iniciado_por
    and u.status = 'Ativo'
    and u.perfil_acesso in ('coordenador_administrador', 'setor_contabil_operacional');

  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para executar o teste da automacao.';
  end if;

  v_competencia := date_trunc('month', p_competencia_referencia)::date;
  if p_competencia_referencia is null or p_competencia_referencia <> v_competencia then
    raise exception 'A competencia de referencia deve ser o primeiro dia do mes.';
  end if;

  if v_competencia > date_trunc('month', now() at time zone 'America/Manaus')::date then
    raise exception 'A competencia de referencia nao pode estar no futuro.';
  end if;

  if nullif(btrim(coalesce(p_chave_requisicao, '')), '') is null
     or length(btrim(p_chave_requisicao)) < 8
     or length(btrim(p_chave_requisicao)) > 180 then
    raise exception 'A chave da requisicao deve conter entre 8 e 180 caracteres.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao c
  where c.id = 1
  for update;

  if v_config.id is null or v_config.modo <> 'TESTE' then
    raise exception 'O teste manual exige que a automacao esteja no modo TESTE.';
  end if;

  v_cliente_ids := public.validar_checklist_automacao_teste_clientes_interno(p_cliente_ids);
  v_chave := concat('checklist:teste-manual:', btrim(p_chave_requisicao));
  v_segundo_dia_util := public.checklist_segundo_dia_util_manaus(
    extract(year from v_competencia)::integer,
    extract(month from v_competencia)::integer
  );
  v_agendada_para := now();

  select * into v_execucao
  from public.checklist_automacao_execucoes e
  where e.chave_idempotencia = v_chave
  limit 1;

  if v_execucao.id is not null then
    if v_execucao.modo <> 'TESTE'
       or v_execucao.acionamento <> 'MANUAL'
       or v_execucao.competencia_referencia <> v_competencia
       or v_execucao.iniciado_por is distinct from v_usuario.id
       or coalesce(v_execucao.detalhes->'cliente_ids', '[]'::jsonb) <> to_jsonb(v_cliente_ids) then
      raise exception 'A chave da requisicao ja foi usada com parametros diferentes.';
    end if;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.cliente_nome), '[]'::jsonb)
    into v_trabalhos
    from public.checklist_automacao_trabalhos t
    where t.execucao_id = v_execucao.id;

    return jsonb_build_object(
      'persistido', true,
      'duplicado', true,
      'automacao_global_pausada', not v_config.ativa,
      'execucao', to_jsonb(v_execucao),
      'resumo', coalesce(v_execucao.detalhes->'resumo', '{}'::jsonb),
      'trabalhos', v_trabalhos
    );
  end if;

  with candidatos as (
    select c.*
    from public.listar_checklist_automacao_candidatos_interno(v_competencia, 'TESTE') c
    where c.cliente_id = any(v_cliente_ids)
  )
  select jsonb_build_object(
    'total_clientes', count(*),
    'preparados', count(*) filter (where resultado = 'PREPARADO'),
    'sem_pendencias', count(*) filter (where resultado = 'SEM_PENDENCIAS'),
    'total_pendencias', coalesce(sum(qtd_pendencias) filter (where resultado = 'PREPARADO'), 0)
  )
  into v_resumo
  from candidatos;

  insert into public.checklist_automacao_execucoes (
    competencia_referencia,
    segundo_dia_util,
    agendada_para,
    modo,
    acionamento,
    status,
    chave_idempotencia,
    total_clientes,
    total_trabalhos,
    total_ignorados,
    detalhes,
    iniciado_por,
    iniciado_em
  )
  values (
    v_competencia,
    v_segundo_dia_util,
    v_agendada_para,
    'TESTE',
    'MANUAL',
    'PREPARANDO',
    v_chave,
    cardinality(v_cliente_ids),
    coalesce((v_resumo->>'preparados')::integer, 0),
    cardinality(v_cliente_ids) - coalesce((v_resumo->>'preparados')::integer, 0),
    jsonb_build_object(
      'tipo', 'TESTE_MANUAL_DIRECIONADO',
      'chave_requisicao', btrim(p_chave_requisicao),
      'cliente_ids', to_jsonb(v_cliente_ids),
      'resumo', v_resumo,
      'solicitado_por', jsonb_build_object(
        'id', v_usuario.id,
        'nome', v_usuario.nome,
        'email', v_usuario.email,
        'perfil_acesso', v_usuario.perfil_acesso
      )
    ),
    v_usuario.id,
    now()
  )
  on conflict do nothing
  returning * into v_execucao;

  if v_execucao.id is null then
    return public.preparar_checklist_automacao_teste_interno(
      v_competencia,
      v_cliente_ids,
      p_chave_requisicao,
      v_usuario.id
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
    'TESTE',
    'PREPARADO',
    null,
    c.competencias,
    c.itens_cobrados,
    c.qtd_pendencias,
    c.destinatario_original,
    c.cc_original,
    c.destinatario_efetivo,
    c.cc_efetivo,
    c.assunto,
    concat(v_execucao.id::text, ':', c.cliente_id::text)
  from public.listar_checklist_automacao_candidatos_interno(v_competencia, 'TESTE') c
  where c.cliente_id = any(v_cliente_ids)
    and c.resultado = 'PREPARADO'
  on conflict do nothing;

  update public.checklist_automacao_execucoes e
  set status = case
        when e.total_trabalhos > 0 then 'AGENDADA'
        else 'CONCLUIDA'
      end,
      finalizado_em = case when e.total_trabalhos = 0 then now() else null end
  where e.id = v_execucao.id
  returning * into v_execucao;

  insert into public.checklist_automacao_auditoria (
    entidade,
    entidade_id,
    operacao,
    valor_novo,
    alterado_por,
    alterado_por_nome,
    alterado_por_email
  )
  values (
    'EXECUCAO_TESTE',
    v_execucao.id::text,
    'EXECUTAR',
    jsonb_build_object(
      'execucao_id', v_execucao.id,
      'competencia_referencia', v_competencia,
      'chave_requisicao', btrim(p_chave_requisicao),
      'cliente_ids', to_jsonb(v_cliente_ids),
      'automacao_global_pausada', not v_config.ativa,
      'resumo', v_resumo
    ),
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email
  );

  select coalesce(jsonb_agg(to_jsonb(t) order by t.cliente_nome), '[]'::jsonb)
  into v_trabalhos
  from public.checklist_automacao_trabalhos t
  where t.execucao_id = v_execucao.id;

  return jsonb_build_object(
    'persistido', true,
    'duplicado', false,
    'automacao_global_pausada', not v_config.ativa,
    'execucao', to_jsonb(v_execucao),
    'resumo', v_resumo,
    'trabalhos', v_trabalhos
  );
end;
$$;

-- Mantem os testes manuais fora da fila global. Eles so podem ser adquiridos
-- pela reserva direcionada definida logo abaixo.
create or replace function public.reservar_checklist_automacao_trabalhos_interno(
  p_limite integer default 10,
  p_duracao_reserva_minutos integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.checklist_automacao_configuracao;
  v_quantidade integer;
  v_trabalhos jsonb;
  v_execucao_id uuid;
  v_execucoes_recalcular uuid[] := '{}'::uuid[];
begin
  if p_limite is null or p_limite < 1 or p_limite > 50 then
    raise exception 'O limite da reserva deve estar entre 1 e 50.';
  end if;

  if p_duracao_reserva_minutos is null
     or p_duracao_reserva_minutos < 1
     or p_duracao_reserva_minutos > 60 then
    raise exception 'A duracao da reserva deve estar entre 1 e 60 minutos.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao c
  where c.id = 1;

  if v_config.id is null then
    raise exception 'Configuracao global da automacao nao encontrada.';
  end if;

  if v_config.ativa = false then
    return jsonb_build_object(
      'quantidade', 0,
      'trabalhos', '[]'::jsonb,
      'pausada', true
    );
  end if;

  with atualizados as (
    update public.checklist_automacao_trabalhos t
    set status = 'CANCELADO',
        erro_codigo = 'CLIENTE_REMOVIDO',
        erro_mensagem = 'O cliente foi removido antes do processamento.',
        erro_transitorio = false,
        reservado_em = null,
        reserva_expira_em = null,
        finalizado_em = now()
    where t.cliente_id is null
      and t.status in ('PREPARADO', 'PROCESSANDO', 'AGUARDANDO_NOVA_TENTATIVA')
      and not exists (
        select 1
        from public.checklist_automacao_execucoes e
        where e.id = t.execucao_id
          and e.detalhes->>'tipo' = 'TESTE_MANUAL_DIRECIONADO'
      )
    returning t.execucao_id
  )
  select coalesce(array_agg(distinct a.execucao_id), '{}'::uuid[])
  into v_execucoes_recalcular
  from atualizados a;

  with atualizados as (
    update public.checklist_automacao_trabalhos t
    set status = 'FALHOU',
        erro_codigo = 'RESERVA_EXPIRADA',
        erro_mensagem = 'A ultima reserva expirou no limite de tentativas.',
        erro_transitorio = false,
        reservado_em = null,
        reserva_expira_em = null,
        finalizado_em = now()
    where t.status = 'PROCESSANDO'
      and t.reserva_expira_em <= now()
      and t.tentativa_atual >= t.tentativas_max
      and not exists (
        select 1
        from public.checklist_automacao_execucoes e
        where e.id = t.execucao_id
          and e.detalhes->>'tipo' = 'TESTE_MANUAL_DIRECIONADO'
      )
    returning t.execucao_id
  )
  select v_execucoes_recalcular
    || coalesce(array_agg(distinct a.execucao_id), '{}'::uuid[])
  into v_execucoes_recalcular
  from atualizados a;

  update public.checklist_envios e
  set status = 'CANCELADO',
      erro_codigo = null,
      erro_mensagem = null,
      finalizado_em = now()
  from public.checklist_automacao_trabalhos t
  where t.envio_id = e.id
    and t.status = 'CANCELADO'
    and t.erro_codigo = 'CLIENTE_REMOVIDO'
    and e.status = 'PROCESSANDO';

  update public.checklist_envios e
  set status = 'FALHOU',
      erro_codigo = 'RESERVA_EXPIRADA',
      erro_mensagem = 'A ultima reserva expirou no limite de tentativas.',
      finalizado_em = now()
  from public.checklist_automacao_trabalhos t
  where t.envio_id = e.id
    and t.status = 'FALHOU'
    and t.erro_codigo = 'RESERVA_EXPIRADA'
    and e.status = 'PROCESSANDO';

  for v_execucao_id in
    select distinct unnest(v_execucoes_recalcular)
  loop
    perform public.checklist_automacao_recalcular_execucao_interno(v_execucao_id);
  end loop;

  with candidatos as (
    select t.id
    from public.checklist_automacao_trabalhos t
    join public.checklist_automacao_clientes ac
      on ac.cliente_id = t.cliente_id
     and ac.habilitada = true
    join public.checklist_automacao_execucoes e
      on e.id = t.execucao_id
     and coalesce(e.detalhes->>'tipo', '') <> 'TESTE_MANUAL_DIRECIONADO'
    where (
        t.status in ('PREPARADO', 'AGUARDANDO_NOVA_TENTATIVA')
        and t.disponivel_em <= now()
      )
      or (
        t.status = 'PROCESSANDO'
        and t.reserva_expira_em <= now()
        and t.tentativa_atual < t.tentativas_max
      )
    order by t.disponivel_em, t.criado_em, t.id
    for update of t skip locked
    limit p_limite
  ), atualizados as (
    update public.checklist_automacao_trabalhos t
    set status = 'PROCESSANDO',
        tentativa_atual = t.tentativa_atual + 1,
        primeira_tentativa_em = coalesce(t.primeira_tentativa_em, now()),
        ultima_tentativa_em = now(),
        reservado_em = now(),
        reserva_expira_em = now() + make_interval(mins => p_duracao_reserva_minutos),
        token_reserva = gen_random_uuid(),
        erro_codigo = null,
        erro_mensagem = null,
        erro_transitorio = null,
        finalizado_em = null
    from candidatos c
    where t.id = c.id
    returning t.*
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(a) order by a.disponivel_em, a.criado_em), '[]'::jsonb)
  into v_quantidade, v_trabalhos
  from atualizados a;

  update public.checklist_automacao_execucoes e
  set status = 'PROCESSANDO',
      finalizado_em = null
  where e.id in (
    select distinct (item->>'execucao_id')::uuid
    from jsonb_array_elements(v_trabalhos) item
  );

  return jsonb_build_object(
    'quantidade', coalesce(v_quantidade, 0),
    'trabalhos', coalesce(v_trabalhos, '[]'::jsonb)
  );
end;
$$;

create or replace function public.reservar_checklist_automacao_teste_interno(
  p_execucao_id uuid,
  p_limite integer default 10,
  p_duracao_reserva_minutos integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_execucao public.checklist_automacao_execucoes;
  v_config public.checklist_automacao_configuracao;
  v_quantidade integer;
  v_trabalhos jsonb;
begin
  if p_execucao_id is null then
    raise exception 'A execucao do teste e obrigatoria.';
  end if;

  if p_limite is null or p_limite < 1 or p_limite > 10 then
    raise exception 'O limite do teste deve estar entre 1 e 10.';
  end if;

  if p_duracao_reserva_minutos is null
     or p_duracao_reserva_minutos < 1
     or p_duracao_reserva_minutos > 60 then
    raise exception 'A duracao da reserva deve estar entre 1 e 60 minutos.';
  end if;

  select * into v_execucao
  from public.checklist_automacao_execucoes e
  where e.id = p_execucao_id
  for update;

  if v_execucao.id is null
     or v_execucao.modo <> 'TESTE'
     or v_execucao.acionamento <> 'MANUAL'
     or v_execucao.detalhes->>'tipo' <> 'TESTE_MANUAL_DIRECIONADO' then
    raise exception 'Execucao de teste manual invalida.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao c
  where c.id = 1;

  if v_config.id is null or v_config.modo <> 'TESTE' then
    raise exception 'A reserva manual exige que a automacao esteja no modo TESTE.';
  end if;

  update public.checklist_automacao_trabalhos t
  set status = 'CANCELADO',
      erro_codigo = 'CLIENTE_REMOVIDO',
      erro_mensagem = 'O cliente foi removido antes do processamento.',
      erro_transitorio = false,
      reservado_em = null,
      reserva_expira_em = null,
      finalizado_em = now()
  where t.execucao_id = p_execucao_id
    and t.cliente_id is null
    and t.status in ('PREPARADO', 'PROCESSANDO', 'AGUARDANDO_NOVA_TENTATIVA');

  update public.checklist_automacao_trabalhos t
  set status = 'FALHOU',
      erro_codigo = 'RESERVA_EXPIRADA',
      erro_mensagem = 'A ultima reserva expirou no limite de tentativas.',
      erro_transitorio = false,
      reservado_em = null,
      reserva_expira_em = null,
      finalizado_em = now()
  where t.execucao_id = p_execucao_id
    and t.status = 'PROCESSANDO'
    and t.reserva_expira_em <= now()
    and t.tentativa_atual >= t.tentativas_max;

  perform public.checklist_automacao_recalcular_execucao_interno(p_execucao_id);

  with candidatos as (
    select t.id
    from public.checklist_automacao_trabalhos t
    join public.checklist_automacao_clientes ac
      on ac.cliente_id = t.cliente_id
     and ac.habilitada = true
    where t.execucao_id = p_execucao_id
      and (
        (
          t.status in ('PREPARADO', 'AGUARDANDO_NOVA_TENTATIVA')
          and t.disponivel_em <= now()
        )
        or (
          t.status = 'PROCESSANDO'
          and t.reserva_expira_em <= now()
          and t.tentativa_atual < t.tentativas_max
        )
      )
    order by t.disponivel_em, t.criado_em, t.id
    for update skip locked
    limit p_limite
  ), atualizados as (
    update public.checklist_automacao_trabalhos t
    set status = 'PROCESSANDO',
        tentativa_atual = t.tentativa_atual + 1,
        primeira_tentativa_em = coalesce(t.primeira_tentativa_em, now()),
        ultima_tentativa_em = now(),
        reservado_em = now(),
        reserva_expira_em = now() + make_interval(mins => p_duracao_reserva_minutos),
        token_reserva = gen_random_uuid(),
        erro_codigo = null,
        erro_mensagem = null,
        erro_transitorio = null,
        finalizado_em = null
    from candidatos c
    where t.id = c.id
    returning t.*
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(a) order by a.disponivel_em, a.criado_em), '[]'::jsonb)
  into v_quantidade, v_trabalhos
  from atualizados a;

  if coalesce(v_quantidade, 0) > 0 then
    update public.checklist_automacao_execucoes e
    set status = 'PROCESSANDO',
        finalizado_em = null
    where e.id = p_execucao_id;
  end if;

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'quantidade', coalesce(v_quantidade, 0),
    'trabalhos', coalesce(v_trabalhos, '[]'::jsonb),
    'automacao_global_pausada', coalesce(not v_config.ativa, true)
  );
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
      'clientes_total', (select count(*) from public.checklist_automacao_clientes),
      'clientes_habilitados', (
        select count(*) from public.checklist_automacao_clientes where habilitada
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

revoke all on function public.validar_checklist_automacao_teste_clientes_interno(uuid[])
  from public, anon, authenticated;
revoke all on function public.simular_checklist_automacao_teste_portal(date, uuid[])
  from public, anon, authenticated;
revoke all on function public.preparar_checklist_automacao_teste_interno(date, uuid[], text, uuid)
  from public, anon, authenticated;
revoke all on function public.reservar_checklist_automacao_teste_interno(uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.simular_checklist_automacao_teste_portal(date, uuid[])
  to authenticated;
grant execute on function public.obter_checklist_automacao_painel_portal()
  to authenticated;
grant execute on function public.validar_checklist_automacao_teste_clientes_interno(uuid[])
  to service_role;
grant execute on function public.preparar_checklist_automacao_teste_interno(date, uuid[], text, uuid)
  to service_role;
grant execute on function public.reservar_checklist_automacao_teste_interno(uuid, integer, integer)
  to service_role;

comment on function public.simular_checklist_automacao_teste_portal(date, uuid[]) is
  'Pre-visualiza um teste manual para ate 10 clientes habilitados, sem persistir ou enviar.';
comment on function public.preparar_checklist_automacao_teste_interno(date, uuid[], text, uuid) is
  'Prepara de forma idempotente uma execucao manual direcionada em modo TESTE.';
comment on function public.reservar_checklist_automacao_teste_interno(uuid, integer, integer) is
  'Reserva somente trabalhos de uma execucao manual TESTE, mesmo com a automacao global pausada.';

commit;
