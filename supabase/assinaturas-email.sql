-- Portal de Gestao Contabil - Assinaturas de e-mail
-- Etapa 1: prepara a base para guardar a assinatura digital dos usuarios.
-- Pode ser executado mais de uma vez com seguranca.
--
-- Esta etapa nao altera o portal ainda, nao envia e-mail e nao remove arquivos.
-- O bucket fica separado dos documentos dos clientes porque a assinatura sera
-- usada como imagem publica dentro do HTML enviado por e-mail.

alter table public.usuarios
  add column if not exists assinatura_email_path text,
  add column if not exists assinatura_email_nome_arquivo text,
  add column if not exists assinatura_email_atualizada_em timestamp with time zone;

comment on column public.usuarios.assinatura_email_path is
  'Caminho da imagem de assinatura do usuario no bucket assinaturas-email.';

comment on column public.usuarios.assinatura_email_nome_arquivo is
  'Nome original do arquivo de assinatura de e-mail do usuario.';

comment on column public.usuarios.assinatura_email_atualizada_em is
  'Data/hora da ultima atualizacao da assinatura de e-mail do usuario.';

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
