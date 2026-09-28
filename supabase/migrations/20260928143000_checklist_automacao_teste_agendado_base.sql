-- Portal de Gestao Contabil - Agendamento unico de testes da automacao
-- Etapa 8, parte 1: estrutura, previa, cadastro, consulta, cancelamento e auditoria.
-- Esta migracao nao cria cron, nao chama Edge Functions e nao envia e-mails.

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
      'EXECUCAO_TESTE',
      'AGENDAMENTO_TESTE'
    )
  ),
  add constraint checklist_automacao_auditoria_operacao_check check (
    operacao in ('INSERT', 'UPDATE', 'DELETE', 'EXECUTAR', 'AGENDAR', 'CANCELAR')
  );

create table if not exists public.checklist_automacao_agendamentos_teste (
  id uuid primary key default gen_random_uuid(),
  modo text not null default 'TESTE',
  status text not null default 'AGENDADO',
  escopo text not null,
  competencia_referencia date not null,
  agendado_para timestamp with time zone not null,
  fuso_horario text not null default 'America/Manaus',
  cliente_ids uuid[],
  chave_idempotencia text not null,
  destinatario_teste text not null,
  cc_teste text not null,
  execucao_id uuid references public.checklist_automacao_execucoes(id) on delete set null,
  resumo jsonb not null default '{}'::jsonb,
  erro_codigo text,
  erro_mensagem text,
  criado_por uuid not null references public.usuarios(id) on delete restrict,
  cancelado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  iniciado_em timestamp with time zone,
  finalizado_em timestamp with time zone,
  cancelado_em timestamp with time zone,
  constraint checklist_automacao_agendamentos_teste_modo_check
    check (modo = 'TESTE'),
  constraint checklist_automacao_agendamentos_teste_status_check
    check (status in ('AGENDADO', 'PROCESSANDO', 'CONCLUIDO', 'CANCELADO', 'FALHA')),
  constraint checklist_automacao_agendamentos_teste_escopo_check
    check (escopo in ('CLIENTES_SELECIONADOS', 'TODOS_ELEGIVEIS')),
  constraint checklist_automacao_agendamentos_teste_competencia_check
    check (competencia_referencia = date_trunc('month', competencia_referencia)::date),
  constraint checklist_automacao_agendamentos_teste_fuso_check
    check (fuso_horario = 'America/Manaus'),
  constraint checklist_automacao_agendamentos_teste_clientes_check check (
    (escopo = 'TODOS_ELEGIVEIS' and cliente_ids is null)
    or (
      escopo = 'CLIENTES_SELECIONADOS'
      and cardinality(cliente_ids) between 1 and 500
      and array_position(cliente_ids, null) is null
    )
  ),
  constraint checklist_automacao_agendamentos_teste_chave_check
    check (char_length(btrim(chave_idempotencia)) between 8 and 200),
  constraint checklist_automacao_agendamentos_teste_resumo_check
    check (jsonb_typeof(resumo) = 'object'),
  constraint checklist_automacao_agendamentos_teste_datas_check check (
    (iniciado_em is null or iniciado_em >= criado_em)
    and (finalizado_em is null or iniciado_em is null or finalizado_em >= iniciado_em)
    and (cancelado_em is null or cancelado_em >= criado_em)
    and (status <> 'CANCELADO' or cancelado_em is not null)
  ),
  constraint checklist_automacao_agendamentos_teste_chave_unique
    unique (chave_idempotencia)
);

create index if not exists idx_checklist_automacao_agendamentos_teste_status_data
  on public.checklist_automacao_agendamentos_teste (status, agendado_para);

create index if not exists idx_checklist_automacao_agendamentos_teste_criado_em
  on public.checklist_automacao_agendamentos_teste (criado_em desc);

create unique index if not exists idx_checklist_automacao_agendamentos_teste_ativo_unique
  on public.checklist_automacao_agendamentos_teste (
    agendado_para,
    competencia_referencia,
    escopo,
    (coalesce(cliente_ids, '{}'::uuid[]))
  )
  where status in ('AGENDADO', 'PROCESSANDO');

drop trigger if exists trg_checklist_automacao_agendamentos_teste_atualizado_em
  on public.checklist_automacao_agendamentos_teste;
create trigger trg_checklist_automacao_agendamentos_teste_atualizado_em
before update on public.checklist_automacao_agendamentos_teste
for each row execute function public.checklist_automacao_set_atualizado_em();

create or replace function public.validar_checklist_automacao_agendamento_clientes_interno(
  p_escopo text,
  p_cliente_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_escopo text;
  v_cliente_ids uuid[];
  v_quantidade_validos integer;
begin
  v_escopo := upper(nullif(btrim(coalesce(p_escopo, '')), ''));
  if v_escopo not in ('CLIENTES_SELECIONADOS', 'TODOS_ELEGIVEIS') then
    raise exception 'Escopo do agendamento invalido.';
  end if;

  if v_escopo = 'TODOS_ELEGIVEIS' then
    if p_cliente_ids is not null and cardinality(p_cliente_ids) > 0 then
      raise exception 'O escopo de todos os elegiveis nao aceita uma lista de clientes.';
    end if;
    return null;
  end if;

  if p_cliente_ids is null
     or cardinality(p_cliente_ids) = 0
     or cardinality(p_cliente_ids) > 500
     or array_position(p_cliente_ids, null) is not null then
    raise exception 'Selecione entre 1 e 500 clientes para o agendamento.';
  end if;

  select array_agg(x.id order by x.id)
  into v_cliente_ids
  from (select distinct id from unnest(p_cliente_ids) as u(id)) x;

  if cardinality(v_cliente_ids) <> cardinality(p_cliente_ids) then
    raise exception 'A selecao contem clientes repetidos.';
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
    raise exception 'O agendamento aceita somente clientes ativos, habilitados e com competencia inicial.';
  end if;

  return v_cliente_ids;
end;
$$;

create or replace function public.simular_checklist_automacao_agendamento_teste_portal(
  p_competencia_referencia date,
  p_escopo text,
  p_cliente_ids uuid[] default null
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
  v_escopo text;
  v_cliente_ids uuid[];
  v_resumo jsonb;
  v_trabalhos jsonb;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null
     or v_usuario.perfil_acesso not in ('coordenador_administrador', 'setor_contabil_operacional') then
    raise exception 'Usuario sem permissao para simular o agendamento de teste.';
  end if;

  v_competencia := date_trunc('month', p_competencia_referencia)::date;
  if p_competencia_referencia is null or p_competencia_referencia <> v_competencia then
    raise exception 'A competencia de referencia deve ser o primeiro dia do mes.';
  end if;
  if v_competencia > date_trunc('month', now() at time zone 'America/Manaus')::date then
    raise exception 'A competencia de referencia nao pode estar no futuro.';
  end if;

  select * into v_config from public.checklist_automacao_configuracao where id = 1;
  if v_config.id is null or v_config.modo <> 'TESTE' then
    raise exception 'O agendamento exige que a automacao esteja no modo TESTE.';
  end if;

  v_escopo := upper(nullif(btrim(coalesce(p_escopo, '')), ''));
  v_cliente_ids := public.validar_checklist_automacao_agendamento_clientes_interno(
    v_escopo,
    p_cliente_ids
  );

  with candidatos as (
    select c.*
    from public.listar_checklist_automacao_candidatos_interno(v_competencia, 'TESTE') c
    where v_escopo = 'TODOS_ELEGIVEIS' or c.cliente_id = any(v_cliente_ids)
  )
  select
    jsonb_build_object(
      'total_avaliados', count(*),
      'preparados', count(*) filter (where resultado = 'PREPARADO'),
      'desabilitados', count(*) filter (where resultado = 'DESABILITADO'),
      'configuracao_incompleta', count(*) filter (where resultado = 'CONFIGURACAO_INCOMPLETA'),
      'sem_pendencias', count(*) filter (where resultado = 'SEM_PENDENCIAS'),
      'sem_contato', count(*) filter (where resultado = 'SEM_CONTATO'),
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
    'escopo', v_escopo,
    'cliente_ids', to_jsonb(v_cliente_ids),
    'destinatario_teste', v_config.email_teste_destinatario,
    'cc_teste', v_config.email_teste_cc,
    'resumo', v_resumo,
    'trabalhos', v_trabalhos
  );
end;
$$;

create or replace function public.criar_checklist_automacao_agendamento_teste_portal(
  p_competencia_referencia date,
  p_data_hora_local timestamp without time zone,
  p_escopo text,
  p_cliente_ids uuid[] default null,
  p_chave_requisicao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_config public.checklist_automacao_configuracao;
  v_competencia date;
  v_escopo text;
  v_cliente_ids uuid[];
  v_agendado_para timestamp with time zone;
  v_chave text;
  v_agendamento public.checklist_automacao_agendamentos_teste;
  v_existente public.checklist_automacao_agendamentos_teste;
  v_duplicado boolean := false;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null
     or v_usuario.perfil_acesso not in ('coordenador_administrador', 'setor_contabil_operacional') then
    raise exception 'Usuario sem permissao para criar o agendamento de teste.';
  end if;

  select * into v_config from public.checklist_automacao_configuracao where id = 1 for share;
  if v_config.id is null or v_config.modo <> 'TESTE' then
    raise exception 'O agendamento exige que a automacao esteja no modo TESTE.';
  end if;
  if v_config.ativa then
    raise exception 'Pause a automacao global antes de criar um agendamento de teste.';
  end if;
  if nullif(btrim(coalesce(v_config.email_teste_destinatario, '')), '') is null
     or nullif(btrim(coalesce(v_config.email_teste_cc, '')), '') is null then
    raise exception 'Configure os dois destinatarios de teste antes de agendar.';
  end if;

  v_competencia := date_trunc('month', p_competencia_referencia)::date;
  if p_competencia_referencia is null or p_competencia_referencia <> v_competencia then
    raise exception 'A competencia de referencia deve ser o primeiro dia do mes.';
  end if;
  if v_competencia > date_trunc('month', now() at time zone 'America/Manaus')::date then
    raise exception 'A competencia de referencia nao pode estar no futuro.';
  end if;

  if p_data_hora_local is null then
    raise exception 'Informe a data e o horario de Manaus para o agendamento.';
  end if;
  v_agendado_para := p_data_hora_local at time zone 'America/Manaus';
  if v_agendado_para <= now() then
    raise exception 'O horario do agendamento deve estar no futuro.';
  end if;

  v_escopo := upper(nullif(btrim(coalesce(p_escopo, '')), ''));
  v_cliente_ids := public.validar_checklist_automacao_agendamento_clientes_interno(
    v_escopo,
    p_cliente_ids
  );

  v_chave := nullif(btrim(coalesce(p_chave_requisicao, '')), '');
  if v_chave is null or char_length(v_chave) not between 8 and 200 then
    raise exception 'Informe uma chave de requisicao valida para o agendamento.';
  end if;

  select * into v_existente
  from public.checklist_automacao_agendamentos_teste a
  where a.chave_idempotencia = v_chave;

  if v_existente.id is not null then
    if v_existente.competencia_referencia <> v_competencia
       or v_existente.agendado_para <> v_agendado_para
       or v_existente.escopo <> v_escopo
       or v_existente.cliente_ids is distinct from v_cliente_ids then
      raise exception 'A chave de requisicao ja foi usada em outro agendamento.';
    end if;
    v_agendamento := v_existente;
    v_duplicado := true;
  else
    insert into public.checklist_automacao_agendamentos_teste (
      escopo,
      competencia_referencia,
      agendado_para,
      cliente_ids,
      chave_idempotencia,
      destinatario_teste,
      cc_teste,
      criado_por,
      resumo
    ) values (
      v_escopo,
      v_competencia,
      v_agendado_para,
      v_cliente_ids,
      v_chave,
      lower(btrim(v_config.email_teste_destinatario)),
      lower(btrim(v_config.email_teste_cc)),
      v_usuario.id,
      jsonb_build_object('fase', 'AGENDAMENTO_CRIADO')
    )
    on conflict do nothing
    returning * into v_agendamento;

    if v_agendamento.id is null then
      select * into v_agendamento
      from public.checklist_automacao_agendamentos_teste a
      where a.status in ('AGENDADO', 'PROCESSANDO')
        and a.agendado_para = v_agendado_para
        and a.competencia_referencia = v_competencia
        and a.escopo = v_escopo
        and a.cliente_ids is not distinct from v_cliente_ids
      order by a.criado_em
      limit 1;
      if v_agendamento.id is null then
        raise exception 'Conflito ao recuperar o agendamento idempotente.';
      end if;
      v_duplicado := true;
    else
      insert into public.checklist_automacao_auditoria (
        entidade,
        entidade_id,
        operacao,
        valor_novo,
        alterado_por,
        alterado_por_nome,
        alterado_por_email
      ) values (
        'AGENDAMENTO_TESTE',
        v_agendamento.id::text,
        'AGENDAR',
        to_jsonb(v_agendamento),
        v_usuario.id,
        v_usuario.nome,
        v_usuario.email
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'persistido', true,
    'duplicado', v_duplicado,
    'automacao_global_pausada', not v_config.ativa,
    'agendamento', to_jsonb(v_agendamento),
    'data_hora_manaus', to_char(v_agendamento.agendado_para at time zone 'America/Manaus', 'YYYY-MM-DD HH24:MI:SS')
  );
end;
$$;

create or replace function public.listar_checklist_automacao_agendamentos_teste_portal(
  p_limite integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_limite integer;
  v_resultado jsonb;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null
     or v_usuario.perfil_acesso not in ('coordenador_administrador', 'setor_contabil_operacional') then
    raise exception 'Usuario sem permissao para consultar os agendamentos de teste.';
  end if;
  v_limite := least(greatest(coalesce(p_limite, 50), 1), 100);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      a.*,
      a.agendado_para at time zone 'America/Manaus' as data_hora_manaus,
      u.nome as criado_por_nome,
      u.email as criado_por_email
    from public.checklist_automacao_agendamentos_teste a
    join public.usuarios u on u.id = a.criado_por
    order by a.criado_em desc
    limit v_limite
  ) x;

  return v_resultado;
end;
$$;

create or replace function public.obter_checklist_automacao_agendamento_teste_portal(
  p_agendamento_id uuid
)
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
  if v_usuario.id is null
     or v_usuario.perfil_acesso not in ('coordenador_administrador', 'setor_contabil_operacional') then
    raise exception 'Usuario sem permissao para consultar o agendamento de teste.';
  end if;
  if p_agendamento_id is null then
    raise exception 'Agendamento de teste obrigatorio.';
  end if;

  select to_jsonb(x) into v_resultado
  from (
    select
      a.*,
      a.agendado_para at time zone 'America/Manaus' as data_hora_manaus,
      u.nome as criado_por_nome,
      u.email as criado_por_email
    from public.checklist_automacao_agendamentos_teste a
    join public.usuarios u on u.id = a.criado_por
    where a.id = p_agendamento_id
  ) x;

  if v_resultado is null then
    raise exception 'Agendamento de teste nao encontrado.';
  end if;
  return v_resultado;
end;
$$;

create or replace function public.cancelar_checklist_automacao_agendamento_teste_portal(
  p_agendamento_id uuid,
  p_confirmacao text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_anterior public.checklist_automacao_agendamentos_teste;
  v_resultado public.checklist_automacao_agendamentos_teste;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null
     or v_usuario.perfil_acesso not in ('coordenador_administrador', 'setor_contabil_operacional') then
    raise exception 'Usuario sem permissao para cancelar o agendamento de teste.';
  end if;
  if upper(btrim(coalesce(p_confirmacao, ''))) <> 'CANCELAR AGENDAMENTO' then
    raise exception 'Confirme explicitamente o cancelamento do agendamento.';
  end if;

  select * into v_anterior
  from public.checklist_automacao_agendamentos_teste a
  where a.id = p_agendamento_id
  for update;

  if v_anterior.id is null then
    raise exception 'Agendamento de teste nao encontrado.';
  end if;
  if v_anterior.status <> 'AGENDADO' then
    raise exception 'Somente um agendamento ainda nao iniciado pode ser cancelado.';
  end if;

  update public.checklist_automacao_agendamentos_teste
  set status = 'CANCELADO',
      cancelado_por = v_usuario.id,
      cancelado_em = now(),
      finalizado_em = now(),
      resumo = resumo || jsonb_build_object('fase', 'AGENDAMENTO_CANCELADO')
  where id = v_anterior.id
  returning * into v_resultado;

  insert into public.checklist_automacao_auditoria (
    entidade,
    entidade_id,
    operacao,
    valor_anterior,
    valor_novo,
    alterado_por,
    alterado_por_nome,
    alterado_por_email
  ) values (
    'AGENDAMENTO_TESTE',
    v_resultado.id::text,
    'CANCELAR',
    to_jsonb(v_anterior),
    to_jsonb(v_resultado),
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email
  );

  return jsonb_build_object('ok', true, 'agendamento', to_jsonb(v_resultado));
end;
$$;

alter table public.checklist_automacao_agendamentos_teste enable row level security;

revoke all on table public.checklist_automacao_agendamentos_teste from anon, authenticated;
grant select on table public.checklist_automacao_agendamentos_teste to authenticated;

drop policy if exists checklist_automacao_agendamentos_teste_select_portal
  on public.checklist_automacao_agendamentos_teste;
create policy checklist_automacao_agendamentos_teste_select_portal
on public.checklist_automacao_agendamentos_teste
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in ('coordenador_administrador', 'setor_contabil_operacional')
  )
);

revoke all on function public.validar_checklist_automacao_agendamento_clientes_interno(text, uuid[])
  from public, anon, authenticated;
grant execute on function public.validar_checklist_automacao_agendamento_clientes_interno(text, uuid[])
  to service_role;

revoke all on function public.simular_checklist_automacao_agendamento_teste_portal(date, text, uuid[])
  from public, anon;
grant execute on function public.simular_checklist_automacao_agendamento_teste_portal(date, text, uuid[])
  to authenticated;

revoke all on function public.criar_checklist_automacao_agendamento_teste_portal(
  date, timestamp without time zone, text, uuid[], text
) from public, anon;
grant execute on function public.criar_checklist_automacao_agendamento_teste_portal(
  date, timestamp without time zone, text, uuid[], text
) to authenticated;

revoke all on function public.listar_checklist_automacao_agendamentos_teste_portal(integer)
  from public, anon;
grant execute on function public.listar_checklist_automacao_agendamentos_teste_portal(integer)
  to authenticated;

revoke all on function public.obter_checklist_automacao_agendamento_teste_portal(uuid)
  from public, anon;
grant execute on function public.obter_checklist_automacao_agendamento_teste_portal(uuid)
  to authenticated;

revoke all on function public.cancelar_checklist_automacao_agendamento_teste_portal(uuid, text)
  from public, anon;
grant execute on function public.cancelar_checklist_automacao_agendamento_teste_portal(uuid, text)
  to authenticated;

comment on table public.checklist_automacao_agendamentos_teste is
  'Agendamentos unicos e isolados para homologacao da automacao em modo TESTE.';
comment on function public.criar_checklist_automacao_agendamento_teste_portal(
  date, timestamp without time zone, text, uuid[], text
) is 'Agenda sem executar um teste unico no fuso America/Manaus.';
comment on function public.cancelar_checklist_automacao_agendamento_teste_portal(uuid, text) is
  'Cancela somente um teste agendado que ainda nao iniciou.';

commit;
