-- Portal de Gestao Contabil - Health check (somente leitura)
-- Este arquivo NAO altera dados. Use no SQL Editor do Supabase.

-- 1) Tabelas principais
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('clientes', 'listagens', 'usuarios', 'historico_alteracoes', 'anexos')
order by table_name;

-- 2) Contagem basica
select
  (select count(*) from public.clientes) as total_clientes,
  (select count(*) from public.listagens) as total_listagens,
  (select count(*) from public.usuarios) as total_usuarios,
  (select count(*) from public.historico_alteracoes) as total_historico,
  (select count(*) from public.anexos) as total_anexos;

-- 3) Usuarios complementares e vinculo auth
select nome, email, cargo, setor, perfil_acesso, status, precisa_trocar_senha, auth_user_id
from public.usuarios
order by nome;

-- 4) RLS ativo nas tabelas public
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clientes', 'listagens', 'usuarios', 'historico_alteracoes', 'anexos')
order by tablename;

-- 5) Policies public
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('clientes', 'listagens', 'usuarios', 'historico_alteracoes', 'anexos')
order by tablename, policyname;

-- 6) Bucket de anexos
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where name = 'documentos-clientes';

-- 7) Policies de storage.objects para o bucket
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'storage_docs_clientes_%'
order by policyname;
