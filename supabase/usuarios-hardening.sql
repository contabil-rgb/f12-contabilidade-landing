-- Portal de Gestao Contabil - Hardening de public.usuarios
-- Objetivo: reforcar que apenas o Coordenador pode gerir usuarios no portal.
-- Pode ser executado mais de uma vez.

-- 1) Garantir permissoes SQL minimas
revoke insert, delete on table public.usuarios from authenticated;
grant select, update on table public.usuarios to authenticated;

-- 1.1) Helper para reconhecer coordenador pelo perfil persistido no portal
create or replace function public.is_portal_coordenador()
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
      and u.perfil_acesso = 'coordenador_administrador'
  );
$$;

revoke all on function public.is_portal_coordenador() from public;
grant execute on function public.is_portal_coordenador() to authenticated;

-- 2) RLS deve permanecer ativo
alter table public.usuarios enable row level security;

-- 3) Policies (idempotentes)
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
using (public.is_portal_coordenador());

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
using (public.is_portal_coordenador())
with check (public.is_portal_coordenador());

-- 4) Nao criar policies de insert/delete nesta fase.
-- Assim, mesmo autenticado, nao sera possivel inserir/excluir usuarios via frontend.
