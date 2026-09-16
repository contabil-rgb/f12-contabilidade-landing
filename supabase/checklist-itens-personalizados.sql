-- Portal de Gestao Contabil - Checklist de documentos mensais
-- Etapa 2: itens personalizados por cliente.
-- Execute no Supabase SQL Editor depois dos arquivos base do checklist.
-- Pode ser executado mais de uma vez com seguranca.

create extension if not exists pgcrypto;

create table if not exists public.checklist_clientes_itens_personalizados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  descricao text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_clientes_itens_personalizados_descricao_not_blank check (nullif(btrim(descricao), '') is not null)
);

create table if not exists public.checklist_status_personalizados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  item_personalizado_id uuid not null references public.checklist_clientes_itens_personalizados(id) on delete cascade,
  ano integer not null,
  mes integer not null,
  status text not null default 'PENDENTE',
  atualizado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_status_personalizados_competencia_check check (ano between 2000 and 2100 and mes between 1 and 12),
  constraint checklist_status_personalizados_status_check check (status in ('PENDENTE', 'OK', 'NA', 'ERP')),
  constraint checklist_status_personalizados_cliente_item_competencia_unique unique (cliente_id, item_personalizado_id, ano, mes)
);

create index if not exists idx_checklist_clientes_itens_personalizados_cliente
  on public.checklist_clientes_itens_personalizados(cliente_id, ativo, ordem, criado_em);

create unique index if not exists idx_checklist_clientes_itens_personalizados_cliente_descricao_ativo
  on public.checklist_clientes_itens_personalizados(cliente_id, lower(btrim(descricao)))
  where ativo = true;

create index if not exists idx_checklist_status_personalizados_cliente_competencia
  on public.checklist_status_personalizados(cliente_id, ano, mes);

create index if not exists idx_checklist_status_personalizados_item_competencia
  on public.checklist_status_personalizados(item_personalizado_id, ano, mes);

create index if not exists idx_checklist_status_personalizados_status
  on public.checklist_status_personalizados(status);

drop trigger if exists trg_checklist_clientes_itens_personalizados_set_atualizado_em on public.checklist_clientes_itens_personalizados;
create trigger trg_checklist_clientes_itens_personalizados_set_atualizado_em
before update on public.checklist_clientes_itens_personalizados
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_checklist_status_personalizados_set_atualizado_em on public.checklist_status_personalizados;
create trigger trg_checklist_status_personalizados_set_atualizado_em
before update on public.checklist_status_personalizados
for each row
execute function public.set_atualizado_em();

alter table public.checklist_clientes_itens_personalizados enable row level security;
alter table public.checklist_status_personalizados enable row level security;

grant select, insert, update on table public.checklist_clientes_itens_personalizados to authenticated;
grant select, insert, update on table public.checklist_status_personalizados to authenticated;

drop policy if exists checklist_clientes_itens_personalizados_select_usuario_ativo on public.checklist_clientes_itens_personalizados;
create policy checklist_clientes_itens_personalizados_select_usuario_ativo
on public.checklist_clientes_itens_personalizados
for select
to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_clientes_itens_personalizados_insert_usuario_ativo on public.checklist_clientes_itens_personalizados;
create policy checklist_clientes_itens_personalizados_insert_usuario_ativo
on public.checklist_clientes_itens_personalizados
for insert
to authenticated
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_clientes_itens_personalizados_update_usuario_ativo on public.checklist_clientes_itens_personalizados;
create policy checklist_clientes_itens_personalizados_update_usuario_ativo
on public.checklist_clientes_itens_personalizados
for update
to authenticated
using (public.is_portal_usuario_ativo())
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_status_personalizados_select_usuario_ativo on public.checklist_status_personalizados;
create policy checklist_status_personalizados_select_usuario_ativo
on public.checklist_status_personalizados
for select
to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_status_personalizados_insert_usuario_ativo on public.checklist_status_personalizados;
create policy checklist_status_personalizados_insert_usuario_ativo
on public.checklist_status_personalizados
for insert
to authenticated
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_status_personalizados_update_usuario_ativo on public.checklist_status_personalizados;
create policy checklist_status_personalizados_update_usuario_ativo
on public.checklist_status_personalizados
for update
to authenticated
using (public.is_portal_usuario_ativo())
with check (public.is_portal_usuario_ativo());

create or replace function public.salvar_checklist_cliente_item_personalizado_portal(p_item jsonb)
returns public.checklist_clientes_itens_personalizados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_id uuid;
  v_cliente_id uuid;
  v_descricao text;
  v_ordem integer;
  v_ativo boolean;
  v_existente public.checklist_clientes_itens_personalizados;
  v_row public.checklist_clientes_itens_personalizados;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar item personalizado do checklist.';
  end if;

  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'Item personalizado do checklist invalido.';
  end if;

  v_id := nullif(btrim(coalesce(p_item->>'id', '')), '')::uuid;
  v_cliente_id := nullif(btrim(coalesce(p_item->>'cliente_id', '')), '')::uuid;
  v_descricao := nullif(btrim(coalesce(p_item->>'descricao', '')), '');
  v_ordem := coalesce(nullif(btrim(coalesce(p_item->>'ordem', '')), '')::integer, 0);
  v_ativo := coalesce(nullif(btrim(coalesce(p_item->>'ativo', '')), '')::boolean, true);

  if v_cliente_id is null then
    raise exception 'Cliente e obrigatorio para salvar item personalizado do checklist.';
  end if;

  if not exists (select 1 from public.clientes c where c.id = v_cliente_id) then
    raise exception 'Cliente nao encontrado para salvar item personalizado do checklist.';
  end if;

  if v_descricao is null then
    raise exception 'Descricao do item personalizado do checklist e obrigatoria.';
  end if;

  select * into v_existente
  from public.checklist_clientes_itens_personalizados cip
  where cip.cliente_id = v_cliente_id
    and cip.ativo = true
    and lower(btrim(cip.descricao)) = lower(btrim(v_descricao))
    and (v_id is null or cip.id <> v_id)
  limit 1;

  if v_existente.id is not null then
    raise exception 'Ja existe um item personalizado com essa descricao para este cliente: %.', v_existente.descricao;
  end if;

  if v_id is not null then
    update public.checklist_clientes_itens_personalizados
    set descricao = v_descricao,
        ordem = v_ordem,
        ativo = v_ativo
    where id = v_id
      and cliente_id = v_cliente_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Item personalizado do checklist nao encontrado para este cliente.';
    end if;

    return v_row;
  end if;

  insert into public.checklist_clientes_itens_personalizados (cliente_id, descricao, ordem, ativo, criado_por)
  values (v_cliente_id, v_descricao, v_ordem, v_ativo, v_usuario.id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.salvar_checklist_cliente_item_personalizado_portal(jsonb) from public;
grant execute on function public.salvar_checklist_cliente_item_personalizado_portal(jsonb) to authenticated;

create or replace function public.excluir_checklist_cliente_item_personalizado_portal(p_item_id uuid)
returns public.checklist_clientes_itens_personalizados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_item public.checklist_clientes_itens_personalizados;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para inativar item personalizado do checklist.';
  end if;

  if p_item_id is null then
    raise exception 'Item personalizado do checklist e obrigatorio.';
  end if;

  update public.checklist_clientes_itens_personalizados
  set ativo = false
  where id = p_item_id
  returning * into v_item;

  if v_item.id is null then
    raise exception 'Item personalizado do checklist nao encontrado.';
  end if;

  return v_item;
end;
$$;

revoke all on function public.excluir_checklist_cliente_item_personalizado_portal(uuid) from public;
grant execute on function public.excluir_checklist_cliente_item_personalizado_portal(uuid) to authenticated;

create or replace function public.salvar_checklist_status_personalizado_portal(p_status jsonb)
returns public.checklist_status_personalizados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_cliente_id uuid;
  v_item_personalizado_id uuid;
  v_ano integer;
  v_mes integer;
  v_status text;
  v_row public.checklist_status_personalizados;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar status de item personalizado do checklist.';
  end if;

  if p_status is null or jsonb_typeof(p_status) <> 'object' then
    raise exception 'Status do item personalizado do checklist invalido.';
  end if;

  v_cliente_id := nullif(btrim(coalesce(p_status->>'cliente_id', '')), '')::uuid;
  v_item_personalizado_id := nullif(btrim(coalesce(p_status->>'item_personalizado_id', p_status->>'id', '')), '')::uuid;
  v_ano := nullif(btrim(coalesce(p_status->>'ano', '')), '')::integer;
  v_mes := nullif(btrim(coalesce(p_status->>'mes', '')), '')::integer;
  v_status := upper(coalesce(nullif(btrim(coalesce(p_status->>'status', '')), ''), 'PENDENTE'));

  if v_cliente_id is null or v_item_personalizado_id is null then
    raise exception 'Cliente e item personalizado sao obrigatorios para salvar status do checklist.';
  end if;

  if v_ano is null or v_mes is null or v_ano < 2000 or v_ano > 2100 or v_mes < 1 or v_mes > 12 then
    raise exception 'Competencia invalida para status do checklist.';
  end if;

  if v_status not in ('PENDENTE', 'OK', 'NA', 'ERP') then
    raise exception 'Status do checklist invalido: %.', v_status;
  end if;

  if not exists (
    select 1
    from public.checklist_clientes_itens_personalizados cip
    where cip.id = v_item_personalizado_id
      and cip.cliente_id = v_cliente_id
      and cip.ativo = true
  ) then
    raise exception 'Item personalizado nao esta ativo no checklist deste cliente.';
  end if;

  insert into public.checklist_status_personalizados (
    cliente_id,
    item_personalizado_id,
    ano,
    mes,
    status,
    atualizado_por
  )
  values (
    v_cliente_id,
    v_item_personalizado_id,
    v_ano,
    v_mes,
    v_status,
    v_usuario.id
  )
  on conflict (cliente_id, item_personalizado_id, ano, mes)
  do update set status = excluded.status,
                atualizado_por = excluded.atualizado_por
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.salvar_checklist_status_personalizado_portal(jsonb) from public;
grant execute on function public.salvar_checklist_status_personalizado_portal(jsonb) to authenticated;

drop view if exists public.vw_checklist_resumo;
drop view if exists public.vw_checklist_pendencias;

create view public.vw_checklist_pendencias
with (security_invoker = true)
as
with competencias as (
  select
    extract(year from competencia)::integer as ano,
    extract(month from competencia)::integer as mes,
    competencia::date as competencia_inicio
  from generate_series(
    date_trunc('month', current_date) - interval '12 months',
    date_trunc('month', current_date),
    interval '1 month'
  ) competencia
), clientes_ativos as (
  select c.*
  from public.clientes c
  where coalesce(c.arquivado, false) = false
    and lower(coalesce(c.status, '')) <> 'inativo'
), itens_cliente as (
  select
    cci.cliente_id,
    i.id as item_id,
    null::uuid as item_personalizado_id,
    'catalogo'::text as item_tipo,
    i.descricao as item_descricao,
    cci.ordem as item_ordem_cliente,
    cci.criado_em as item_criado_em
  from public.checklist_clientes_itens cci
  join public.checklist_itens i
    on i.id = cci.item_id
   and i.ativo = true
  where cci.ativo = true

  union all

  select
    cip.cliente_id,
    cip.id as item_id,
    cip.id as item_personalizado_id,
    'personalizado'::text as item_tipo,
    cip.descricao as item_descricao,
    cip.ordem as item_ordem_cliente,
    cip.criado_em as item_criado_em
  from public.checklist_clientes_itens_personalizados cip
  where cip.ativo = true
)
select
  c.id as cliente_id,
  c.cnpj,
  c.razao_social,
  c.nome_identificacao,
  c.responsavel,
  c.revisor,
  comp.ano,
  comp.mes,
  make_date(comp.ano, comp.mes, 1) as competencia_inicio,
  ic.item_id,
  ic.item_descricao,
  ic.item_ordem_cliente,
  coalesce(s.status, sp.status, 'PENDENTE') as status,
  coalesce(s.atualizado_em, sp.atualizado_em) as status_atualizado_em,
  u.nome as status_atualizado_por_nome,
  contato.email,
  contato.cc,
  ic.item_tipo,
  ic.item_personalizado_id
from clientes_ativos c
join itens_cliente ic
  on ic.cliente_id = c.id
cross join competencias comp
left join public.checklist_status s
  on ic.item_tipo = 'catalogo'
 and s.cliente_id = c.id
 and s.item_id = ic.item_id
 and s.ano = comp.ano
 and s.mes = comp.mes
left join public.checklist_status_personalizados sp
  on ic.item_tipo = 'personalizado'
 and sp.cliente_id = c.id
 and sp.item_personalizado_id = ic.item_personalizado_id
 and sp.ano = comp.ano
 and sp.mes = comp.mes
left join public.usuarios u
  on u.id = coalesce(s.atualizado_por, sp.atualizado_por)
left join public.checklist_contatos contato
  on contato.cliente_id = c.id
where coalesce(s.status, sp.status, 'PENDENTE') = 'PENDENTE';

create view public.vw_checklist_resumo
with (security_invoker = true)
as
with competencias as (
  select
    extract(year from competencia)::integer as ano,
    extract(month from competencia)::integer as mes,
    competencia::date as competencia_inicio
  from generate_series(
    date_trunc('month', current_date) - interval '12 months',
    date_trunc('month', current_date),
    interval '1 month'
  ) competencia
), clientes_ativos as (
  select c.*
  from public.clientes c
  where coalesce(c.arquivado, false) = false
    and lower(coalesce(c.status, '')) <> 'inativo'
), itens_cliente as (
  select
    cci.cliente_id,
    i.id as item_id,
    null::uuid as item_personalizado_id,
    'catalogo'::text as item_tipo
  from public.checklist_clientes_itens cci
  join public.checklist_itens i
    on i.id = cci.item_id
   and i.ativo = true
  where cci.ativo = true

  union all

  select
    cip.cliente_id,
    cip.id as item_id,
    cip.id as item_personalizado_id,
    'personalizado'::text as item_tipo
  from public.checklist_clientes_itens_personalizados cip
  where cip.ativo = true
), base as (
  select
    c.id as cliente_id,
    c.cnpj,
    c.razao_social,
    c.nome_identificacao,
    c.responsavel,
    c.revisor,
    comp.ano,
    comp.mes,
    coalesce(s.status, sp.status, 'PENDENTE') as status
  from clientes_ativos c
  join itens_cliente ic
    on ic.cliente_id = c.id
  cross join competencias comp
  left join public.checklist_status s
    on ic.item_tipo = 'catalogo'
   and s.cliente_id = c.id
   and s.item_id = ic.item_id
   and s.ano = comp.ano
   and s.mes = comp.mes
  left join public.checklist_status_personalizados sp
    on ic.item_tipo = 'personalizado'
   and sp.cliente_id = c.id
   and sp.item_personalizado_id = ic.item_personalizado_id
   and sp.ano = comp.ano
   and sp.mes = comp.mes
)
select
  cliente_id,
  cnpj,
  razao_social,
  nome_identificacao,
  responsavel,
  revisor,
  ano,
  mes,
  count(*)::integer as total_itens,
  count(*) filter (where status = 'OK')::integer as qtd_ok,
  count(*) filter (where status = 'NA')::integer as qtd_nao_aplicavel,
  count(*) filter (where status = 'ERP')::integer as qtd_erp,
  count(*) filter (where status = 'PENDENTE')::integer as qtd_pendentes,
  case
    when count(*) = 0 then 0
    else round(
      (
        count(*) filter (where status in ('OK', 'NA', 'ERP'))::numeric
        / count(*)::numeric
      ) * 100,
      2
    )
  end as percentual_concluido
from base
group by
  cliente_id,
  cnpj,
  razao_social,
  nome_identificacao,
  responsavel,
  revisor,
  ano,
  mes;

grant select on public.vw_checklist_pendencias to authenticated;
grant select on public.vw_checklist_resumo to authenticated;
