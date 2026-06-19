import { supabase } from '../lib/supabase';
import { ACCESS_PROFILE_KEYS } from '../data/security.js';
import { normalizeText } from '../lib/formatters.js';

const USUARIO_UPDATE_FIELDS = new Set([
  'nome',
  'cargo',
  'setor',
  'perfil_acesso',
  'status',
  'ultimo_acesso',
  'precisa_trocar_senha',
  'tentativas_invalidas',
  'bloqueado_ate',
  'atualizado_em',
]);

function normalizePerfilAcessoValue(value: unknown) {
  const raw = String(value ?? '').trim();
  const normalized = normalizeText(raw);
  if (
    raw === ACCESS_PROFILE_KEYS.COORDINATOR_ADMIN ||
    normalized === 'coordenador / administrador' ||
    normalized === 'coordenador administrador'
  ) {
    return ACCESS_PROFILE_KEYS.COORDINATOR_ADMIN;
  }
  if (
    raw === ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL ||
    normalized === 'setor contabil / operacional' ||
    normalized === 'setor contabil operacional'
  ) {
    return ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL;
  }
  return ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL;
}

function normalizeNullableText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length ? text : '';
}

function normalizeNullableTimestamp(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length ? text : '';
}

function normalizeUsuarioRow(row: Record<string, unknown>) {
  return {
    ...row,
    nome: normalizeNullableText(row.nome),
    email: normalizeNullableText(row.email).toLowerCase(),
    cargo: normalizeNullableText(row.cargo),
    setor: normalizeNullableText(row.setor),
    perfil_acesso: normalizePerfilAcessoValue(row.perfil_acesso),
    status: normalizeNullableText(row.status) || 'Ativo',
    ultimo_acesso: normalizeNullableTimestamp(row.ultimo_acesso),
    precisa_trocar_senha: Boolean(row.precisa_trocar_senha),
    tentativas_invalidas: Number(row.tentativas_invalidas ?? 0) || 0,
    bloqueado_ate: normalizeNullableTimestamp(row.bloqueado_ate),
    criado_em: normalizeNullableTimestamp(row.criado_em),
    atualizado_em: normalizeNullableTimestamp(row.atualizado_em),
  };
}

function toDatabasePatch(data: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!USUARIO_UPDATE_FIELDS.has(key)) continue;
    if (key === 'tentativas_invalidas') {
      payload[key] = Number(value ?? 0) || 0;
      continue;
    }
    if (key === 'precisa_trocar_senha') {
      payload[key] = Boolean(value);
      continue;
    }
    if (key === 'bloqueado_ate' || key === 'ultimo_acesso') {
      payload[key] = value ? String(value) : null;
      continue;
    }
    if (value === '') {
      payload[key] = null;
      continue;
    }
    payload[key] = value ?? null;
  }
  return payload;
}

export async function listarUsuariosPortal() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    throw new Error(`Nao foi possivel carregar usuarios do Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeUsuarioRow(row as Record<string, unknown>));
}

export async function buscarPerfilPorAuthUserId(authUserId: string) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Falha ao consultar public.usuarios.');
  }

  if (!data) return null;
  return normalizeUsuarioRow(data as Record<string, unknown>);
}

export async function atualizarUsuarioPortal(id: string, dados: Record<string, unknown>) {
  const payload = toDatabasePatch({
    ...dados,
    atualizado_em: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from('usuarios')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Nao foi possivel atualizar usuario no Supabase: ${error.message}`);
  }

  return normalizeUsuarioRow(data as Record<string, unknown>);
}

export async function atualizarUltimoAcessoUsuarioPortal(id: string) {
  return atualizarUsuarioPortal(id, { ultimo_acesso: new Date().toISOString() });
}

export async function limparTrocaSenhaObrigatoriaUsuario(id: string) {
  return atualizarUsuarioPortal(id, { precisa_trocar_senha: false });
}
