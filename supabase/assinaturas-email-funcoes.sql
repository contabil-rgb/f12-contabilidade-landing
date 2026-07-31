-- Portal de Gestao Contabil - Funcoes de assinatura de e-mail
-- Etapa 2: cria funcoes seguras para salvar/remover a assinatura digital.
-- Pode ser executado mais de uma vez com seguranca.
--
-- Esta etapa salva apenas os metadados da assinatura em public.usuarios.
-- O upload/remocao fisica do arquivo no Storage sera conectado pelo portal
-- na proxima etapa.

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
  v_solicitante public.usuarios;
  v_path text;
  v_nome_arquivo text;
begin
  if p_usuario_id is null then
    raise exception 'Usuario e obrigatorio para salvar assinatura de e-mail.';
  end if;

  select *
    into v_solicitante
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso in (
      'coordenador_administrador',
      'setor_contabil_operacional'
    )
  limit 1;

  if v_solicitante.id is null then
    raise exception 'Usuario sem permissao para salvar assinatura de e-mail.';
  end if;

  if v_solicitante.perfil_acesso <> 'coordenador_administrador'
     and v_solicitante.id <> p_usuario_id then
    raise exception 'Usuario operacional so pode salvar a propria assinatura de e-mail.';
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
  v_solicitante public.usuarios;
begin
  if p_usuario_id is null then
    raise exception 'Usuario e obrigatorio para remover assinatura de e-mail.';
  end if;

  select *
    into v_solicitante
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso in (
      'coordenador_administrador',
      'setor_contabil_operacional'
    )
  limit 1;

  if v_solicitante.id is null then
    raise exception 'Usuario sem permissao para remover assinatura de e-mail.';
  end if;

  if v_solicitante.perfil_acesso <> 'coordenador_administrador'
     and v_solicitante.id <> p_usuario_id then
    raise exception 'Usuario operacional so pode remover a propria assinatura de e-mail.';
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
