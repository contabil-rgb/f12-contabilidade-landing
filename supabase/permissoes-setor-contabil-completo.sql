-- Portal de Gestao Contabil - Permissoes completas para Setor Contabil / Operacional
-- Objetivo: manter o perfil como "setor_contabil_operacional", mas liberar as
-- mesmas acoes administrativas ja disponiveis ao "coordenador_administrador".
-- Pode ser executado mais de uma vez com seguranca.
--
-- Este script nao altera clientes, anexos, relatorios ou usuarios existentes.
-- Ele ajusta apenas helpers, policies e a funcao segura de gestao de usuarios.

-- 1) Helper novo com nome mais claro para os dois perfis de acesso completo.
create or replace function public.is_portal_acesso_total()
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

revoke all on function public.is_portal_acesso_total() from public;
grant execute on function public.is_portal_acesso_total() to authenticated;

-- 2) Mantem compatibilidade com policies antigas que chamam is_portal_coordenador().
-- A partir desta etapa, esse helper passa a representar os perfis com acesso total.
create or replace function public.is_portal_coordenador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_portal_acesso_total();
$$;

revoke all on function public.is_portal_coordenador() from public;
grant execute on function public.is_portal_coordenador() to authenticated;

-- 3) Gestao de usuarios: ambos os perfis com acesso total podem listar e editar
-- usuarios pelo fluxo controlado do portal. Insert/delete continuam bloqueados.
revoke insert, delete on table public.usuarios from authenticated;
revoke update on table public.usuarios from authenticated;
grant select on table public.usuarios to authenticated;
grant update (
  ultimo_acesso,
  precisa_trocar_senha,
  tentativas_invalidas,
  bloqueado_ate,
  atualizado_em
) on table public.usuarios to authenticated;

alter table public.usuarios enable row level security;

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
using (public.is_portal_acesso_total());

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
using (public.is_portal_acesso_total())
with check (public.is_portal_acesso_total());

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
  if not public.is_portal_acesso_total() then
    raise exception 'Usuario sem permissao para atualizar usuarios.';
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
    raise exception 'Voce nao pode inativar o proprio usuario.';
  end if;

  if v_usuario.auth_user_id = auth.uid()
     and coalesce(p_perfil_acesso, v_usuario.perfil_acesso) <> v_usuario.perfil_acesso then
    raise exception 'Altere o proprio perfil apenas por um fluxo administrado.';
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

-- 4) Gestao do catalogo de responsaveis.
grant select, insert, update, delete on table public.listagens to authenticated;

alter table public.listagens enable row level security;

drop policy if exists "listagens_insert_responsavel_coordenador" on public.listagens;
create policy "listagens_insert_responsavel_coordenador"
on public.listagens
for insert
to authenticated
with check (
  public.is_portal_acesso_total()
  and categoria in ('responsavel', 'responsavel_ecf')
);

drop policy if exists "listagens_update_responsavel_coordenador" on public.listagens;
create policy "listagens_update_responsavel_coordenador"
on public.listagens
for update
to authenticated
using (
  public.is_portal_acesso_total()
  and categoria in ('responsavel', 'responsavel_ecf')
)
with check (
  public.is_portal_acesso_total()
  and categoria in ('responsavel', 'responsavel_ecf')
);

drop policy if exists "listagens_delete_responsavel_coordenador" on public.listagens;
create policy "listagens_delete_responsavel_coordenador"
on public.listagens
for delete
to authenticated
using (
  public.is_portal_acesso_total()
  and categoria in ('responsavel', 'responsavel_ecf')
);

-- 5) Exclusao controlada do historico para os dois perfis.
grant delete on table public.historico_alteracoes to authenticated;

drop policy if exists "historico_delete_coordenador_active" on public.historico_alteracoes;
create policy "historico_delete_coordenador_active"
on public.historico_alteracoes
for delete
to authenticated
using (public.is_portal_acesso_total());

-- 6) Assinatura de usuario institucional: ambos os perfis com acesso total
-- podem salvar/remover assinatura de qualquer usuario do portal.
create or replace function public.salvar_assinatura_email_usuario_portal(
  p_usuario_id uuid,
  p_assinatura_email_path text,
  p_assinatura_email_nome_arquivo text
)
returns public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_path text;
  v_nome_arquivo text;
begin
  if not public.is_portal_acesso_total() then
    raise exception 'Usuario sem permissao para salvar assinatura de e-mail.';
  end if;

  if p_usuario_id is null then
    raise exception 'Usuario e obrigatorio para salvar assinatura de e-mail.';
  end if;

  v_path := nullif(btrim(p_assinatura_email_path), '');
  v_nome_arquivo := nullif(btrim(p_assinatura_email_nome_arquivo), '');

  if v_path is null then
    raise exception 'Caminho da assinatura e obrigatorio.';
  end if;

  if v_nome_arquivo is null then
    raise exception 'Nome do arquivo da assinatura e obrigatorio.';
  end if;

  if v_path not like ('usuarios/' || p_usuario_id::text || '/%') then
    raise exception 'Caminho da assinatura invalido para este usuario.';
  end if;

  if v_path like '%..%' then
    raise exception 'Caminho da assinatura contem trecho invalido.';
  end if;

  if lower(v_path) !~ '\.(png|jpg|jpeg|webp)$' then
    raise exception 'Assinatura deve ser uma imagem PNG, JPEG ou WEBP.';
  end if;

  update public.usuarios
  set
    assinatura_email_path = v_path,
    assinatura_email_nome_arquivo = v_nome_arquivo,
    assinatura_email_atualizada_em = now(),
    atualizado_em = now()
  where id = p_usuario_id
  returning * into v_usuario;

  if v_usuario.id is null then
    raise exception 'Usuario nao encontrado.';
  end if;

  return v_usuario;
end;
$$;

revoke all on function public.salvar_assinatura_email_usuario_portal(uuid, text, text) from public;
grant execute on function public.salvar_assinatura_email_usuario_portal(uuid, text, text) to authenticated;

create or replace function public.remover_assinatura_email_usuario_portal(
  p_usuario_id uuid
)
returns public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
begin
  if not public.is_portal_acesso_total() then
    raise exception 'Usuario sem permissao para remover assinatura de e-mail.';
  end if;

  if p_usuario_id is null then
    raise exception 'Usuario e obrigatorio para remover assinatura de e-mail.';
  end if;

  update public.usuarios
  set
    assinatura_email_path = null,
    assinatura_email_nome_arquivo = null,
    assinatura_email_atualizada_em = null,
    atualizado_em = now()
  where id = p_usuario_id
  returning * into v_usuario;

  if v_usuario.id is null then
    raise exception 'Usuario nao encontrado.';
  end if;

  return v_usuario;
end;
$$;

revoke all on function public.remover_assinatura_email_usuario_portal(uuid) from public;
grant execute on function public.remover_assinatura_email_usuario_portal(uuid) to authenticated;
