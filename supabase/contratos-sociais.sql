-- Portal de Gestao Contabil - Contrato Social versionado
-- Execute no SQL Editor do Supabase antes de conectar o upload/historico no portal.
-- Pode ser executado mais de uma vez.

create extension if not exists pgcrypto;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'documentos-clientes',
  'documentos-clientes',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

create table if not exists public.clientes_contratos_sociais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  versao integer not null,
  nome_arquivo text not null,
  caminho_arquivo text not null,
  mime_type text,
  tamanho_bytes bigint,
  observacao text,
  enviado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  constraint clientes_contratos_sociais_versao_check check (versao > 0),
  constraint clientes_contratos_sociais_cliente_versao_unique unique (cliente_id, versao),
  constraint clientes_contratos_sociais_caminho_check check (
    caminho_arquivo like ('clientes/' || cliente_id::text || '/contrato_social/%')
  ),
  constraint clientes_contratos_sociais_mime_check check (
    mime_type is null
    or mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  constraint clientes_contratos_sociais_tamanho_check check (
    tamanho_bytes is null or tamanho_bytes between 1 and 10485760
  )
);

create index if not exists idx_clientes_contratos_sociais_cliente_id
  on public.clientes_contratos_sociais(cliente_id);

create index if not exists idx_clientes_contratos_sociais_cliente_versao_desc
  on public.clientes_contratos_sociais(cliente_id, versao desc);

create index if not exists idx_clientes_contratos_sociais_criado_em_desc
  on public.clientes_contratos_sociais(criado_em desc);

create index if not exists idx_clientes_contratos_sociais_enviado_por
  on public.clientes_contratos_sociais(enviado_por);

alter table public.clientes_contratos_sociais enable row level security;

grant select on table public.clientes_contratos_sociais to authenticated;

drop policy if exists clientes_contratos_sociais_select_authenticated_active
  on public.clientes_contratos_sociais;
create policy clientes_contratos_sociais_select_authenticated_active
on public.clientes_contratos_sociais
for select
to authenticated
using (public.is_portal_usuario_ativo());

create or replace function public.listar_contratos_sociais_cliente_portal(
  p_cliente_id uuid
)
returns setof public.clientes_contratos_sociais
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_portal_usuario_ativo() then
    raise exception 'Usuario sem permissao para listar contratos sociais.';
  end if;

  if p_cliente_id is null then
    raise exception 'Cliente do contrato social e obrigatorio.';
  end if;

  return query
  select *
  from public.clientes_contratos_sociais
  where cliente_id = p_cliente_id
  order by versao desc, criado_em desc;
end;
$$;

create or replace function public.registrar_contrato_social_cliente_portal(
  p_cliente_id uuid,
  p_nome_arquivo text,
  p_caminho_arquivo text,
  p_mime_type text default null,
  p_tamanho_bytes bigint default null,
  p_observacao text default null
)
returns public.clientes_contratos_sociais
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_cliente public.clientes%rowtype;
  v_versao integer;
  v_contrato public.clientes_contratos_sociais;
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
    raise exception 'Usuario sem permissao para registrar contrato social.';
  end if;

  if p_cliente_id is null then
    raise exception 'Cliente do contrato social e obrigatorio.';
  end if;

  select *
    into v_cliente
  from public.clientes c
  where c.id = p_cliente_id
  limit 1;

  if v_cliente.id is null then
    raise exception 'Cliente nao encontrado.';
  end if;

  if coalesce(v_cliente.arquivado, false) or lower(coalesce(v_cliente.status, '')) = 'inativo' then
    raise exception 'Restaure o cliente antes de anexar contrato social.';
  end if;

  if nullif(btrim(coalesce(p_nome_arquivo, '')), '') is null then
    raise exception 'Nome do arquivo e obrigatorio.';
  end if;

  if nullif(btrim(coalesce(p_caminho_arquivo, '')), '') is null then
    raise exception 'Caminho do arquivo e obrigatorio.';
  end if;

  if p_caminho_arquivo not like ('clientes/' || p_cliente_id::text || '/contrato_social/%') then
    raise exception 'Caminho do arquivo de contrato social invalido.';
  end if;

  if p_mime_type is not null and p_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ) then
    raise exception 'Formato de contrato social nao permitido.';
  end if;

  if p_tamanho_bytes is not null and (p_tamanho_bytes < 1 or p_tamanho_bytes > 10485760) then
    raise exception 'Arquivo de contrato social excede o limite de 10 MB.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_cliente_id::text));

  select coalesce(max(versao), 0) + 1
    into v_versao
  from public.clientes_contratos_sociais
  where cliente_id = p_cliente_id;

  insert into public.clientes_contratos_sociais (
    cliente_id,
    versao,
    nome_arquivo,
    caminho_arquivo,
    mime_type,
    tamanho_bytes,
    observacao,
    enviado_por
  )
  values (
    p_cliente_id,
    v_versao,
    btrim(p_nome_arquivo),
    btrim(p_caminho_arquivo),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    p_tamanho_bytes,
    nullif(btrim(coalesce(p_observacao, '')), ''),
    v_usuario_id
  )
  returning * into v_contrato;

  return v_contrato;
end;
$$;

create or replace function public.remover_contrato_social_cliente_portal(
  p_contrato_id uuid
)
returns public.clientes_contratos_sociais
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_cliente public.clientes%rowtype;
  v_contrato public.clientes_contratos_sociais;
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
    raise exception 'Usuario sem permissao para remover contrato social.';
  end if;

  if p_contrato_id is null then
    raise exception 'Contrato social e obrigatorio para remocao.';
  end if;

  select *
    into v_contrato
  from public.clientes_contratos_sociais ccs
  where ccs.id = p_contrato_id
  for update;

  if v_contrato.id is null then
    raise exception 'Contrato social nao encontrado.';
  end if;

  select *
    into v_cliente
  from public.clientes c
  where c.id = v_contrato.cliente_id
  limit 1;

  if v_cliente.id is null then
    raise exception 'Cliente do contrato social nao encontrado.';
  end if;

  if coalesce(v_cliente.arquivado, false) or lower(coalesce(v_cliente.status, '')) = 'inativo' then
    raise exception 'Restaure o cliente antes de remover contrato social.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_contrato.cliente_id::text));

  delete from public.clientes_contratos_sociais ccs
  where ccs.id = v_contrato.id
  returning * into v_contrato;

  return v_contrato;
end;
$$;

revoke all on function public.listar_contratos_sociais_cliente_portal(uuid) from public;
grant execute on function public.listar_contratos_sociais_cliente_portal(uuid) to authenticated;

revoke all on function public.registrar_contrato_social_cliente_portal(uuid, text, text, text, bigint, text) from public;
grant execute on function public.registrar_contrato_social_cliente_portal(uuid, text, text, text, bigint, text) to authenticated;

revoke all on function public.remover_contrato_social_cliente_portal(uuid) from public;
grant execute on function public.remover_contrato_social_cliente_portal(uuid) to authenticated;
