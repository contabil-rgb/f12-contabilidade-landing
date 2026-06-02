-- Portal de Gestao Contabil - Campos complementares de gestao de usuarios
-- Esta etapa complementa public.usuarios para a tela de Gestao de Usuarios
-- persistir dados reais no Supabase.
-- Pode ser executado mais de uma vez com seguranca.

alter table public.usuarios
  add column if not exists cargo text,
  add column if not exists setor text,
  add column if not exists precisa_trocar_senha boolean not null default false,
  add column if not exists tentativas_invalidas integer not null default 0,
  add column if not exists bloqueado_ate timestamptz;

update public.usuarios
set
  cargo = coalesce(cargo, case
    when lower(email) = 'leticiacampos@f12contabilidade.com.br' then 'Coordenador'
    when lower(email) = 'contabil@f12contabilidade.com.br' then 'Operacional'
    else cargo
  end),
  setor = coalesce(setor, case
    when lower(email) = 'leticiacampos@f12contabilidade.com.br' then 'Contabilidade'
    when lower(email) = 'contabil@f12contabilidade.com.br' then 'Setor Contabil'
    else setor
  end),
  tentativas_invalidas = coalesce(tentativas_invalidas, 0),
  precisa_trocar_senha = coalesce(precisa_trocar_senha, false)
where lower(email) in (
  'leticiacampos@f12contabilidade.com.br',
  'contabil@f12contabilidade.com.br'
);
