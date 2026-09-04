-- Portal de Gestao Contabil - Liberar acesso Danielle Silva
-- Execute depois de criar o usuario em Authentication > Users no Supabase.
-- Auth UID: bf141968-ffbd-449e-a9f5-170791701380

insert into public.usuarios (
  auth_user_id,
  nome,
  email,
  cargo,
  setor,
  perfil_acesso,
  status,
  precisa_trocar_senha,
  tentativas_invalidas,
  atualizado_em
)
values (
  'bf141968-ffbd-449e-a9f5-170791701380',
  'Danielle Silva',
  'daniellesilva@f12contabilidade.com.br',
  'Operacional',
  'Setor Contabil',
  'setor_contabil_operacional',
  'Ativo',
  false,
  0,
  now()
)
on conflict (email) do update
set
  auth_user_id = excluded.auth_user_id,
  nome = excluded.nome,
  cargo = excluded.cargo,
  setor = excluded.setor,
  perfil_acesso = excluded.perfil_acesso,
  status = excluded.status,
  precisa_trocar_senha = excluded.precisa_trocar_senha,
  tentativas_invalidas = 0,
  bloqueado_ate = null,
  atualizado_em = now();

select nome, email, cargo, setor, perfil_acesso, status, auth_user_id
from public.usuarios
where lower(email) = 'daniellesilva@f12contabilidade.com.br';
