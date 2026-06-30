-- Portal de Gestao Contabil - Storage (fase inicial de anexos)
-- Bucket alvo: documentos-clientes (privado)
-- Objetivo: permitir SELECT/INSERT/UPDATE/DELETE apenas para usuario autenticado e ativo.
-- Pode ser executado mais de uma vez.

-- Importante:
-- 1) O bucket "documentos-clientes" deve existir e estar privado.
-- 2) O DELETE e usado apenas para limpar anexos substituidos no bucket de clientes.

alter table if exists storage.objects enable row level security;

grant select, insert, update, delete on table storage.objects to authenticated;

drop policy if exists "storage_docs_clientes_select_authenticated_active" on storage.objects;
create policy "storage_docs_clientes_select_authenticated_active"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documentos-clientes'
  and exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

drop policy if exists "storage_docs_clientes_insert_authenticated_active" on storage.objects;
create policy "storage_docs_clientes_insert_authenticated_active"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documentos-clientes'
  and (name like 'clientes/%')
  and exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

drop policy if exists "storage_docs_clientes_update_authenticated_active" on storage.objects;
create policy "storage_docs_clientes_update_authenticated_active"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documentos-clientes'
  and exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
)
with check (
  bucket_id = 'documentos-clientes'
  and (name like 'clientes/%')
  and exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

drop policy if exists "storage_docs_clientes_delete_authenticated_active" on storage.objects;
create policy "storage_docs_clientes_delete_authenticated_active"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documentos-clientes'
  and (name like 'clientes/%')
  and exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);
