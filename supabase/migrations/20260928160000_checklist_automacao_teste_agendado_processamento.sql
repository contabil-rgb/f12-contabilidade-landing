-- Portal de Gestao Contabil - Processamento do teste agendado da automacao
-- Etapa 8, parte 2: reserva, preparacao, acompanhamento e conclusao.
-- Esta migracao nao cria cron e nao chama servicos externos.

begin;

alter table public.checklist_automacao_agendamentos_teste
  add column if not exists disponivel_em timestamp with time zone,
  add column if not exists token_reserva uuid,
  add column if not exists reservado_em timestamp with time zone,
  add column if not exists reserva_expira_em timestamp with time zone,
  add column if not exists ciclos_processamento integer not null default 0,
  add column if not exists falhas_processamento integer not null default 0;

update public.checklist_automacao_agendamentos_teste
set disponivel_em = coalesce(disponivel_em, agendado_para)
where disponivel_em is null;

create or replace function public.checklist_automacao_agendamento_teste_definir_disponibilidade()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.disponivel_em := coalesce(new.disponivel_em, new.agendado_para);
  return new;
end;
$$;

drop trigger if exists trg_checklist_automacao_agendamento_teste_disponibilidade
  on public.checklist_automacao_agendamentos_teste;
create trigger trg_checklist_automacao_agendamento_teste_disponibilidade
before insert or update of agendado_para, disponivel_em
on public.checklist_automacao_agendamentos_teste
for each row execute function public.checklist_automacao_agendamento_teste_definir_disponibilidade();

alter table public.checklist_automacao_agendamentos_teste
  alter column disponivel_em set not null,
  drop constraint if exists checklist_automacao_agendamentos_teste_processamento_check;

alter table public.checklist_automacao_agendamentos_teste
  add constraint checklist_automacao_agendamentos_teste_processamento_check check (
    ciclos_processamento >= 0
    and falhas_processamento between 0 and 3
    and (
      status <> 'PROCESSANDO'
      or (token_reserva is not null and reservado_em is not null and reserva_expira_em is not null)
    )
  );

create index if not exists idx_checklist_automacao_agendamentos_teste_fila
  on public.checklist_automacao_agendamentos_teste (disponivel_em, criado_em)
  where status in ('AGENDADO', 'PROCESSANDO');

alter table public.checklist_automacao_auditoria
  drop constraint if exists checklist_automacao_auditoria_operacao_check;
alter table public.checklist_automacao_auditoria
  add constraint checklist_automacao_auditoria_operacao_check check (
    operacao in (
      'INSERT', 'UPDATE', 'DELETE', 'EXECUTAR', 'AGENDAR', 'CANCELAR',
      'PROCESSAR', 'CONCLUIR', 'FALHAR'
    )
  );

create or replace function public.reservar_checklist_automacao_agendamentos_teste_interno(
  p_limite integer default 1,
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
  v_agendamentos jsonb;
begin
  if p_limite is null or p_limite < 1 or p_limite > 5 then
    raise exception 'O limite de agendamentos deve estar entre 1 e 5.';
  end if;
  if p_duracao_reserva_minutos is null
     or p_duracao_reserva_minutos < 5
     or p_duracao_reserva_minutos > 30 then
    raise exception 'A duracao da reserva deve estar entre 5 e 30 minutos.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao
  where id = 1;

  if v_config.id is null or v_config.modo <> 'TESTE' or v_config.ativa then
    return jsonb_build_object(
      'quantidade', 0,
      'agendamentos', '[]'::jsonb,
      'bloqueada', true,
      'motivo', 'O processador agendado exige modo TESTE e automacao global pausada.'
    );
  end if;

  update public.checklist_automacao_agendamentos_teste a
  set status = 'FALHA',
      erro_codigo = 'PROCESSAMENTO_INDISPONIVEL',
      erro_mensagem = 'O agendamento excedeu tres falhas consecutivas de processamento.',
      token_reserva = null,
      reservado_em = null,
      reserva_expira_em = null,
      finalizado_em = now(),
      resumo = a.resumo || jsonb_build_object('fase', 'PROCESSAMENTO_FALHOU')
  where a.status = 'PROCESSANDO'
    and a.reserva_expira_em <= now()
    and a.falhas_processamento >= 3;

  with candidatos as (
    select a.id, (a.status = 'PROCESSANDO') as reserva_expirada
    from public.checklist_automacao_agendamentos_teste a
    where (
        a.status = 'AGENDADO'
        and a.disponivel_em <= now()
      ) or (
        a.status = 'PROCESSANDO'
        and a.reserva_expira_em <= now()
        and a.falhas_processamento < 3
      )
    order by a.disponivel_em, a.criado_em, a.id
    for update skip locked
    limit p_limite
  ), atualizados as (
    update public.checklist_automacao_agendamentos_teste a
    set status = 'PROCESSANDO',
        token_reserva = gen_random_uuid(),
        reservado_em = now(),
        reserva_expira_em = now() + make_interval(mins => p_duracao_reserva_minutos),
        iniciado_em = coalesce(a.iniciado_em, now()),
        ciclos_processamento = a.ciclos_processamento + 1,
        falhas_processamento = a.falhas_processamento
          + case when c.reserva_expirada then 1 else 0 end,
        erro_codigo = null,
        erro_mensagem = null,
        resumo = a.resumo || jsonb_build_object('fase', 'PROCESSANDO')
    from candidatos c
    where a.id = c.id
    returning a.*
  )
  select count(*)::integer,
         coalesce(jsonb_agg(to_jsonb(a) order by a.disponivel_em, a.criado_em), '[]'::jsonb)
  into v_quantidade, v_agendamentos
  from atualizados a;

  return jsonb_build_object(
    'quantidade', coalesce(v_quantidade, 0),
    'agendamentos', coalesce(v_agendamentos, '[]'::jsonb),
    'bloqueada', false,
    'automacao_global_pausada', true
  );
end;
$$;

create or replace function public.preparar_checklist_automacao_agendamento_teste_interno(
  p_agendamento_id uuid,
  p_token_reserva uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agendamento public.checklist_automacao_agendamentos_teste;
  v_config public.checklist_automacao_configuracao;
  v_execucao public.checklist_automacao_execucoes;
  v_segundo_dia_util date;
  v_chave text;
  v_resumo jsonb;
  v_trabalhos jsonb;
begin
  if p_agendamento_id is null or p_token_reserva is null then
    raise exception 'Agendamento e token de reserva sao obrigatorios.';
  end if;

  select * into v_agendamento
  from public.checklist_automacao_agendamentos_teste
  where id = p_agendamento_id
  for update;

  if v_agendamento.id is null then
    raise exception 'Agendamento de teste nao encontrado.';
  end if;
  if v_agendamento.status <> 'PROCESSANDO'
     or v_agendamento.token_reserva is distinct from p_token_reserva
     or v_agendamento.reserva_expira_em <= now() then
    raise exception 'A reserva do agendamento nao esta ativa.';
  end if;

  select * into v_config
  from public.checklist_automacao_configuracao
  where id = 1
  for share;
  if v_config.id is null or v_config.modo <> 'TESTE' or v_config.ativa then
    raise exception 'O processamento exige modo TESTE e automacao global pausada.';
  end if;

  v_chave := concat('checklist:teste-agendado:', v_agendamento.id::text);
  select * into v_execucao
  from public.checklist_automacao_execucoes
  where chave_idempotencia = v_chave;

  if v_execucao.id is not null then
    if v_execucao.detalhes->>'tipo' <> 'TESTE_AGENDADO_DIRECIONADO'
       or (v_execucao.detalhes->>'agendamento_id')::uuid <> v_agendamento.id then
      raise exception 'A chave da execucao agendada esta associada a outros parametros.';
    end if;
    update public.checklist_automacao_agendamentos_teste
    set execucao_id = v_execucao.id
    where id = v_agendamento.id;
  else
    with candidatos as (
      select c.*
      from public.listar_checklist_automacao_candidatos_interno(
        v_agendamento.competencia_referencia,
        'TESTE'
      ) c
      where v_agendamento.escopo = 'TODOS_ELEGIVEIS'
         or c.cliente_id = any(v_agendamento.cliente_ids)
    )
    select jsonb_build_object(
      'total_clientes', count(*),
      'preparados', count(*) filter (where resultado = 'PREPARADO'),
      'desabilitados', count(*) filter (where resultado = 'DESABILITADO'),
      'configuracao_incompleta', count(*) filter (where resultado = 'CONFIGURACAO_INCOMPLETA'),
      'sem_pendencias', count(*) filter (where resultado = 'SEM_PENDENCIAS'),
      'sem_contato', count(*) filter (where resultado = 'SEM_CONTATO'),
      'total_pendencias', coalesce(sum(qtd_pendencias) filter (where resultado = 'PREPARADO'), 0)
    ) into v_resumo
    from candidatos;

    v_segundo_dia_util := public.checklist_segundo_dia_util_manaus(
      extract(year from v_agendamento.competencia_referencia)::integer,
      extract(month from v_agendamento.competencia_referencia)::integer
    );

    insert into public.checklist_automacao_execucoes (
      competencia_referencia, segundo_dia_util, agendada_para, modo, acionamento,
      status, chave_idempotencia, total_clientes, total_trabalhos,
      total_ignorados, detalhes, iniciado_por, iniciado_em
    ) values (
      v_agendamento.competencia_referencia,
      v_segundo_dia_util,
      v_agendamento.agendado_para,
      'TESTE', 'MANUAL', 'PREPARANDO', v_chave,
      coalesce((v_resumo->>'total_clientes')::integer, 0),
      coalesce((v_resumo->>'preparados')::integer, 0),
      coalesce((v_resumo->>'total_clientes')::integer, 0)
        - coalesce((v_resumo->>'preparados')::integer, 0),
      jsonb_build_object(
        'tipo', 'TESTE_AGENDADO_DIRECIONADO',
        'agendamento_id', v_agendamento.id,
        'escopo', v_agendamento.escopo,
        'cliente_ids', to_jsonb(v_agendamento.cliente_ids),
        'resumo', v_resumo
      ),
      v_agendamento.criado_por,
      now()
    )
    returning * into v_execucao;

    insert into public.checklist_automacao_trabalhos (
      execucao_id, cliente_id, cliente_nome, cliente_cnpj, modo, status, motivo,
      competencias, itens_cobrados, qtd_pendencias, destinatario_original,
      cc_original, destinatario_efetivo, cc_efetivo, assunto, chave_idempotencia
    )
    select
      v_execucao.id, c.cliente_id, c.cliente_nome, c.cliente_cnpj, 'TESTE',
      'PREPARADO', null, c.competencias, c.itens_cobrados, c.qtd_pendencias,
      c.destinatario_original, c.cc_original,
      v_agendamento.destinatario_teste, v_agendamento.cc_teste,
      c.assunto, concat(v_execucao.id::text, ':', c.cliente_id::text)
    from public.listar_checklist_automacao_candidatos_interno(
      v_agendamento.competencia_referencia,
      'TESTE'
    ) c
    where (v_agendamento.escopo = 'TODOS_ELEGIVEIS'
           or c.cliente_id = any(v_agendamento.cliente_ids))
      and c.resultado = 'PREPARADO'
    on conflict do nothing;

    update public.checklist_automacao_execucoes
    set status = case when total_trabalhos > 0 then 'AGENDADA' else 'CONCLUIDA' end,
        finalizado_em = case when total_trabalhos = 0 then now() else null end
    where id = v_execucao.id
    returning * into v_execucao;

    update public.checklist_automacao_agendamentos_teste
    set execucao_id = v_execucao.id,
        resumo = v_resumo || jsonb_build_object('fase', 'TRABALHOS_PREPARADOS')
    where id = v_agendamento.id;

    insert into public.checklist_automacao_auditoria (
      entidade, entidade_id, operacao, valor_novo, alterado_por
    ) values (
      'AGENDAMENTO_TESTE', v_agendamento.id::text, 'PROCESSAR',
      jsonb_build_object('execucao_id', v_execucao.id, 'resumo', v_resumo),
      v_agendamento.criado_por
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.cliente_nome), '[]'::jsonb)
  into v_trabalhos
  from public.checklist_automacao_trabalhos t
  where t.execucao_id = v_execucao.id;

  return jsonb_build_object(
    'ok', true,
    'agendamento_id', v_agendamento.id,
    'execucao', to_jsonb(v_execucao),
    'resumo', coalesce(v_execucao.detalhes->'resumo', '{}'::jsonb),
    'trabalhos', v_trabalhos,
    'automacao_global_pausada', true
  );
end;
$$;

create or replace function public.finalizar_checklist_automacao_agendamento_teste_interno(
  p_agendamento_id uuid,
  p_token_reserva uuid,
  p_resultado jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agendamento public.checklist_automacao_agendamentos_teste;
  v_execucao public.checklist_automacao_execucoes;
  v_proxima_tentativa timestamp with time zone;
  v_erro_codigo text;
  v_erro_mensagem text;
  v_status text;
begin
  if jsonb_typeof(coalesce(p_resultado, '{}'::jsonb)) <> 'object' then
    raise exception 'O resultado do processamento deve ser um objeto JSON.';
  end if;

  select * into v_agendamento
  from public.checklist_automacao_agendamentos_teste
  where id = p_agendamento_id
  for update;

  if v_agendamento.id is null
     or v_agendamento.status <> 'PROCESSANDO'
     or v_agendamento.token_reserva is distinct from p_token_reserva then
    raise exception 'Reserva do agendamento invalida para finalizacao.';
  end if;

  v_erro_codigo := nullif(btrim(coalesce(p_resultado->>'erro_codigo', '')), '');
  v_erro_mensagem := nullif(btrim(coalesce(p_resultado->>'erro_mensagem', '')), '');

  if v_erro_codigo is not null then
    update public.checklist_automacao_agendamentos_teste a
    set status = case when a.falhas_processamento + 1 >= 3 then 'FALHA' else 'AGENDADO' end,
        disponivel_em = case
          when a.falhas_processamento + 1 >= 3 then a.disponivel_em
          else now() + interval '5 minutes'
        end,
        falhas_processamento = a.falhas_processamento + 1,
        erro_codigo = v_erro_codigo,
        erro_mensagem = left(coalesce(v_erro_mensagem, 'Falha no processamento.'), 1000),
        token_reserva = null,
        reservado_em = null,
        reserva_expira_em = null,
        finalizado_em = case when a.falhas_processamento + 1 >= 3 then now() else null end,
        resumo = a.resumo || jsonb_build_object(
          'fase', case when a.falhas_processamento + 1 >= 3 then 'PROCESSAMENTO_FALHOU' else 'NOVA_TENTATIVA_PROCESSADOR' end,
          'ultimo_resultado', p_resultado
        )
    where a.id = v_agendamento.id
    returning * into v_agendamento;
  else
    if v_agendamento.execucao_id is null then
      raise exception 'O agendamento nao possui execucao preparada.';
    end if;

    select * into v_execucao
    from public.checklist_automacao_recalcular_execucao_interno(v_agendamento.execucao_id);

    select min(t.disponivel_em) into v_proxima_tentativa
    from public.checklist_automacao_trabalhos t
    where t.execucao_id = v_execucao.id
      and t.status in ('PREPARADO', 'PROCESSANDO', 'AGUARDANDO_NOVA_TENTATIVA');

    v_status := case
      when v_execucao.status = 'CONCLUIDA' then 'CONCLUIDO'
      when v_execucao.status in ('CONCLUIDA_COM_FALHAS', 'FALHOU', 'CANCELADA') then 'FALHA'
      else 'AGENDADO'
    end;

    update public.checklist_automacao_agendamentos_teste a
    set status = v_status,
        disponivel_em = case
          when v_status = 'AGENDADO' then coalesce(v_proxima_tentativa, now() + interval '1 minute')
          else a.disponivel_em
        end,
        token_reserva = null,
        reservado_em = null,
        reserva_expira_em = null,
        falhas_processamento = 0,
        erro_codigo = case when v_status = 'FALHA' then coalesce(v_execucao.erro_codigo, 'ENVIO_COM_FALHAS') else null end,
        erro_mensagem = case when v_status = 'FALHA' then coalesce(v_execucao.erro_mensagem, 'Um ou mais lembretes falharam.') else null end,
        finalizado_em = case when v_status in ('CONCLUIDO', 'FALHA') then now() else null end,
        resumo = a.resumo || jsonb_build_object(
          'fase', case
            when v_status = 'CONCLUIDO' then 'CONCLUIDO'
            when v_status = 'FALHA' then 'CONCLUIDO_COM_FALHAS'
            else 'AGUARDANDO_TRABALHOS'
          end,
          'execucao_status', v_execucao.status,
          'total_enviados', v_execucao.total_enviados,
          'total_falhas', v_execucao.total_falhas,
          'ultimo_resultado', p_resultado
        )
    where a.id = v_agendamento.id
    returning * into v_agendamento;
  end if;

  if v_agendamento.status in ('CONCLUIDO', 'FALHA') then
    insert into public.checklist_automacao_auditoria (
      entidade, entidade_id, operacao, valor_novo, alterado_por
    ) values (
      'AGENDAMENTO_TESTE', v_agendamento.id::text,
      case when v_agendamento.status = 'CONCLUIDO' then 'CONCLUIR' else 'FALHAR' end,
      to_jsonb(v_agendamento), v_agendamento.criado_por
    );
  end if;

  return jsonb_build_object('ok', true, 'agendamento', to_jsonb(v_agendamento));
end;
$$;

-- Mantem testes manuais e agendados fora da fila global e permite
-- que ambos usem o processador direcionado ja validado.
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
          and e.detalhes->>'tipo' in ('TESTE_MANUAL_DIRECIONADO', 'TESTE_AGENDADO_DIRECIONADO')
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
          and e.detalhes->>'tipo' in ('TESTE_MANUAL_DIRECIONADO', 'TESTE_AGENDADO_DIRECIONADO')
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
     and coalesce(e.detalhes->>'tipo', '') not in ('TESTE_MANUAL_DIRECIONADO', 'TESTE_AGENDADO_DIRECIONADO')
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
     or v_execucao.detalhes->>'tipo' not in ('TESTE_MANUAL_DIRECIONADO', 'TESTE_AGENDADO_DIRECIONADO') then
    raise exception 'Execucao de teste direcionada invalida.';
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


revoke all on function public.reservar_checklist_automacao_agendamentos_teste_interno(integer, integer)
  from public, anon, authenticated;
revoke all on function public.preparar_checklist_automacao_agendamento_teste_interno(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finalizar_checklist_automacao_agendamento_teste_interno(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.reservar_checklist_automacao_agendamentos_teste_interno(integer, integer)
  to service_role;
grant execute on function public.preparar_checklist_automacao_agendamento_teste_interno(uuid, uuid)
  to service_role;
grant execute on function public.finalizar_checklist_automacao_agendamento_teste_interno(uuid, uuid, jsonb)
  to service_role;

comment on function public.reservar_checklist_automacao_agendamentos_teste_interno(integer, integer) is
  'Reserva agendamentos TESTE vencidos sem criar execucoes ou realizar chamadas externas.';
comment on function public.preparar_checklist_automacao_agendamento_teste_interno(uuid, uuid) is
  'Prepara de forma idempotente a execucao e os trabalhos de um teste agendado reservado.';
comment on function public.finalizar_checklist_automacao_agendamento_teste_interno(uuid, uuid, jsonb) is
  'Libera, reagenda ou conclui um teste agendado conforme o estado da execucao direcionada.';

commit;
