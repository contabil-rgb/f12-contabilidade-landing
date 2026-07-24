-- Portal de Gestao Contabil - Hardening de anexos
-- Etapa 4.5: reforco das policies de public.anexos.
-- Pode ser executado mais de uma vez.
--
-- Esta etapa nao altera nem remove anexos existentes.
-- O objetivo e manter upload, visualizacao, download e substituicao funcionando,
-- mas limitar os metadados dos anexos aos usuarios ativos dos perfis do portal.
--
-- Observacao sobre Storage:
-- As policies de storage.objects devem continuar sendo geridas pelo painel/API do
-- Supabase quando o SQL Editor nao for owner da tabela interna storage.objects.
-- Na auditoria atual, as policies storage_docs_clientes_* ja existem e o bucket
-- documentos-clientes permanece privado.

create extension if not exists pgcrypto;

-- 1) Tabela de metadados dos anexos
alter table public.anexos enable row level security;

grant select, insert, update, delete on table public.anexos to authenticated;

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
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  )
);

drop policy if exists "anexos_insert_authenticated_active" on public.anexos;
create policy "anexos_insert_authenticated_active"
on public.anexos
for insert
to authenticated
with check (
  tipo_anexo in (
    'cartao_cnpj',
    'cartao_qsa',
    'recibo_reinf',
    'recibo_lucros',
    'recibo_ecd',
    'recibo_ecf',
    'documentacao_mensal',
    'outros'
  )
  and nullif(btrim(nome_arquivo), '') is not null
  and nullif(btrim(caminho_arquivo), '') is not null
  and caminho_arquivo like ('clientes/' || cliente_id::text || '/%')
  and exists (
    select 1
    from public.clientes c
    where c.id = cliente_id
  )
  and exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
      and (enviado_por is null or enviado_por = u.id)
  )
);

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
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  )
)
with check (
  tipo_anexo in (
    'cartao_cnpj',
    'cartao_qsa',
    'recibo_reinf',
    'recibo_lucros',
    'recibo_ecd',
    'recibo_ecf',
    'documentacao_mensal',
    'outros'
  )
  and nullif(btrim(nome_arquivo), '') is not null
  and nullif(btrim(caminho_arquivo), '') is not null
  and caminho_arquivo like ('clientes/' || cliente_id::text || '/%')
  and exists (
    select 1
    from public.clientes c
    where c.id = cliente_id
  )
  and exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
      and (enviado_por is null or enviado_por = u.id)
  )
);

drop policy if exists "anexos_delete_authenticated_active" on public.anexos;
drop policy if exists "anexos_delete_coordenador_active" on public.anexos;
create policy "anexos_delete_coordenador_active"
on public.anexos
for delete
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso = 'coordenador_administrador'
  )
);

-- 2) Bucket privado
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
