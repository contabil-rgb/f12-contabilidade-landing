-- Portal de Gestao Contabil - Fila relacional da automacao
-- Etapa 4, parte 1: reserva concorrente, tentativas e conclusao dos trabalhos.
-- Nao cria cron, nao chama Edge Functions e nao envia e-mails.

begin;

alter table public.checklist_automacao_trabalhos
  add column if not exists tentativa_atual integer not null default 0,
  add column if not exists tentativas_max smallint,
  add column if not exists intervalos_tentativas_minutos integer[],
  add column if not exists disponivel_em timestamp with time zone,
  add column if not exists primeira_tentativa_em timestamp with time zone,
  add column if not exists ultima_tentativa_em timestamp with time zone,
  add column if not exists reservado_em timestamp with time zone,
  add column if not exists reserva_expira_em timestamp with time zone,
  add column if not exists token_reserva uuid,
  add column if not exists tentativa_envio_iniciada integer not null default 0,
  add column if not exists envio_iniciado_em timestamp with time zone,
  add column if not exists envio_id uuid,
  add column if not exists email_resend_id text,
  add column if not exists erro_codigo text,
  add column if not exists erro_mensagem text,
  add column if not exists erro_transitorio boolean,
  add column if not exists finalizado_em timestamp with time zone;

alter table public.checklist_automacao_trabalhos
  drop constraint if exists checklist_automacao_trabalhos_status_check,
  drop constraint if exists checklist_automacao_trabalhos_tentativas_check,
  drop constraint if exists checklist_automacao_trabalhos_intervalos_check,
  drop constraint if exists checklist_automacao_trabalhos_reserva_check,
  drop constraint if exists checklist_automacao_trabalhos_envio_id_fkey;

create or replace function public.checklist_intervalos_tentativas_validos(
  p_intervalos integer[],
  p_tentativas smallint
)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_indice integer;
begin
  if p_tentativas < 1
     or p_tentativas > 5
     or cardinality(p_intervalos) <> p_tentativas
     or p_intervalos[1] <> 0 then
    return false;
  end if;

  for v_indice in 1..p_tentativas loop
    if p_intervalos[v_indice] is null
       or p_intervalos[v_indice] < 0
       or (
         v_indice > 1
         and p_intervalos[v_indice] <= p_intervalos[v_indice - 1]
       ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.checklist_automacao_inicializar_trabalho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.checklist_automacao_configuracao;
  v_execucao public.checklist_automacao_execucoes;
begin
  select * into v_config
  from public.checklist_automacao_configuracao c
  where c.id = 1;

  if v_config.id is null then
    raise exception 'Configuracao global da automacao nao encontrada.';
  end if;

  select * into v_execucao
  from public.checklist_automacao_execucoes e
  where e.id = new.execucao_id;

  if v_execucao.id is null then
    raise exception 'Execucao da automacao nao encontrada.';
  end if;

  new.tentativas_max := coalesce(new.tentativas_max, v_config.tentativas_max);
  new.intervalos_tentativas_minutos := coalesce(
    new.intervalos_tentativas_minutos,
    v_config.intervalos_tentativas_minutos
  );
  new.disponivel_em := coalesce(
    new.disponivel_em,
    case
      when v_execucao.acionamento = 'AGENDADO' then v_execucao.agendada_para
      else now()
    end
  );

  return new;
end;
$$;

drop trigger if exists trg_checklist_automacao_trabalhos_inicializar
  on public.checklist_automacao_trabalhos;
create trigger trg_checklist_automacao_trabalhos_inicializar
before insert on public.checklist_automacao_trabalhos
for each row execute function public.checklist_automacao_inicializar_trabalho();

update public.checklist_automacao_trabalhos t
set tentativas_max = coalesce(t.tentativas_max, c.tentativas_max),
    intervalos_tentativas_minutos = coalesce(
      t.intervalos_tentativas_minutos,
      c.intervalos_tentativas_minutos
    ),
    disponivel_em = coalesce(
      t.disponivel_em,
      case
        when e.acionamento = 'AGENDADO' then e.agendada_para
        else t.criado_em
      end
    )
from public.checklist_automacao_configuracao c,
     public.checklist_automacao_execucoes e
where c.id = 1
  and e.id = t.execucao_id;

alter table public.checklist_automacao_trabalhos
  alter column tentativas_max set not null,
  alter column intervalos_tentativas_minutos set not null,
  alter column disponivel_em set not null,
  add constraint checklist_automacao_trabalhos_status_check
    check (
      status in (
        'PREPARADO',
        'PROCESSANDO',
        'AGUARDANDO_NOVA_TENTATIVA',
        'ENVIADO',
        'FALHOU',
        'IGNORADO',
        'CANCELADO'
      )
    ),
  add constraint checklist_automacao_trabalhos_tentativas_check
    check (
      tentativa_atual between 0 and tentativas_max
      and tentativa_envio_iniciada between 0 and tentativa_atual
    ),
  add constraint checklist_automacao_trabalhos_intervalos_check
    check (
      public.checklist_intervalos_tentativas_validos(
        intervalos_tentativas_minutos,
        tentativas_max
      )
    ),
  add constraint checklist_automacao_trabalhos_reserva_check
    check (
      status <> 'PROCESSANDO'
      or (
        token_reserva is not null
        and reservado_em is not null
        and reserva_expira_em is not null
        and reserva_expira_em > reservado_em
      )
    ),
  add constraint checklist_automacao_trabalhos_envio_id_fkey
    foreign key (envio_id)
    references public.checklist_envios(id)
    on delete set null;

create index if not exists idx_checklist_automacao_trabalhos_fila
  on public.checklist_automacao_trabalhos (disponivel_em, criado_em)
  where status in ('PREPARADO', 'AGUARDANDO_NOVA_TENTATIVA', 'PROCESSANDO');

create index if not exists idx_checklist_automacao_trabalhos_envio
  on public.checklist_automacao_trabalhos (envio_id)
  where envio_id is not null;

revoke all on table public.checklist_automacao_trabalhos from anon, authenticated;

drop policy if exists checklist_automacao_trabalhos_select_usuario_ativo
  on public.checklist_automacao_trabalhos;

create or replace function public.checklist_automacao_recalcular_execucao_interno(
  p_execucao_id uuid
)
returns public.checklist_automacao_execucoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendentes integer;
  v_enviados integer;
  v_falhas integer;
  v_execucao public.checklist_automacao_execucoes;
begin
  if p_execucao_id is null then
    raise exception 'Execucao e obrigatoria para recalcular os totais.';
  end if;

  select
    count(*) filter (
      where t.status in (
        'PREPARADO',
        'PROCESSANDO',
        'AGUARDANDO_NOVA_TENTATIVA'
      )
    )::integer,
    count(*) filter (where t.status = 'ENVIADO')::integer,
    count(*) filter (where t.status = 'FALHOU')::integer
  into v_pendentes, v_enviados, v_falhas
  from public.checklist_automacao_trabalhos t
  where t.execucao_id = p_execucao_id;

  update public.checklist_automacao_execucoes e
  set total_enviados = coalesce(v_enviados, 0),
      total_falhas = coalesce(v_falhas, 0),
      status = case
        when coalesce(v_pendentes, 0) > 0 then 'PROCESSANDO'
        when coalesce(v_falhas, 0) > 0 then 'CONCLUIDA_COM_FALHAS'
        else 'CONCLUIDA'
      end,
      finalizado_em = case
        when coalesce(v_pendentes, 0) > 0 then null
        else coalesce(e.finalizado_em, now())
      end
  where e.id = p_execucao_id
  returning * into v_execucao;

  if v_execucao.id is null then
    raise exception 'Execucao da automacao nao encontrada.';
  end if;

  return v_execucao;
end;
$$;

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

create or replace function public.iniciar_checklist_automacao_envio_interno(
  p_trabalho_id uuid,
  p_token_reserva uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.checklist_automacao_trabalhos;
  v_envio public.checklist_envios;
begin
  if p_trabalho_id is null or p_token_reserva is null then
    raise exception 'Trabalho e token da reserva sao obrigatorios.';
  end if;

  select * into v_trabalho
  from public.checklist_automacao_trabalhos t
  where t.id = p_trabalho_id
  for update;

  if v_trabalho.id is null then
    raise exception 'Trabalho da automacao nao encontrado.';
  end if;

  if v_trabalho.status <> 'PROCESSANDO'
     or v_trabalho.token_reserva <> p_token_reserva
     or v_trabalho.reserva_expira_em <= now() then
    raise exception 'A reserva do trabalho nao esta ativa.';
  end if;

  if v_trabalho.tentativa_envio_iniciada = v_trabalho.tentativa_atual then
    select * into v_envio
    from public.checklist_envios e
    where e.id = v_trabalho.envio_id;

    return jsonb_build_object(
      'adquirido', false,
      'trabalho', to_jsonb(v_trabalho),
      'envio', case when v_envio.id is null then null else to_jsonb(v_envio) end
    );
  end if;

  insert into public.checklist_envios (
    cliente_id,
    cliente_nome,
    cliente_cnpj,
    competencias,
    itens_cobrados,
    destinatario,
    cc,
    assunto,
    qtd_pendencias,
    origem,
    status,
    tentativa,
    chave_idempotencia,
    execucao_id,
    enviado_por,
    enviado_por_nome,
    enviado_por_email,
    iniciado_em,
    finalizado_em,
    enviado_em,
    erro_codigo,
    erro_mensagem
  )
  values (
    v_trabalho.cliente_id,
    v_trabalho.cliente_nome,
    v_trabalho.cliente_cnpj,
    v_trabalho.competencias,
    v_trabalho.itens_cobrados,
    v_trabalho.destinatario_efetivo,
    v_trabalho.cc_efetivo,
    v_trabalho.assunto,
    v_trabalho.qtd_pendencias,
    'AUTOMATICO',
    'PROCESSANDO',
    v_trabalho.tentativa_atual,
    v_trabalho.chave_idempotencia,
    v_trabalho.execucao_id,
    null,
    'Automacao do checklist',
    null,
    now(),
    null,
    null,
    null,
    null
  )
  on conflict do nothing
  returning * into v_envio;

  if v_envio.id is null then
    select * into v_envio
    from public.checklist_envios e
    where e.chave_idempotencia = v_trabalho.chave_idempotencia
    limit 1
    for update;

    if v_envio.id is null then
      select * into v_envio
      from public.checklist_envios e
      where e.origem = 'AUTOMATICO'
        and e.execucao_id = v_trabalho.execucao_id
        and e.cliente_id = v_trabalho.cliente_id
      order by e.criado_em
      limit 1
      for update;
    end if;
  end if;

  if v_envio.id is null then
    raise exception 'Nao foi possivel criar o historico do envio automatico.';
  end if;

  if v_envio.origem <> 'AUTOMATICO'
     or v_envio.execucao_id <> v_trabalho.execucao_id
     or v_envio.cliente_id is distinct from v_trabalho.cliente_id then
    raise exception 'A chave idempotente pertence a outro envio.';
  end if;

  if v_envio.status = 'ENVIADO' then
    update public.checklist_automacao_trabalhos t
    set status = 'ENVIADO',
        envio_id = v_envio.id,
        email_resend_id = v_envio.email_resend_id,
        reservado_em = null,
        reserva_expira_em = null,
        finalizado_em = coalesce(v_envio.finalizado_em, v_envio.enviado_em, now())
    where t.id = v_trabalho.id
    returning * into v_trabalho;

    perform public.checklist_automacao_recalcular_execucao_interno(v_trabalho.execucao_id);

    return jsonb_build_object(
      'adquirido', false,
      'ja_enviado', true,
      'trabalho', to_jsonb(v_trabalho),
      'envio', to_jsonb(v_envio)
    );
  end if;

  update public.checklist_envios e
  set status = 'PROCESSANDO',
      tentativa = v_trabalho.tentativa_atual,
      erro_codigo = null,
      erro_mensagem = null,
      iniciado_em = now(),
      finalizado_em = null,
      enviado_em = null
  where e.id = v_envio.id
  returning * into v_envio;

  update public.checklist_automacao_trabalhos t
  set tentativa_envio_iniciada = t.tentativa_atual,
      envio_iniciado_em = now(),
      envio_id = v_envio.id
  where t.id = v_trabalho.id
  returning * into v_trabalho;

  return jsonb_build_object(
    'adquirido', true,
    'ja_enviado', false,
    'trabalho', to_jsonb(v_trabalho),
    'envio', to_jsonb(v_envio)
  );
end;
$$;

create or replace function public.finalizar_checklist_automacao_trabalho_interno(
  p_trabalho_id uuid,
  p_token_reserva uuid,
  p_status text,
  p_resultado jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.checklist_automacao_trabalhos;
  v_envio public.checklist_envios;
  v_status text;
  v_email_resend_id text;
  v_erro_codigo text;
  v_erro_mensagem text;
  v_erro_transitorio boolean;
  v_proxima_tentativa integer;
  v_proximo_intervalo integer;
  v_proximo_horario timestamp with time zone;
begin
  if p_trabalho_id is null or p_token_reserva is null then
    raise exception 'Trabalho e token da reserva sao obrigatorios.';
  end if;

  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object' then
    raise exception 'Resultado do processamento invalido.';
  end if;

  v_status := upper(nullif(btrim(coalesce(p_status, '')), ''));
  if v_status not in ('ENVIADO', 'FALHOU', 'CANCELADO') then
    raise exception 'Status final do trabalho invalido.';
  end if;

  v_email_resend_id := nullif(btrim(coalesce(p_resultado->>'email_resend_id', '')), '');
  v_erro_codigo := nullif(btrim(coalesce(p_resultado->>'erro_codigo', '')), '');
  v_erro_mensagem := nullif(btrim(coalesce(p_resultado->>'erro_mensagem', '')), '');
  v_erro_transitorio := coalesce((p_resultado->>'erro_transitorio')::boolean, false);

  select * into v_trabalho
  from public.checklist_automacao_trabalhos t
  where t.id = p_trabalho_id
  for update;

  if v_trabalho.id is null then
    raise exception 'Trabalho da automacao nao encontrado.';
  end if;

  if v_trabalho.token_reserva = p_token_reserva
     and (
       v_trabalho.status = v_status
       or (v_status = 'FALHOU' and v_trabalho.status = 'AGUARDANDO_NOVA_TENTATIVA')
     ) then
    return jsonb_build_object(
      'duplicado', true,
      'trabalho', to_jsonb(v_trabalho)
    );
  end if;

  if v_trabalho.status <> 'PROCESSANDO'
     or v_trabalho.token_reserva <> p_token_reserva then
    raise exception 'A reserva do trabalho nao corresponde ao processamento atual.';
  end if;

  if v_trabalho.tentativa_envio_iniciada <> v_trabalho.tentativa_atual
     or v_trabalho.envio_id is null then
    raise exception 'O historico do envio deve ser iniciado antes da finalizacao.';
  end if;

  select * into v_envio
  from public.checklist_envios e
  where e.id = v_trabalho.envio_id
  for update;

  if v_envio.id is null then
    raise exception 'Historico do envio automatico nao encontrado.';
  end if;

  if v_status = 'ENVIADO' and v_email_resend_id is null then
    raise exception 'Identificador do Resend e obrigatorio para concluir o envio.';
  end if;

  if v_status = 'FALHOU' and v_erro_mensagem is null then
    raise exception 'Mensagem de erro e obrigatoria para registrar falha.';
  end if;

  if v_status = 'FALHOU'
     and v_erro_transitorio
     and v_trabalho.tentativa_atual < v_trabalho.tentativas_max then
    v_proxima_tentativa := v_trabalho.tentativa_atual + 1;
    v_proximo_intervalo := v_trabalho.intervalos_tentativas_minutos[v_proxima_tentativa];
    v_proximo_horario := greatest(
      v_trabalho.primeira_tentativa_em + make_interval(mins => v_proximo_intervalo),
      now()
    );

    update public.checklist_envios e
    set status = 'FALHOU',
        tentativa = v_trabalho.tentativa_atual,
        erro_codigo = v_erro_codigo,
        erro_mensagem = v_erro_mensagem,
        finalizado_em = now()
    where e.id = v_envio.id
    returning * into v_envio;

    update public.checklist_automacao_trabalhos t
    set status = 'AGUARDANDO_NOVA_TENTATIVA',
        disponivel_em = v_proximo_horario,
        erro_codigo = v_erro_codigo,
        erro_mensagem = v_erro_mensagem,
        erro_transitorio = true,
        reservado_em = null,
        reserva_expira_em = null,
        finalizado_em = null
    where t.id = v_trabalho.id
    returning * into v_trabalho;

    perform public.checklist_automacao_recalcular_execucao_interno(v_trabalho.execucao_id);

    return jsonb_build_object(
      'duplicado', false,
      'nova_tentativa', true,
      'proxima_tentativa', v_proxima_tentativa,
      'disponivel_em', v_proximo_horario,
      'trabalho', to_jsonb(v_trabalho),
      'envio', to_jsonb(v_envio)
    );
  end if;

  update public.checklist_envios e
  set status = v_status,
      tentativa = v_trabalho.tentativa_atual,
      email_resend_id = case
        when v_status = 'ENVIADO' then v_email_resend_id
        else e.email_resend_id
      end,
      erro_codigo = case when v_status = 'FALHOU' then v_erro_codigo else null end,
      erro_mensagem = case when v_status = 'FALHOU' then v_erro_mensagem else null end,
      enviado_em = case when v_status = 'ENVIADO' then now() else e.enviado_em end,
      finalizado_em = now()
  where e.id = v_envio.id
  returning * into v_envio;

  update public.checklist_automacao_trabalhos t
  set status = v_status,
      email_resend_id = case
        when v_status = 'ENVIADO' then v_email_resend_id
        else t.email_resend_id
      end,
      erro_codigo = case when v_status = 'FALHOU' then v_erro_codigo else null end,
      erro_mensagem = case when v_status = 'FALHOU' then v_erro_mensagem else null end,
      erro_transitorio = case when v_status = 'FALHOU' then v_erro_transitorio else null end,
      reservado_em = null,
      reserva_expira_em = null,
      finalizado_em = now()
  where t.id = v_trabalho.id
  returning * into v_trabalho;

  perform public.checklist_automacao_recalcular_execucao_interno(v_trabalho.execucao_id);

  return jsonb_build_object(
    'duplicado', false,
    'nova_tentativa', false,
    'trabalho', to_jsonb(v_trabalho),
    'envio', to_jsonb(v_envio)
  );
end;
$$;

revoke all on function public.checklist_intervalos_tentativas_validos(integer[], smallint)
  from public, anon, authenticated;
revoke all on function public.checklist_automacao_inicializar_trabalho()
  from public, anon, authenticated;
revoke all on function public.checklist_automacao_recalcular_execucao_interno(uuid)
  from public, anon, authenticated;
revoke all on function public.reservar_checklist_automacao_trabalhos_interno(integer, integer)
  from public, anon, authenticated;
revoke all on function public.iniciar_checklist_automacao_envio_interno(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finalizar_checklist_automacao_trabalho_interno(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.reservar_checklist_automacao_trabalhos_interno(integer, integer)
  to service_role;
grant execute on function public.iniciar_checklist_automacao_envio_interno(uuid, uuid)
  to service_role;
grant execute on function public.finalizar_checklist_automacao_trabalho_interno(uuid, uuid, text, jsonb)
  to service_role;

commit;
