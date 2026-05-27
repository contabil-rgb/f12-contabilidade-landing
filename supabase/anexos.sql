-- Portal de Gestao Contabil - Anexos persistentes (fase inicial)
-- Tabela + indices + RLS minimo.
-- Pode ser executado mais de uma vez.

create extension if not exists pgcrypto;

create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo_anexo text not null,
  nome_arquivo text not null,
  caminho_arquivo text not null,
  mime_type text,
  tamanho_bytes bigint,
  enviado_por uuid references public.usuarios(id),
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_anexos_cliente_id on public.anexos(cliente_id);
create index if not exists idx_anexos_tipo_anexo on public.anexos(tipo_anexo);
create index if not exists idx_anexos_enviado_por on public.anexos(enviado_por);
create index if not exists idx_anexos_criado_em on public.anexos(criado_em desc);

-- Trigger para atualizado_em
create or replace function public.set_atualizado_em_anexos()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_anexos_set_atualizado_em on public.anexos;
create trigger trg_anexos_set_atualizado_em
before update on public.anexos
for each row
execute function public.set_atualizado_em_anexos();

-- Permissoes basicas para papel authenticated
grant select, insert, update on table public.anexos to authenticated;

-- RLS
alter table public.anexos enable row level security;

-- SELECT: autenticado e ativo
drop policy if exists "anexos_select_authenticated_active" on public.anexos;
create policy "anexos_select_authenticated_active"
on public.anexos
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

-- INSERT: autenticado e ativo
drop policy if exists "anexos_insert_authenticated_active" on public.anexos;
create policy "anexos_insert_authenticated_active"
on public.anexos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

-- UPDATE: autenticado e ativo
drop policy if exists "anexos_update_authenticated_active" on public.anexos;
create policy "anexos_update_authenticated_active"
on public.anexos
for update
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

-- Sem DELETE nesta fase (sem policy de delete)
