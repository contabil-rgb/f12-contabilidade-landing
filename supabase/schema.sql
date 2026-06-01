-- Portal de Gestao Contabil - Fase 1 (integracao minima)
-- Esta etapa cria apenas as tabelas clientes e listagens para teste de conexao.
-- Auth, RLS e policies serao implementados em fase posterior.
-- Em producao, sera necessario habilitar RLS e criar policies adequadas.

create extension if not exists pgcrypto;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique,
  razao_social text not null,
  nome_identificacao text,
  tipo_cliente text,
  regime_tributario text,
  atividades text,
  responsavel text,
  revisor text,
  situacao text,
  competencia_em_dia text,
  dias_atraso integer default 0,
  distribuicao_lucros text,
  envio_reinf text,
  data_enviada_reinf date,
  valor_lucro_acumulado numeric(15,2),
  precisa_ata text,
  ata_entregue text,
  data_entrega_ata date,
  ecd text,
  ultima_ecd_entregue text,
  data_entrega_ecd date,
  data_envio_ecd date,
  responsavel_ecd text,
  ecf text,
  ultima_ecf_entregue text,
  enviam_documentos text,
  motivo_atraso text,
  pendencia_tecnica text,
  cliente_notificado text,
  proxima_acao text,
  status text default 'Ativo',
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists public.listagens (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  valor text not null,
  ativo boolean default true,
  ordem integer default 0,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique (categoria, valor)
);

create index if not exists idx_clientes_cnpj on public.clientes(cnpj);
create index if not exists idx_clientes_razao_social on public.clientes(razao_social);
create index if not exists idx_clientes_regime_tributario on public.clientes(regime_tributario);
create index if not exists idx_clientes_tipo_cliente on public.clientes(tipo_cliente);
create index if not exists idx_clientes_responsavel on public.clientes(responsavel);
create index if not exists idx_clientes_revisor on public.clientes(revisor);
create index if not exists idx_clientes_situacao on public.clientes(situacao);
create index if not exists idx_clientes_competencia_em_dia on public.clientes(competencia_em_dia);
create index if not exists idx_clientes_envio_reinf on public.clientes(envio_reinf);
create index if not exists idx_clientes_ecd on public.clientes(ecd);
create index if not exists idx_clientes_ecf on public.clientes(ecf);
create index if not exists idx_clientes_status on public.clientes(status);

create index if not exists idx_listagens_categoria on public.listagens(categoria);
