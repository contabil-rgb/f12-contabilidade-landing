-- Portal de Gestao Contabil - Checklist de documentos mensais
-- Etapa 1: tabelas, indices, RLS e permissoes basicas.
-- Execute antes de checklist-funcoes.sql, checklist-views.sql e checklist-seed.sql.
-- Pode ser executado mais de uma vez com seguranca.

create extension if not exists pgcrypto;

create or replace function public.is_portal_usuario_ativo()
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

create table if not exists public.checklist_itens (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_itens_descricao_unique unique (descricao),
  constraint checklist_itens_descricao_not_blank check (nullif(btrim(descricao), '') is not null)
);

create table if not exists public.checklist_clientes_itens (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  item_id uuid not null references public.checklist_itens(id) on delete cascade,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_clientes_itens_cliente_item_unique unique (cliente_id, item_id)
);

create table if not exists public.checklist_status (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  item_id uuid not null references public.checklist_itens(id) on delete cascade,
  ano integer not null,
  mes integer not null,
  status text not null default 'PENDENTE',
  atualizado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_status_competencia_check check (ano between 2000 and 2100 and mes between 1 and 12),
  constraint checklist_status_status_check check (status in ('PENDENTE', 'OK', 'NA', 'ERP')),
  constraint checklist_status_cliente_item_competencia_unique unique (cliente_id, item_id, ano, mes)
);

create table if not exists public.checklist_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  email text,
  cc text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_contatos_cliente_unique unique (cliente_id),
  constraint checklist_contatos_email_not_blank check (email is null or nullif(btrim(email), '') is not null),
  constraint checklist_contatos_cc_not_blank check (cc is null or nullif(btrim(cc), '') is not null)
);

create table if not exists public.checklist_envios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nome text not null,
  cliente_cnpj text,
  competencias jsonb not null default '[]'::jsonb,
  itens_cobrados jsonb not null default '[]'::jsonb,
  destinatario text not null,
  cc text,
  assunto text not null,
  qtd_pendencias integer not null default 0,
  origem text not null default 'MANUAL',
  status text not null default 'ENVIADO',
  tentativa integer not null default 1,
  chave_idempotencia text not null default gen_random_uuid()::text,
  execucao_id uuid,
  email_resend_id text,
  erro_codigo text,
  erro_mensagem text,
  enviado_por uuid references public.usuarios(id) on delete set null,
  enviado_por_nome text,
  enviado_por_email text,
  iniciado_em timestamp with time zone not null default now(),
  finalizado_em timestamp with time zone,
  enviado_em timestamp with time zone,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint checklist_envios_competencias_array_check check (jsonb_typeof(competencias) = 'array'),
  constraint checklist_envios_itens_cobrados_array_check check (jsonb_typeof(itens_cobrados) = 'array'),
  constraint checklist_envios_destinatario_not_blank check (nullif(btrim(destinatario), '') is not null),
  constraint checklist_envios_assunto_not_blank check (nullif(btrim(assunto), '') is not null),
  constraint checklist_envios_qtd_pendencias_check check (qtd_pendencias >= 0),
  constraint checklist_envios_cliente_nome_not_blank check (nullif(btrim(cliente_nome), '') is not null),
  constraint checklist_envios_origem_check check (origem in ('MANUAL', 'AUTOMATICO')),
  constraint checklist_envios_status_check check (status in ('PROCESSANDO', 'ENVIADO', 'FALHOU', 'CANCELADO')),
  constraint checklist_envios_tentativa_check check (tentativa >= 1),
  constraint checklist_envios_chave_idempotencia_unique unique (chave_idempotencia)
);

create index if not exists idx_checklist_itens_ativo_ordem
  on public.checklist_itens(ativo, ordem, descricao);

create index if not exists idx_checklist_clientes_itens_cliente
  on public.checklist_clientes_itens(cliente_id, ativo, ordem);

create index if not exists idx_checklist_clientes_itens_item
  on public.checklist_clientes_itens(item_id);

create index if not exists idx_checklist_status_cliente_competencia
  on public.checklist_status(cliente_id, ano, mes);

create index if not exists idx_checklist_status_item_competencia
  on public.checklist_status(item_id, ano, mes);

create index if not exists idx_checklist_status_status
  on public.checklist_status(status);

create index if not exists idx_checklist_contatos_cliente
  on public.checklist_contatos(cliente_id);

create index if not exists idx_checklist_envios_cliente_enviado_em
  on public.checklist_envios(cliente_id, enviado_em desc);

create index if not exists idx_checklist_envios_enviado_em
  on public.checklist_envios(enviado_em desc);

create index if not exists idx_checklist_envios_evento_em
  on public.checklist_envios ((coalesce(enviado_em, finalizado_em, iniciado_em, criado_em)) desc);

create index if not exists idx_checklist_envios_cliente_evento_em
  on public.checklist_envios (cliente_id, (coalesce(enviado_em, finalizado_em, iniciado_em, criado_em)) desc);

create index if not exists idx_checklist_envios_status_origem
  on public.checklist_envios (status, origem);

create index if not exists idx_checklist_envios_responsavel_evento_em
  on public.checklist_envios (enviado_por, (coalesce(enviado_em, finalizado_em, iniciado_em, criado_em)) desc);

create index if not exists idx_checklist_envios_execucao
  on public.checklist_envios (execucao_id)
  where execucao_id is not null;

create unique index if not exists idx_checklist_envios_execucao_cliente_unique
  on public.checklist_envios (execucao_id, cliente_id)
  where origem = 'AUTOMATICO' and execucao_id is not null and cliente_id is not null;

drop trigger if exists trg_checklist_itens_set_atualizado_em on public.checklist_itens;
create trigger trg_checklist_itens_set_atualizado_em
before update on public.checklist_itens
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_checklist_clientes_itens_set_atualizado_em on public.checklist_clientes_itens;
create trigger trg_checklist_clientes_itens_set_atualizado_em
before update on public.checklist_clientes_itens
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_checklist_status_set_atualizado_em on public.checklist_status;
create trigger trg_checklist_status_set_atualizado_em
before update on public.checklist_status
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_checklist_contatos_set_atualizado_em on public.checklist_contatos;
create trigger trg_checklist_contatos_set_atualizado_em
before update on public.checklist_contatos
for each row
execute function public.set_atualizado_em();

drop trigger if exists trg_checklist_envios_set_atualizado_em on public.checklist_envios;
create trigger trg_checklist_envios_set_atualizado_em
before update on public.checklist_envios
for each row
execute function public.set_atualizado_em();

alter table public.checklist_itens enable row level security;
alter table public.checklist_clientes_itens enable row level security;
alter table public.checklist_status enable row level security;
alter table public.checklist_contatos enable row level security;
alter table public.checklist_envios enable row level security;

grant select, insert, update on table public.checklist_itens to authenticated;
grant select, insert, update on table public.checklist_clientes_itens to authenticated;
grant select, insert, update on table public.checklist_status to authenticated;
grant select, insert, update on table public.checklist_contatos to authenticated;
grant select on table public.checklist_envios to authenticated;

drop policy if exists checklist_itens_select_usuario_ativo on public.checklist_itens;
create policy checklist_itens_select_usuario_ativo
on public.checklist_itens
for select
to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_itens_insert_usuario_ativo on public.checklist_itens;
create policy checklist_itens_insert_usuario_ativo
on public.checklist_itens
for insert
to authenticated
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_itens_update_usuario_ativo on public.checklist_itens;
create policy checklist_itens_update_usuario_ativo
on public.checklist_itens
for update
to authenticated
using (public.is_portal_usuario_ativo())
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_clientes_itens_select_usuario_ativo on public.checklist_clientes_itens;
create policy checklist_clientes_itens_select_usuario_ativo
on public.checklist_clientes_itens
for select
to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_clientes_itens_insert_usuario_ativo on public.checklist_clientes_itens;
create policy checklist_clientes_itens_insert_usuario_ativo
on public.checklist_clientes_itens
for insert
to authenticated
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_clientes_itens_update_usuario_ativo on public.checklist_clientes_itens;
create policy checklist_clientes_itens_update_usuario_ativo
on public.checklist_clientes_itens
for update
to authenticated
using (public.is_portal_usuario_ativo())
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_status_select_usuario_ativo on public.checklist_status;
create policy checklist_status_select_usuario_ativo
on public.checklist_status
for select
to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_status_insert_usuario_ativo on public.checklist_status;
create policy checklist_status_insert_usuario_ativo
on public.checklist_status
for insert
to authenticated
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_status_update_usuario_ativo on public.checklist_status;
create policy checklist_status_update_usuario_ativo
on public.checklist_status
for update
to authenticated
using (public.is_portal_usuario_ativo())
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_contatos_select_usuario_ativo on public.checklist_contatos;
create policy checklist_contatos_select_usuario_ativo
on public.checklist_contatos
for select
to authenticated
using (public.is_portal_usuario_ativo());

drop policy if exists checklist_contatos_insert_usuario_ativo on public.checklist_contatos;
create policy checklist_contatos_insert_usuario_ativo
on public.checklist_contatos
for insert
to authenticated
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_contatos_update_usuario_ativo on public.checklist_contatos;
create policy checklist_contatos_update_usuario_ativo
on public.checklist_contatos
for update
to authenticated
using (public.is_portal_usuario_ativo())
with check (public.is_portal_usuario_ativo());

drop policy if exists checklist_envios_select_usuario_ativo on public.checklist_envios;
create policy checklist_envios_select_usuario_ativo
on public.checklist_envios
for select
to authenticated
using (public.is_portal_usuario_ativo());
