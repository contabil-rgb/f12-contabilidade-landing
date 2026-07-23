-- Portal de Gestao Contabil - Hardening de public.usuarios
-- Objetivo: reforcar que apenas o Coordenador pode gerir usuarios no portal.
-- Pode ser executado mais de uma vez.

-- 1) Garantir permissoes SQL minimas
revoke insert, delete on table public.usuarios from authenticated;
revoke update on table public.usuarios from authenticated;
grant select on table public.usuarios to authenticated;

-- Atualizacao comum fica limitada a campos operacionais do proprio usuario.
-- Campos de gestao (nome, cargo, setor, perfil_acesso, status) passam pela
-- policy de coordenador e nao podem ser alterados por usuario operacional.
grant update (
  ultimo_acesso,
  precisa_trocar_senha,
  tentativas_invalidas,
  bloqueado_ate,
  atualizado_em
) on table public.usuarios to authenticated;

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

-- 3.1) Atualizacao administrativa passa por uma funcao controlada.
-- Isso evita que um usuario operacional altere o proprio perfil_acesso/status
-- usando a API direta da tabela.
create or replace function public.atualizar_usuario_portal(
  p_usuario_id uuid,
  p_nome text,
  p_cargo text,
  p_setor text,
  p_perfil_acesso text,
  p_status text
)
returns public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
begin
  if not public.is_portal_coordenador() then
    raise exception 'Apenas o coordenador pode atualizar usuarios.';
  end if;

  select *
  into v_usuario
  from public.usuarios
  where id = p_usuario_id;

  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if v_usuario.auth_user_id = auth.uid()
     and coalesce(p_status, v_usuario.status) <> 'Ativo' then
    raise exception 'O coordenador nao pode inativar o proprio usuario.';
  end if;

  if v_usuario.auth_user_id = auth.uid()
     and coalesce(p_perfil_acesso, v_usuario.perfil_acesso) <> v_usuario.perfil_acesso then
    raise exception 'Altere o perfil do proprio coordenador apenas por um fluxo administrado.';
  end if;

  update public.usuarios
  set
    nome = coalesce(nullif(trim(p_nome), ''), nome),
    cargo = case
      when p_cargo is null then cargo
      else nullif(trim(p_cargo), '')
    end,
    setor = case
      when p_setor is null then setor
      else nullif(trim(p_setor), '')
    end,
    perfil_acesso = coalesce(nullif(trim(p_perfil_acesso), ''), perfil_acesso),
    status = coalesce(nullif(trim(p_status), ''), status),
    atualizado_em = now()
  where id = p_usuario_id
  returning * into v_usuario;

  return v_usuario;
end;
$$;

revoke all on function public.atualizar_usuario_portal(uuid, text, text, text, text, text) from public;
grant execute on function public.atualizar_usuario_portal(uuid, text, text, text, text, text) to authenticated;

-- 4) Nao criar policies de insert/delete nesta fase.
-- Assim, mesmo autenticado, nao sera possivel inserir/excluir usuarios via frontend.
