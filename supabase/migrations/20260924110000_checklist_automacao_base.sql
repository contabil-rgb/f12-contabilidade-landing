-- Portal de Gestao Contabil - Base segura da automacao de lembretes
-- Etapa 2: configuracoes, calendario, execucoes e auditoria.
-- Esta migracao nao cria cron, nao chama Edge Functions e nao envia e-mails.

begin;

create extension if not exists pgcrypto;

create table if not exists public.checklist_automacao_configuracao (
  id smallint primary key default 1,
  ativa boolean not null default false,
  modo text not null default 'TESTE',
  fuso_horario text not null default 'America/Manaus',
  dia_util_ordem smallint not null default 2,
  horario_local time without time zone not null default time '08:00',
  tentativas_max smallint not null default 3,
  intervalos_tentativas_minutos integer[] not null default array[0, 15, 45],
  email_teste_destinatario text not null default 'nattorocha04@gmail.com',
  email_teste_cc text not null default 'rocharenato2004@gmail.com',
  email_resumo_destinatario text not null default 'nattorocha04@gmail.com',
  email_resumo_cc text not null default 'rocharenato2004@gmail.com',
  notificar_alteracoes boolean not null default true,
  alterado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_automacao_configuracao_unica_check check (id = 1),
  constraint checklist_automacao_configuracao_modo_check check (modo in ('TESTE', 'REAL')),
  constraint checklist_automacao_configuracao_fuso_check check (fuso_horario = 'America/Manaus'),
  constraint checklist_automacao_configuracao_dia_util_check check (dia_util_ordem between 1 and 10),
  constraint checklist_automacao_configuracao_tentativas_check check (
    tentativas_max between 1 and 5
    and cardinality(intervalos_tentativas_minutos) = tentativas_max
    and intervalos_tentativas_minutos[1] = 0
  ),
  constraint checklist_automacao_configuracao_emails_check check (
    position('@' in email_teste_destinatario) > 1
    and position('@' in email_teste_cc) > 1
    and position('@' in email_resumo_destinatario) > 1
    and position('@' in email_resumo_cc) > 1
  )
);

insert into public.checklist_automacao_configuracao (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.checklist_automacao_clientes (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  habilitada boolean not null default false,
  competencia_inicial date,
  motivo_pausa text,
  alterado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_automacao_clientes_competencia_check check (
    competencia_inicial is null
    or competencia_inicial = date_trunc('month', competencia_inicial)::date
  ),
  constraint checklist_automacao_clientes_habilitacao_check check (
    habilitada = false or competencia_inicial is not null
  )
);

insert into public.checklist_automacao_clientes (cliente_id, habilitada)
select c.id, false
from public.clientes c
on conflict (cliente_id) do nothing;

create table if not exists public.checklist_automacao_feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  nome text not null,
  abrangencia text not null,
  uf text,
  municipio text,
  ativo boolean not null default true,
  fonte text not null,
  alterado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_automacao_feriados_nome_check check (nullif(btrim(nome), '') is not null),
  constraint checklist_automacao_feriados_abrangencia_check check (
    abrangencia in ('NACIONAL', 'ESTADUAL', 'MUNICIPAL')
  ),
  constraint checklist_automacao_feriados_localidade_check check (
    (abrangencia = 'NACIONAL' and uf is null and municipio is null)
    or (abrangencia = 'ESTADUAL' and uf = 'AM' and municipio is null)
    or (abrangencia = 'MUNICIPAL' and uf = 'AM' and municipio = 'Manaus')
  ),
  constraint checklist_automacao_feriados_fonte_check check (nullif(btrim(fonte), '') is not null),
  constraint checklist_automacao_feriados_unique unique (data, nome, abrangencia)
);

create table if not exists public.checklist_automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  competencia_referencia date not null,
  segundo_dia_util date not null,
  agendada_para timestamp with time zone not null,
  modo text not null,
  acionamento text not null default 'AGENDADO',
  status text not null default 'AGENDADA',
  chave_idempotencia text not null,
  total_clientes integer not null default 0,
  total_trabalhos integer not null default 0,
  total_enviados integer not null default 0,
  total_falhas integer not null default 0,
  total_ignorados integer not null default 0,
  total_sem_contato integer not null default 0,
  detalhes jsonb not null default '{}'::jsonb,
  erro_codigo text,
  erro_mensagem text,
  iniciado_por uuid references public.usuarios(id) on delete set null,
  iniciado_em timestamp with time zone,
  finalizado_em timestamp with time zone,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_automacao_execucoes_competencia_check check (
    competencia_referencia = date_trunc('month', competencia_referencia)::date
  ),
  constraint checklist_automacao_execucoes_modo_check check (modo in ('TESTE', 'REAL')),
  constraint checklist_automacao_execucoes_acionamento_check check (
    acionamento in ('AGENDADO', 'MANUAL', 'SIMULACAO')
  ),
  constraint checklist_automacao_execucoes_status_check check (
    status in (
      'AGENDADA',
      'PREPARANDO',
      'PROCESSANDO',
      'CONCLUIDA',
      'CONCLUIDA_COM_FALHAS',
      'FALHOU',
      'CANCELADA',
      'SIMULADA'
    )
  ),
  constraint checklist_automacao_execucoes_chave_unique unique (chave_idempotencia),
  constraint checklist_automacao_execucoes_totais_check check (
    total_clientes >= 0
    and total_trabalhos >= 0
    and total_enviados >= 0
    and total_falhas >= 0
    and total_ignorados >= 0
    and total_sem_contato >= 0
  ),
  constraint checklist_automacao_execucoes_detalhes_check check (jsonb_typeof(detalhes) = 'object'),
  constraint checklist_automacao_execucoes_datas_check check (
    (iniciado_em is null or finalizado_em is null or finalizado_em >= iniciado_em)
  )
);

create unique index if not exists idx_checklist_automacao_execucoes_agendada_mes_modo
  on public.checklist_automacao_execucoes (competencia_referencia, modo)
  where acionamento = 'AGENDADO';

create index if not exists idx_checklist_automacao_execucoes_status_agendada
  on public.checklist_automacao_execucoes (status, agendada_para);

create index if not exists idx_checklist_automacao_feriados_data_ativo
  on public.checklist_automacao_feriados (data, ativo);

create index if not exists idx_checklist_automacao_clientes_habilitada
  on public.checklist_automacao_clientes (habilitada, competencia_inicial);

create table if not exists public.checklist_automacao_auditoria (
  id uuid primary key default gen_random_uuid(),
  entidade text not null,
  entidade_id text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  operacao text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  alterado_por uuid references public.usuarios(id) on delete set null,
  alterado_por_nome text,
  alterado_por_email text,
  criado_em timestamp with time zone not null default now(),
  constraint checklist_automacao_auditoria_entidade_check check (
    entidade in ('CONFIGURACAO_GLOBAL', 'CONFIGURACAO_CLIENTE', 'FERIADO')
  ),
  constraint checklist_automacao_auditoria_operacao_check check (
    operacao in ('INSERT', 'UPDATE', 'DELETE')
  )
);

create index if not exists idx_checklist_automacao_auditoria_criado_em
  on public.checklist_automacao_auditoria (criado_em desc);

create index if not exists idx_checklist_automacao_auditoria_cliente
  on public.checklist_automacao_auditoria (cliente_id, criado_em desc)
  where cliente_id is not null;

create or replace function public.checklist_automacao_set_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_checklist_automacao_configuracao_atualizado_em
  on public.checklist_automacao_configuracao;
create trigger trg_checklist_automacao_configuracao_atualizado_em
before update on public.checklist_automacao_configuracao
for each row execute function public.checklist_automacao_set_atualizado_em();

drop trigger if exists trg_checklist_automacao_clientes_atualizado_em
  on public.checklist_automacao_clientes;
create trigger trg_checklist_automacao_clientes_atualizado_em
before update on public.checklist_automacao_clientes
for each row execute function public.checklist_automacao_set_atualizado_em();

drop trigger if exists trg_checklist_automacao_feriados_atualizado_em
  on public.checklist_automacao_feriados;
create trigger trg_checklist_automacao_feriados_atualizado_em
before update on public.checklist_automacao_feriados
for each row execute function public.checklist_automacao_set_atualizado_em();

drop trigger if exists trg_checklist_automacao_execucoes_atualizado_em
  on public.checklist_automacao_execucoes;
create trigger trg_checklist_automacao_execucoes_atualizado_em
before update on public.checklist_automacao_execucoes
for each row execute function public.checklist_automacao_set_atualizado_em();

create or replace function public.checklist_automacao_criar_config_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.checklist_automacao_clientes (cliente_id, habilitada)
  values (new.id, false)
  on conflict (cliente_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_clientes_criar_config_automacao on public.clientes;
create trigger trg_clientes_criar_config_automacao
after insert on public.clientes
for each row execute function public.checklist_automacao_criar_config_cliente();

create or replace function public.checklist_data_pascoa(p_ano integer)
returns date
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  a integer;
  b integer;
  c integer;
  d integer;
  e integer;
  f integer;
  g integer;
  h integer;
  i integer;
  k integer;
  l integer;
  m integer;
  v_mes integer;
  v_dia integer;
begin
  if p_ano < 2000 or p_ano > 2100 then
    raise exception 'Ano fora do intervalo aceito para o calendario: %.', p_ano;
  end if;

  a := p_ano % 19;
  b := p_ano / 100;
  c := p_ano % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  v_mes := (h + l - 7 * m + 114) / 31;
  v_dia := ((h + l - 7 * m + 114) % 31) + 1;

  return make_date(p_ano, v_mes, v_dia);
end;
$$;

create or replace function public.popular_checklist_feriados_manaus(p_ano integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pascoa date;
  v_inseridos integer;
begin
  if p_ano < 2000 or p_ano > 2100 then
    raise exception 'Ano fora do intervalo aceito para o calendario: %.', p_ano;
  end if;

  v_pascoa := public.checklist_data_pascoa(p_ano);

  insert into public.checklist_automacao_feriados (
    data,
    nome,
    abrangencia,
    uf,
    municipio,
    fonte
  )
  values
    (make_date(p_ano, 1, 1), 'Confraternizacao Universal', 'NACIONAL', null, null, 'Lei Federal 662/1949 e Lei Federal 10.607/2002'),
    (make_date(p_ano, 4, 21), 'Tiradentes', 'NACIONAL', null, null, 'Lei Federal 662/1949 e Lei Federal 10.607/2002'),
    (make_date(p_ano, 5, 1), 'Dia Mundial do Trabalho', 'NACIONAL', null, null, 'Lei Federal 662/1949 e Lei Federal 10.607/2002'),
    (make_date(p_ano, 9, 7), 'Independencia do Brasil', 'NACIONAL', null, null, 'Lei Federal 662/1949 e Lei Federal 10.607/2002'),
    (make_date(p_ano, 10, 12), 'Nossa Senhora Aparecida', 'NACIONAL', null, null, 'Lei Federal 6.802/1980'),
    (make_date(p_ano, 11, 2), 'Finados', 'NACIONAL', null, null, 'Lei Federal 662/1949 e Lei Federal 10.607/2002'),
    (make_date(p_ano, 11, 15), 'Proclamacao da Republica', 'NACIONAL', null, null, 'Lei Federal 662/1949 e Lei Federal 10.607/2002'),
    (make_date(p_ano, 11, 20), 'Dia Nacional de Zumbi e da Consciencia Negra', 'NACIONAL', null, null, 'Lei Federal 14.759/2023'),
    (make_date(p_ano, 12, 25), 'Natal', 'NACIONAL', null, null, 'Lei Federal 662/1949 e Lei Federal 10.607/2002'),
    (make_date(p_ano, 9, 5), 'Elevacao do Amazonas a categoria de Provincia', 'ESTADUAL', 'AM', null, 'Lei Estadual Promulgada 25/1977'),
    (v_pascoa - 47, 'Terca-feira de Carnaval', 'MUNICIPAL', 'AM', 'Manaus', 'Lei Municipal 448/1998'),
    (v_pascoa - 2, 'Paixao de Cristo', 'MUNICIPAL', 'AM', 'Manaus', 'Lei Municipal 1.001/2006'),
    (v_pascoa + 60, 'Corpus Christi', 'MUNICIPAL', 'AM', 'Manaus', 'Lei Municipal 970/2006'),
    (make_date(p_ano, 10, 24), 'Elevacao de Manaus a categoria de Cidade', 'MUNICIPAL', 'AM', 'Manaus', 'Lei Organica do Municipio de Manaus, art. 437, II'),
    (make_date(p_ano, 12, 8), 'Nossa Senhora da Conceicao', 'MUNICIPAL', 'AM', 'Manaus', 'Lei Municipal 496/1999')
  on conflict (data, nome, abrangencia) do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

select public.popular_checklist_feriados_manaus(ano)
from generate_series(2026, 2030) as anos(ano);

create or replace function public.checklist_eh_dia_util_manaus(p_data date)
returns boolean
language sql
stable
strict
security definer
set search_path = public
as $$
  select
    extract(isodow from p_data) between 1 and 5
    and not exists (
      select 1
      from public.checklist_automacao_feriados f
      where f.data = p_data
        and f.ativo = true
        and (
          f.abrangencia = 'NACIONAL'
          or (f.abrangencia = 'ESTADUAL' and f.uf = 'AM')
          or (f.abrangencia = 'MUNICIPAL' and f.uf = 'AM' and f.municipio = 'Manaus')
        )
    );
$$;

create or replace function public.checklist_segundo_dia_util_manaus(p_ano integer, p_mes integer)
returns date
language plpgsql
stable
strict
security definer
set search_path = public
as $$
declare
  v_resultado date;
begin
  if p_ano < 2000 or p_ano > 2100 or p_mes < 1 or p_mes > 12 then
    raise exception 'Competencia invalida para calcular o segundo dia util.';
  end if;

  if (
    select count(*)
    from public.checklist_automacao_feriados f
    where extract(year from f.data)::integer = p_ano
  ) < 15 then
    raise exception 'Calendario de feriados de Manaus ainda nao foi preparado para o ano %.', p_ano;
  end if;

  select dia::date
  into v_resultado
  from generate_series(
    make_date(p_ano, p_mes, 1),
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) serie(dia)
  where public.checklist_eh_dia_util_manaus(dia::date)
  order by dia
  offset 1
  limit 1;

  if v_resultado is null then
    raise exception 'Nao foi possivel calcular o segundo dia util de %/%', p_mes, p_ano;
  end if;

  return v_resultado;
end;
$$;

create or replace function public.checklist_automacao_auditar_configuracao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_usuario_id uuid;
begin
  v_usuario_id := case when tg_op = 'DELETE' then old.alterado_por else new.alterado_por end;
  if v_usuario_id is null and auth.uid() is not null then
    select u.id into v_usuario_id
    from public.usuarios u
    where u.auth_user_id = auth.uid();
  end if;
  select * into v_usuario from public.usuarios u where u.id = v_usuario_id;

  insert into public.checklist_automacao_auditoria (
    entidade,
    entidade_id,
    operacao,
    valor_anterior,
    valor_novo,
    alterado_por,
    alterado_por_nome,
    alterado_por_email
  )
  values (
    'CONFIGURACAO_GLOBAL',
    '1',
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    v_usuario_id,
    v_usuario.nome,
    v_usuario.email
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.checklist_automacao_auditar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_usuario_id uuid;
  v_cliente_id uuid;
begin
  v_usuario_id := case when tg_op = 'DELETE' then old.alterado_por else new.alterado_por end;
  v_cliente_id := case when tg_op = 'DELETE' then old.cliente_id else new.cliente_id end;
  if v_usuario_id is null and auth.uid() is not null then
    select u.id into v_usuario_id
    from public.usuarios u
    where u.auth_user_id = auth.uid();
  end if;
  select * into v_usuario from public.usuarios u where u.id = v_usuario_id;

  insert into public.checklist_automacao_auditoria (
    entidade,
    entidade_id,
    cliente_id,
    operacao,
    valor_anterior,
    valor_novo,
    alterado_por,
    alterado_por_nome,
    alterado_por_email
  )
  values (
    'CONFIGURACAO_CLIENTE',
    v_cliente_id::text,
    v_cliente_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    v_usuario_id,
    v_usuario.nome,
    v_usuario.email
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.checklist_automacao_auditar_feriado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_usuario_id uuid;
  v_feriado_id uuid;
begin
  v_usuario_id := case when tg_op = 'DELETE' then old.alterado_por else new.alterado_por end;
  v_feriado_id := case when tg_op = 'DELETE' then old.id else new.id end;
  if v_usuario_id is null and auth.uid() is not null then
    select u.id into v_usuario_id
    from public.usuarios u
    where u.auth_user_id = auth.uid();
  end if;
  select * into v_usuario from public.usuarios u where u.id = v_usuario_id;

  insert into public.checklist_automacao_auditoria (
    entidade,
    entidade_id,
    operacao,
    valor_anterior,
    valor_novo,
    alterado_por,
    alterado_por_nome,
    alterado_por_email
  )
  values (
    'FERIADO',
    v_feriado_id::text,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    v_usuario_id,
    v_usuario.nome,
    v_usuario.email
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checklist_automacao_configuracao_auditoria
  on public.checklist_automacao_configuracao;
create trigger trg_checklist_automacao_configuracao_auditoria
after insert or update or delete on public.checklist_automacao_configuracao
for each row execute function public.checklist_automacao_auditar_configuracao();

drop trigger if exists trg_checklist_automacao_clientes_auditoria
  on public.checklist_automacao_clientes;
create trigger trg_checklist_automacao_clientes_auditoria
after insert or update or delete on public.checklist_automacao_clientes
for each row execute function public.checklist_automacao_auditar_cliente();

drop trigger if exists trg_checklist_automacao_feriados_auditoria
  on public.checklist_automacao_feriados;
create trigger trg_checklist_automacao_feriados_auditoria
after insert or update or delete on public.checklist_automacao_feriados
for each row execute function public.checklist_automacao_auditar_feriado();

alter table public.checklist_automacao_configuracao enable row level security;
alter table public.checklist_automacao_clientes enable row level security;
alter table public.checklist_automacao_feriados enable row level security;
alter table public.checklist_automacao_execucoes enable row level security;
alter table public.checklist_automacao_auditoria enable row level security;

revoke all on table public.checklist_automacao_configuracao from anon, authenticated;
revoke all on table public.checklist_automacao_clientes from anon, authenticated;
revoke all on table public.checklist_automacao_feriados from anon, authenticated;
revoke all on table public.checklist_automacao_execucoes from anon, authenticated;
revoke all on table public.checklist_automacao_auditoria from anon, authenticated;

grant select on table public.checklist_automacao_configuracao to authenticated;
grant select on table public.checklist_automacao_clientes to authenticated;
grant select on table public.checklist_automacao_feriados to authenticated;
grant select on table public.checklist_automacao_execucoes to authenticated;
grant select on table public.checklist_automacao_auditoria to authenticated;

drop policy if exists checklist_automacao_configuracao_select_usuario_ativo
  on public.checklist_automacao_configuracao;
create policy checklist_automacao_configuracao_select_usuario_ativo
on public.checklist_automacao_configuracao
for select to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_automacao_clientes_select_usuario_ativo
  on public.checklist_automacao_clientes;
create policy checklist_automacao_clientes_select_usuario_ativo
on public.checklist_automacao_clientes
for select to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_automacao_feriados_select_usuario_ativo
  on public.checklist_automacao_feriados;
create policy checklist_automacao_feriados_select_usuario_ativo
on public.checklist_automacao_feriados
for select to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_automacao_execucoes_select_usuario_ativo
  on public.checklist_automacao_execucoes;
create policy checklist_automacao_execucoes_select_usuario_ativo
on public.checklist_automacao_execucoes
for select to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_automacao_auditoria_select_usuario_ativo
  on public.checklist_automacao_auditoria;
create policy checklist_automacao_auditoria_select_usuario_ativo
on public.checklist_automacao_auditoria
for select to authenticated
using (public.is_portal_usuario_ativo());

revoke all on function public.checklist_automacao_set_atualizado_em() from public;
revoke all on function public.checklist_automacao_criar_config_cliente() from public;
revoke all on function public.popular_checklist_feriados_manaus(integer) from public;
revoke all on function public.checklist_automacao_auditar_configuracao() from public;
revoke all on function public.checklist_automacao_auditar_cliente() from public;
revoke all on function public.checklist_automacao_auditar_feriado() from public;

revoke all on function public.checklist_data_pascoa(integer) from public;
revoke all on function public.checklist_eh_dia_util_manaus(date) from public;
revoke all on function public.checklist_segundo_dia_util_manaus(integer, integer) from public;

grant execute on function public.checklist_data_pascoa(integer) to authenticated;
grant execute on function public.checklist_eh_dia_util_manaus(date) to authenticated;
grant execute on function public.checklist_segundo_dia_util_manaus(integer, integer) to authenticated;

commit;
