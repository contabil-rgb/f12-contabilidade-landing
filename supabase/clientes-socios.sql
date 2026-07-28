-- Portal de Gestao Contabil - Socios vinculados ao cliente
-- Execute no SQL Editor do Supabase antes de testar a secao "Socios da Empresa".

create extension if not exists pgcrypto;

create table if not exists public.clientes_socios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  cpf text not null,
  ordem integer not null default 0,
  criado_por uuid references public.usuarios(id),
  atualizado_por uuid references public.usuarios(id),
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint clientes_socios_cpf_digits_check check (cpf ~ '^[0-9]{11}$')
);

create index if not exists idx_clientes_socios_cliente_id
  on public.clientes_socios(cliente_id);

create unique index if not exists idx_clientes_socios_cliente_cpf
  on public.clientes_socios(cliente_id, cpf);

alter table public.clientes_socios enable row level security;

create or replace function public.set_clientes_socios_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_clientes_socios_atualizado_em on public.clientes_socios;
create trigger trg_clientes_socios_atualizado_em
before update on public.clientes_socios
for each row
execute function public.set_clientes_socios_atualizado_em();

create or replace function public.is_portal_usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  );
$$;

drop policy if exists clientes_socios_select_authenticated_active on public.clientes_socios;
create policy clientes_socios_select_authenticated_active
on public.clientes_socios
for select
to authenticated
using (public.is_portal_usuario_ativo());

create or replace function public.salvar_socios_cliente_portal(
  p_cliente_id uuid,
  p_socios jsonb
)
returns setof public.clientes_socios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_total integer;
begin
  select u.id
    into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso in (
      'coordenador_administrador',
      'setor_contabil_operacional'
    )
  limit 1;

  if v_usuario_id is null then
    raise exception 'Usuario sem permissao para salvar socios do cliente.';
  end if;

  if not exists (select 1 from public.clientes c where c.id = p_cliente_id) then
    raise exception 'Cliente nao encontrado.';
  end if;

  if p_socios is null then
    p_socios := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_socios) <> 'array' then
    raise exception 'Lista de socios invalida.';
  end if;

  select count(*)
    into v_total
  from jsonb_array_elements(p_socios);

  if v_total > 50 then
    raise exception 'Limite de 50 socios por cliente excedido.';
  end if;

  delete from public.clientes_socios
  where cliente_id = p_cliente_id;

  insert into public.clientes_socios (
    cliente_id,
    nome,
    cpf,
    ordem,
    criado_por,
    atualizado_por
  )
  select
    p_cliente_id,
    btrim(item->>'nome') as nome,
    regexp_replace(coalesce(item->>'cpf', ''), '\D', '', 'g') as cpf,
    ordinality::integer as ordem,
    v_usuario_id,
    v_usuario_id
  from jsonb_array_elements(p_socios) with ordinality as socios(item, ordinality)
  where nullif(btrim(item->>'nome'), '') is not null
    and regexp_replace(coalesce(item->>'cpf', ''), '\D', '', 'g') ~ '^[0-9]{11}$';

  if exists (
    select 1
    from jsonb_array_elements(p_socios) as socios(item)
    where nullif(btrim(item->>'nome'), '') is not null
      and regexp_replace(coalesce(item->>'cpf', ''), '\D', '', 'g') !~ '^[0-9]{11}$'
  ) then
    raise exception 'CPF do socio deve ter 11 digitos.';
  end if;

  return query
  select *
  from public.clientes_socios
  where cliente_id = p_cliente_id
  order by ordem, nome;
end;
$$;

revoke all on function public.salvar_socios_cliente_portal(uuid, jsonb) from public;
grant execute on function public.salvar_socios_cliente_portal(uuid, jsonb) to authenticated;

grant select on table public.clientes_socios to authenticated;
