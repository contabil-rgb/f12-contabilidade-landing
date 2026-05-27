-- Portal de Gestao Contabil - Fase 2 (seguranca minima)
-- Este script adiciona autenticacao + RLS basico sem alterar a estrutura principal de clientes/listagens.
-- Pode ser executado mais de uma vez com seguranca.

create extension if not exists pgcrypto;

-- 1) Tabela complementar de usuarios (perfil de acesso do portal)
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  nome text not null,
  email text not null unique,
  perfil_acesso text not null,
  status text not null default 'Ativo',
  ultimo_acesso timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_usuarios_email on public.usuarios(email);
create index if not exists idx_usuarios_auth_user_id on public.usuarios(auth_user_id);
create index if not exists idx_usuarios_status on public.usuarios(status);
create index if not exists idx_usuarios_perfil_acesso on public.usuarios(perfil_acesso);

insert into public.usuarios (nome, email, perfil_acesso, status)
values
  ('Coordenador', 'leticiacampos@f12contabilidade.com.br', 'Coordenador / Administrador', 'Ativo'),
  ('Setor Contabil', 'contabil@f12contabilidade.com.br', 'Setor Contabil / Operacional', 'Ativo')
on conflict (email) do nothing;

-- 2) Trigger generico para atualizar campo atualizado_em
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_usuarios_set_atualizado_em on public.usuarios;
create trigger trg_usuarios_set_atualizado_em
before update on public.usuarios
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_clientes_set_atualizado_em on public.clientes;
create trigger trg_clientes_set_atualizado_em
before update on public.clientes
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_listagens_set_atualizado_em on public.listagens;
create trigger trg_listagens_set_atualizado_em
before update on public.listagens
for each row
execute function public.set_atualizado_em();

-- 3) Permissoes basicas para papel authenticated
grant usage on schema public to authenticated;
grant select, update on table public.usuarios to authenticated;
grant select, insert, update on table public.clientes to authenticated;
grant select on table public.listagens to authenticated;

-- 4) RLS basico
alter table public.usuarios enable row level security;
alter table public.clientes enable row level security;
alter table public.listagens enable row level security;

-- public.usuarios
drop policy if exists "usuarios_select_own_profile" on public.usuarios;
create policy "usuarios_select_own_profile"
on public.usuarios
for select
to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists "usuarios_select_all_coordenador" on public.usuarios;
create policy "usuarios_select_all_coordenador"
on public.usuarios
for select
to authenticated
using (lower((auth.jwt() ->> 'email')) = 'leticiacampos@f12contabilidade.com.br');

drop policy if exists "usuarios_update_own_profile" on public.usuarios;
create policy "usuarios_update_own_profile"
on public.usuarios
for update
to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

drop policy if exists "usuarios_update_all_coordenador" on public.usuarios;
create policy "usuarios_update_all_coordenador"
on public.usuarios
for update
to authenticated
using (lower((auth.jwt() ->> 'email')) = 'leticiacampos@f12contabilidade.com.br')
with check (lower((auth.jwt() ->> 'email')) = 'leticiacampos@f12contabilidade.com.br');

-- public.listagens (somente leitura para autenticados)
drop policy if exists "listagens_select_authenticated" on public.listagens;
create policy "listagens_select_authenticated"
on public.listagens
for select
to authenticated
using (true);

-- public.clientes (usuarios autenticados e ativos em public.usuarios)
drop policy if exists "clientes_select_authenticated_active" on public.clientes;
create policy "clientes_select_authenticated_active"
on public.clientes
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

drop policy if exists "clientes_insert_authenticated_active" on public.clientes;
create policy "clientes_insert_authenticated_active"
on public.clientes
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

drop policy if exists "clientes_update_authenticated_active" on public.clientes;
create policy "clientes_update_authenticated_active"
on public.clientes
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

-- IMPORTANTE:
-- 1) Nao criamos delete policy para clientes nesta fase.
-- 2) Este RLS e minimo. A separacao detalhada entre Coordenador e Setor Contabil
--    sera adicionada em fase posterior.
-- 3) Depois de criar usuarios no Supabase Auth, vincule o auth_user_id:
--    update public.usuarios
--    set auth_user_id = 'UUID_DO_USUARIO_AUTH'
--    where email = 'leticiacampos@f12contabilidade.com.br';
--
--    update public.usuarios
--    set auth_user_id = 'UUID_DO_USUARIO_AUTH'
--    where email = 'contabil@f12contabilidade.com.br';
