-- Portal de Gestao Contabil - Fase de historico persistente
-- Este script cria a tabela de historico de alteracoes e aplica RLS basico.
-- Pode ser executado mais de uma vez sem erro.

create extension if not exists pgcrypto;

create table if not exists public.historico_alteracoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  usuario_id uuid references public.usuarios(id),
  usuario_email text,
  usuario_nome text,
  campo_alterado text not null,
  valor_anterior text,
  valor_novo text,
  tipo_acao text,
  origem text,
  data_alteracao timestamptz default now()
);

create index if not exists idx_historico_cliente_id on public.historico_alteracoes(cliente_id);
create index if not exists idx_historico_usuario_id on public.historico_alteracoes(usuario_id);
create index if not exists idx_historico_usuario_email on public.historico_alteracoes(usuario_email);
create index if not exists idx_historico_campo_alterado on public.historico_alteracoes(campo_alterado);
create index if not exists idx_historico_tipo_acao on public.historico_alteracoes(tipo_acao);
create index if not exists idx_historico_origem on public.historico_alteracoes(origem);
create index if not exists idx_historico_data_alteracao on public.historico_alteracoes(data_alteracao desc);

grant select, insert on table public.historico_alteracoes to authenticated;

alter table public.historico_alteracoes enable row level security;

drop policy if exists "historico_select_authenticated_active" on public.historico_alteracoes;
create policy "historico_select_authenticated_active"
on public.historico_alteracoes
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

drop policy if exists "historico_insert_authenticated_active" on public.historico_alteracoes;
create policy "historico_insert_authenticated_active"
on public.historico_alteracoes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

-- Sem policy de UPDATE/DELETE nesta fase para manter trilha de auditoria imutavel.
