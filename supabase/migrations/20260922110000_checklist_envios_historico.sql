-- Portal de Gestao Contabil - Historico auditavel dos lembretes do checklist
-- Etapa preparatoria para a pagina de historico e para os envios automaticos.
-- Esta migracao e aditiva, preserva os registros existentes e pode ser repetida.

create extension if not exists pgcrypto;

alter table public.checklist_envios
  add column if not exists cliente_nome text,
  add column if not exists cliente_cnpj text,
  add column if not exists itens_cobrados jsonb not null default '[]'::jsonb,
  add column if not exists origem text not null default 'MANUAL',
  add column if not exists status text not null default 'ENVIADO',
  add column if not exists tentativa integer not null default 1,
  add column if not exists chave_idempotencia text not null default gen_random_uuid()::text,
  add column if not exists execucao_id uuid,
  add column if not exists erro_codigo text,
  add column if not exists erro_mensagem text,
  add column if not exists iniciado_em timestamp with time zone not null default now(),
  add column if not exists finalizado_em timestamp with time zone,
  add column if not exists atualizado_em timestamp with time zone not null default now();

update public.checklist_envios e
set cliente_nome = coalesce(
      nullif(btrim(c.nome_identificacao), ''),
      nullif(btrim(c.razao_social), ''),
      'Cliente sem identificacao'
    ),
    cliente_cnpj = nullif(btrim(c.cnpj), '')
from public.clientes c
where c.id = e.cliente_id
  and (e.cliente_nome is null or nullif(btrim(e.cliente_nome), '') is null);

update public.checklist_envios
set cliente_nome = 'Cliente removido'
where cliente_nome is null or nullif(btrim(cliente_nome), '') is null;

update public.checklist_envios
set origem = 'MANUAL',
    status = 'ENVIADO',
    tentativa = greatest(coalesce(tentativa, 1), 1),
    iniciado_em = coalesce(enviado_em, criado_em, now()),
    finalizado_em = coalesce(finalizado_em, enviado_em, criado_em, now()),
    atualizado_em = coalesce(atualizado_em, enviado_em, criado_em, now())
where status = 'ENVIADO'
  and finalizado_em is null;

alter table public.checklist_envios
  alter column cliente_id drop not null,
  alter column cliente_nome set not null,
  alter column enviado_em drop not null;

alter table public.checklist_envios
  drop constraint if exists checklist_envios_cliente_id_fkey;

alter table public.checklist_envios
  add constraint checklist_envios_cliente_id_fkey
  foreign key (cliente_id) references public.clientes(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_envios'::regclass
      and conname = 'checklist_envios_itens_cobrados_array_check'
  ) then
    alter table public.checklist_envios
      add constraint checklist_envios_itens_cobrados_array_check
      check (jsonb_typeof(itens_cobrados) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_envios'::regclass
      and conname = 'checklist_envios_origem_check'
  ) then
    alter table public.checklist_envios
      add constraint checklist_envios_origem_check
      check (origem in ('MANUAL', 'AUTOMATICO'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_envios'::regclass
      and conname = 'checklist_envios_status_check'
  ) then
    alter table public.checklist_envios
      add constraint checklist_envios_status_check
      check (status in ('PROCESSANDO', 'ENVIADO', 'FALHOU', 'CANCELADO'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_envios'::regclass
      and conname = 'checklist_envios_tentativa_check'
  ) then
    alter table public.checklist_envios
      add constraint checklist_envios_tentativa_check
      check (tentativa >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_envios'::regclass
      and conname = 'checklist_envios_cliente_nome_not_blank'
  ) then
    alter table public.checklist_envios
      add constraint checklist_envios_cliente_nome_not_blank
      check (nullif(btrim(cliente_nome), '') is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_envios'::regclass
      and conname = 'checklist_envios_chave_idempotencia_unique'
  ) then
    alter table public.checklist_envios
      add constraint checklist_envios_chave_idempotencia_unique
      unique (chave_idempotencia);
  end if;
end;
$$;

create index if not exists idx_checklist_envios_evento_em
  on public.checklist_envios ((coalesce(enviado_em, finalizado_em, iniciado_em, criado_em)) desc);

create index if not exists idx_checklist_envios_cliente_evento_em
  on public.checklist_envios (cliente_id, (coalesce(enviado_em, finalizado_em, iniciado_em, criado_em)) desc);

create index if not exists idx_checklist_envios_status_origem
  on public.checklist_envios (status, origem);

create index if not exists idx_checklist_envios_responsavel_evento_em
  on public.checklist_envios (enviado_por, (coalesce(enviado_em, finalizado_em, iniciado_em, criado_em)) desc);

create index if not exists idx_checklist_envios_execucao
  on public.checklist_envios (execucao_id)
  where execucao_id is not null;

create unique index if not exists idx_checklist_envios_execucao_cliente_unique
  on public.checklist_envios (execucao_id, cliente_id)
  where origem = 'AUTOMATICO' and execucao_id is not null and cliente_id is not null;

drop trigger if exists trg_checklist_envios_set_atualizado_em on public.checklist_envios;
create trigger trg_checklist_envios_set_atualizado_em
before update on public.checklist_envios
for each row
execute function public.set_atualizado_em();

revoke insert, update, delete on table public.checklist_envios from authenticated;
grant select on table public.checklist_envios to authenticated;

drop policy if exists checklist_envios_insert_usuario_ativo on public.checklist_envios;
drop policy if exists checklist_envios_update_usuario_ativo on public.checklist_envios;
drop policy if exists checklist_envios_delete_usuario_ativo on public.checklist_envios;

create or replace function public.iniciar_checklist_envio_portal(p_envio jsonb)
returns public.checklist_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_cliente public.clientes;
  v_cliente_id uuid;
  v_competencias jsonb;
  v_itens_cobrados jsonb;
  v_destinatario text;
  v_cc text;
  v_assunto text;
  v_qtd_pendencias integer;
  v_chave_idempotencia text;
  v_row public.checklist_envios;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para iniciar envio do checklist.';
  end if;

  if p_envio is null or jsonb_typeof(p_envio) <> 'object' then
    raise exception 'Envio do checklist invalido.';
  end if;

  v_cliente_id := nullif(btrim(coalesce(p_envio->>'cliente_id', '')), '')::uuid;
  v_competencias := coalesce(p_envio->'competencias', '[]'::jsonb);
  v_itens_cobrados := coalesce(p_envio->'itens_cobrados', '[]'::jsonb);
  v_destinatario := nullif(btrim(coalesce(p_envio->>'destinatario', '')), '');
  v_cc := nullif(btrim(coalesce(p_envio->>'cc', '')), '');
  v_assunto := nullif(btrim(coalesce(p_envio->>'assunto', '')), '');
  v_qtd_pendencias := coalesce(nullif(btrim(coalesce(p_envio->>'qtd_pendencias', '')), '')::integer, 0);
  v_chave_idempotencia := coalesce(
    nullif(btrim(coalesce(p_envio->>'chave_idempotencia', '')), ''),
    gen_random_uuid()::text
  );

  if v_cliente_id is null then
    raise exception 'Cliente e obrigatorio para iniciar envio do checklist.';
  end if;

  select * into v_cliente from public.clientes c where c.id = v_cliente_id;
  if v_cliente.id is null then
    raise exception 'Cliente do envio do checklist nao encontrado.';
  end if;

  if jsonb_typeof(v_competencias) <> 'array' or jsonb_typeof(v_itens_cobrados) <> 'array' then
    raise exception 'Competencias e itens cobrados devem ser listas.';
  end if;

  if v_destinatario is null or position('@' in v_destinatario) = 0 then
    raise exception 'Destinatario do envio do checklist invalido.';
  end if;

  if v_assunto is null then
    raise exception 'Assunto do envio do checklist e obrigatorio.';
  end if;

  if v_qtd_pendencias < 0 then
    raise exception 'Quantidade de pendencias invalida.';
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
    enviado_por,
    enviado_por_nome,
    enviado_por_email,
    iniciado_em,
    enviado_em,
    finalizado_em
  )
  values (
    v_cliente.id,
    coalesce(nullif(btrim(v_cliente.nome_identificacao), ''), nullif(btrim(v_cliente.razao_social), ''), 'Cliente sem identificacao'),
    nullif(btrim(v_cliente.cnpj), ''),
    v_competencias,
    v_itens_cobrados,
    v_destinatario,
    v_cc,
    v_assunto,
    v_qtd_pendencias,
    'MANUAL',
    'PROCESSANDO',
    1,
    v_chave_idempotencia,
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email,
    now(),
    null,
    null
  )
  on conflict (chave_idempotencia) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from public.checklist_envios e
    where e.chave_idempotencia = v_chave_idempotencia
      and e.enviado_por = v_usuario.id;

    if v_row.id is null then
      raise exception 'Chave de idempotencia ja utilizada em outro envio.';
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.iniciar_checklist_envio_portal(jsonb) from public;
grant execute on function public.iniciar_checklist_envio_portal(jsonb) to authenticated;

create or replace function public.finalizar_checklist_envio_portal(
  p_envio_id uuid,
  p_status text,
  p_resultado jsonb default '{}'::jsonb
)
returns public.checklist_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_status text;
  v_email_resend_id text;
  v_erro_codigo text;
  v_erro_mensagem text;
  v_row public.checklist_envios;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para finalizar envio do checklist.';
  end if;

  if p_envio_id is null then
    raise exception 'Envio do checklist e obrigatorio.';
  end if;

  v_status := upper(nullif(btrim(coalesce(p_status, '')), ''));
  if v_status not in ('ENVIADO', 'FALHOU', 'CANCELADO') then
    raise exception 'Status final do envio do checklist invalido.';
  end if;

  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object' then
    raise exception 'Resultado do envio do checklist invalido.';
  end if;

  v_email_resend_id := nullif(btrim(coalesce(p_resultado->>'email_resend_id', '')), '');
  v_erro_codigo := nullif(btrim(coalesce(p_resultado->>'erro_codigo', '')), '');
  v_erro_mensagem := nullif(btrim(coalesce(p_resultado->>'erro_mensagem', '')), '');

  select * into v_row
  from public.checklist_envios e
  where e.id = p_envio_id
    and e.enviado_por = v_usuario.id
  for update;

  if v_row.id is null then
    raise exception 'Envio do checklist nao encontrado para o usuario atual.';
  end if;

  if v_row.status <> 'PROCESSANDO' then
    if v_row.status = v_status then
      return v_row;
    end if;
    raise exception 'Envio do checklist ja foi finalizado com status %.', v_row.status;
  end if;

  if v_status = 'ENVIADO' and v_email_resend_id is null then
    raise exception 'Identificador do Resend e obrigatorio para concluir o envio.';
  end if;

  if v_status = 'FALHOU' and v_erro_mensagem is null then
    raise exception 'Mensagem de erro e obrigatoria para registrar falha.';
  end if;

  update public.checklist_envios
  set status = v_status,
      email_resend_id = case when v_status = 'ENVIADO' then v_email_resend_id else email_resend_id end,
      erro_codigo = case when v_status = 'FALHOU' then v_erro_codigo else null end,
      erro_mensagem = case when v_status = 'FALHOU' then v_erro_mensagem else null end,
      enviado_em = case when v_status = 'ENVIADO' then now() else null end,
      finalizado_em = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.finalizar_checklist_envio_portal(uuid, text, jsonb) from public;
grant execute on function public.finalizar_checklist_envio_portal(uuid, text, jsonb) to authenticated;

create or replace function public.registrar_checklist_envio_portal(p_envio jsonb)
returns public.checklist_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio public.checklist_envios;
  v_resultado jsonb;
begin
  v_envio := public.iniciar_checklist_envio_portal(
    coalesce(p_envio, '{}'::jsonb) || jsonb_build_object(
      'chave_idempotencia', coalesce(
        nullif(btrim(coalesce(p_envio->>'chave_idempotencia', '')), ''),
        gen_random_uuid()::text
      )
    )
  );

  if v_envio.status <> 'PROCESSANDO' then
    return v_envio;
  end if;

  v_resultado := jsonb_build_object(
    'email_resend_id', nullif(btrim(coalesce(p_envio->>'email_resend_id', '')), '')
  );

  return public.finalizar_checklist_envio_portal(v_envio.id, 'ENVIADO', v_resultado);
end;
$$;

revoke all on function public.registrar_checklist_envio_portal(jsonb) from public;
grant execute on function public.registrar_checklist_envio_portal(jsonb) to authenticated;

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
    where (v_busca is null or
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

revoke all on function public.listar_checklist_envios_portal(jsonb) from public;
grant execute on function public.listar_checklist_envios_portal(jsonb) to authenticated;
