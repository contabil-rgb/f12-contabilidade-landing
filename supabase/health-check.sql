-- Portal de Gestao Contabil - Health check (somente leitura)
-- Este arquivo NAO altera dados. Use no SQL Editor do Supabase.

-- 1) Tabelas principais
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('clientes', 'listagens', 'usuarios', 'historico_alteracoes', 'anexos', 'clientes_followups')
order by table_name;

-- 2) Contagem basica
select
  (select count(*) from public.clientes) as total_clientes,
  (select count(*) from public.listagens) as total_listagens,
  (select count(*) from public.usuarios) as total_usuarios,
  (select count(*) from public.historico_alteracoes) as total_historico,
  (select count(*) from public.anexos) as total_anexos,
  (select count(*) from public.clientes_followups) as total_followups;

-- 3) Follow-ups operacionais (amostra)
select
  f.id,
  f.cliente_id,
  c.nome_identificacao,
  f.tipo,
  f.status,
  f.prioridade,
  f.data_prevista,
  f.responsavel_usuario_id,
  f.criado_em
from public.clientes_followups f
left join public.clientes c on c.id = f.cliente_id
order by f.criado_em desc
limit 20;

-- 4) Resumo de follow-ups por cliente
select
  cliente_id,
  nome_identificacao,
  total_followups,
  followups_abertos,
  followups_aguardando_retorno,
  followups_atrasados,
  followups_proximos,
  status_followup_codigo,
  status_followup_label,
  proximo_followup_data_prevista,
  proximo_followup_responsavel_nome
from public.vw_clientes_followups_resumo
order by followups_atrasados desc, followups_aguardando_retorno desc, followups_abertos desc
limit 20;

-- 5) Usuarios complementares e vinculo auth
select nome, email, cargo, setor, perfil_acesso, status, precisa_trocar_senha, auth_user_id
from public.usuarios
order by nome;

-- 6) RLS ativo nas tabelas public
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clientes', 'listagens', 'usuarios', 'historico_alteracoes', 'anexos', 'clientes_followups')
order by tablename;

-- 7) Policies public
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('clientes', 'listagens', 'usuarios', 'historico_alteracoes', 'anexos', 'clientes_followups')
order by tablename, policyname;

-- 8) Bucket de anexos
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where name = 'documentos-clientes';

-- 9) Policies de storage.objects para o bucket
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'storage_docs_clientes_%'
order by policyname;
