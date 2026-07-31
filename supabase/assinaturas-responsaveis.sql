-- Portal de Gestao Contabil - Assinaturas por responsavel
-- Etapa: move o cadastro da assinatura digital para os responsaveis da carteira.
-- Pode ser executado mais de uma vez com seguranca.

alter table public.listagens
  add column if not exists assinatura_email_path text,
  add column if not exists assinatura_email_nome_arquivo text,
  add column if not exists assinatura_email_atualizada_em timestamptz;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'assinaturas-email',
  'assinaturas-email',
  true,
  1048576,
  array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.salvar_assinatura_email_responsavel_portal(
  p_responsavel_id uuid,
  p_assinatura_email_path text,
  p_assinatura_email_nome_arquivo text
)
returns public.listagens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante public.usuarios;
  v_responsavel public.listagens;
  v_path text;
  v_nome_arquivo text;
begin
  if p_responsavel_id is null then
    raise exception 'Responsavel e obrigatorio para salvar assinatura de e-mail.';
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

  v_path := nullif(btrim(p_assinatura_email_path), '');
  v_nome_arquivo := nullif(btrim(p_assinatura_email_nome_arquivo), '');

  if v_path is null then
    raise exception 'Caminho da assinatura e obrigatorio.';
  end if;

  if v_nome_arquivo is null then
    raise exception 'Nome do arquivo da assinatura e obrigatorio.';
  end if;

  if v_path not like ('responsaveis/' || p_responsavel_id::text || '/%') then
    raise exception 'Caminho da assinatura invalido para este responsavel.';
  end if;

  if v_path like '%..%' then
    raise exception 'Caminho da assinatura contem trecho invalido.';
  end if;

  if lower(v_path) !~ '\.(png|jpg|jpeg|webp)$' then
    raise exception 'Assinatura deve ser uma imagem PNG, JPEG ou WEBP.';
  end if;

  update public.listagens
  set
    assinatura_email_path = v_path,
    assinatura_email_nome_arquivo = v_nome_arquivo,
    assinatura_email_atualizada_em = now(),
    atualizado_em = now()
  where id = p_responsavel_id
    and categoria = 'responsavel'
  returning * into v_responsavel;

  if v_responsavel.id is null then
    raise exception 'Responsavel nao encontrado.';
  end if;

  return v_responsavel;
end;
$$;

revoke all on function public.salvar_assinatura_email_responsavel_portal(uuid, text, text) from public;
grant execute on function public.salvar_assinatura_email_responsavel_portal(uuid, text, text) to authenticated;

create or replace function public.remover_assinatura_email_responsavel_portal(
  p_responsavel_id uuid
)
returns public.listagens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante public.usuarios;
  v_responsavel public.listagens;
begin
  if p_responsavel_id is null then
    raise exception 'Responsavel e obrigatorio para remover assinatura de e-mail.';
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

  update public.listagens
  set
    assinatura_email_path = null,
    assinatura_email_nome_arquivo = null,
    assinatura_email_atualizada_em = null,
    atualizado_em = now()
  where id = p_responsavel_id
    and categoria = 'responsavel'
  returning * into v_responsavel;

  if v_responsavel.id is null then
    raise exception 'Responsavel nao encontrado.';
  end if;

  return v_responsavel;
end;
$$;

revoke all on function public.remover_assinatura_email_responsavel_portal(uuid) from public;
grant execute on function public.remover_assinatura_email_responsavel_portal(uuid) to authenticated;
