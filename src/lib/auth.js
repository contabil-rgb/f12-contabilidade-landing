import {
  ACCESS_PROFILE_KEYS,
  ACCESS_PROFILES,
  COMMON_PASSWORDS,
  LOGIN_LOCK_MINUTES,
  PERMISSIONS,
  RESET_TOKEN_MINUTES,
  SENSITIVE_CLIENT_FIELDS,
  SIMPLE_OPERATIONAL_CLIENT_FIELDS,
  STATUS_CLIENT_FIELDS,
  OPERATIONAL_CLIENT_FIELDS,
} from '../data/security.js';
import { isBlank, normalizeText, todayBr } from './formatters.js';

const HASH_ALGORITHM = 'PBKDF2';
const HASH_DIGEST = 'SHA-256';
const HASH_ITERATIONS = 180000;
const HASH_LENGTH = 256;

function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function randomBytes(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

async function deriveHash(password, saltBytes, iterations = HASH_ITERATIONS) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    HASH_ALGORITHM,
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: HASH_ALGORITHM,
      salt: saltBytes,
      iterations,
      hash: HASH_DIGEST,
    },
    keyMaterial,
    HASH_LENGTH,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const saltBytes = randomBytes(16);
  const hashBytes = await deriveHash(password, saltBytes);
  return `pbkdf2_sha256$${HASH_ITERATIONS}$${bytesToBase64Url(saltBytes)}$${bytesToBase64Url(hashBytes)}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('pbkdf2_sha256$')) return false;
  const [, iterationsRaw, saltRaw, hashRaw] = storedHash.split('$');
  const iterations = Number(iterationsRaw);
  const saltBytes = base64UrlToBytes(saltRaw);
  const expected = base64UrlToBytes(hashRaw);
  const actual = await deriveHash(password, saltBytes, iterations);
  if (actual.length !== expected.length) return false;
  return actual.every((byte, index) => byte === expected[index]);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function generateRecoveryToken() {
  return bytesToBase64Url(randomBytes(32));
}

export async function createRecoveryToken(usuarioId) {
  const token = generateRecoveryToken();
  const now = new Date();
  const expires = new Date(now.getTime() + RESET_TOKEN_MINUTES * 60 * 1000);
  return {
    token,
    record: {
      id: randomId('reset'),
      usuario_id: usuarioId,
      token_hash: await sha256(token),
      expira_em: expires.toISOString(),
      usado_em: '',
      criado_em: now.toISOString(),
    },
  };
}

export async function findValidRecoveryToken(tokens, token) {
  const tokenHash = await sha256(token);
  const now = Date.now();
  return tokens.find(
    (item) =>
      item.token_hash === tokenHash &&
      !item.usado_em &&
      new Date(item.expira_em).getTime() > now,
  );
}

export function validatePassword(password, userLike = {}) {
  const errors = [];
  const normalizedPassword = normalizeText(password).replace(/\s/g, '');
  const normalizedEmail = normalizeText(userLike.email);
  const emailLocal = normalizedEmail.split('@')[0];
  const nameParts = normalizeText(userLike.nome)
    .split(/\s+/)
    .filter((part) => part.length >= 3);

  if (password.length < 8) errors.push('Use pelo menos 8 caracteres.');
  if (!/[A-Z]/.test(password)) errors.push('Inclua pelo menos 1 letra maiúscula.');
  if (!/[a-z]/.test(password)) errors.push('Inclua pelo menos 1 letra minúscula.');
  if (!/\d/.test(password)) errors.push('Inclua pelo menos 1 número.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Inclua pelo menos 1 caractere especial.');
  if (COMMON_PASSWORDS.some((common) => normalizedPassword === normalizeText(common))) {
    errors.push('Escolha uma senha menos comum.');
  }
  if (emailLocal && normalizedPassword.includes(emailLocal)) {
    errors.push('A senha não pode conter o e-mail do usuário.');
  }
  if (nameParts.some((part) => normalizedPassword.includes(part))) {
    errors.push('A senha não pode conter o nome do usuário.');
  }

  return errors;
}

export function createEmptySecurityState() {
  return {
    usuarios: [],
    tokens_recuperacao: [],
    historico_alteracoes: [],
    login_auditoria: [],
  };
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { senha_hash, ...safeUser } = user;
  return safeUser;
}

export function createUserRecord(values) {
  const now = todayBr();
  return {
    id: values.id || randomId('user'),
    nome: values.nome?.trim() ?? '',
    email: values.email?.trim().toLowerCase() ?? '',
    senha_hash: values.senha_hash,
    cargo: values.cargo?.trim() ?? '',
    setor: values.setor?.trim() ?? '',
    perfil_acesso: values.perfil_acesso || ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL,
    status: values.status || 'Ativo',
    ultimo_acesso: values.ultimo_acesso || '',
    precisa_trocar_senha: Boolean(values.precisa_trocar_senha),
    tentativas_invalidas: Number(values.tentativas_invalidas ?? 0),
    bloqueado_ate: values.bloqueado_ate || '',
    criado_em: values.criado_em || now,
    atualizado_em: now,
  };
}

export function getProfile(user) {
  return ACCESS_PROFILES[user?.perfil_acesso] ?? ACCESS_PROFILES[ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL];
}

export function can(user, permission) {
  if (!user) return false;
  const email = String(user.email ?? '').trim().toLowerCase();
  if (email === 'contabil@f12contabilidade.com.br' && permission === PERMISSIONS.USERS_MANAGE) {
    return false;
  }
  return getProfile(user).permissions.includes(permission);
}

export function isAdmin(user) {
  return user?.perfil_acesso === ACCESS_PROFILE_KEYS.COORDINATOR_ADMIN;
}

export function isReadOnly(user) {
  return false;
}

export function canViewClient(user, client) {
  if (!user) return false;
  if (can(user, PERMISSIONS.CLIENTS_VIEW_ALL)) return true;
  if (!can(user, PERMISSIONS.CLIENTS_VIEW_ASSIGNED)) return false;
  const responsavel = normalizeText(client.responsavel);
  if (!responsavel) return false;
  const userName = normalizeText(user.nome);
  const emailLocal = normalizeText(user.email).split('@')[0];
  return userName.includes(responsavel) || responsavel.includes(userName) || emailLocal.includes(responsavel);
}

export function canEditClientField(user, fieldKey) {
  if (!user || isReadOnly(user)) return false;
  if (can(user, PERMISSIONS.CLIENTS_EDIT_ALL)) return true;
  if (['responsavel', 'revisor'].includes(fieldKey)) {
    return can(user, PERMISSIONS.CHANGE_RESPONSIBLES);
  }
  if (can(user, PERMISSIONS.CLIENTS_EDIT_STATUS) && STATUS_CLIENT_FIELDS.includes(fieldKey)) {
    return true;
  }
  if (can(user, PERMISSIONS.CLIENTS_EDIT_OPERATIONAL) && OPERATIONAL_CLIENT_FIELDS.includes(fieldKey)) {
    return true;
  }
  if (can(user, PERMISSIONS.CLIENTS_EDIT_SIMPLE) && SIMPLE_OPERATIONAL_CLIENT_FIELDS.includes(fieldKey)) {
    return true;
  }
  return false;
}

export function canEditClient(user, client) {
  if (!canViewClient(user, client)) return false;
  if (can(user, PERMISSIONS.CLIENTS_EDIT_ALL)) return true;
  return [...STATUS_CLIENT_FIELDS, ...OPERATIONAL_CLIENT_FIELDS, ...SIMPLE_OPERATIONAL_CLIENT_FIELDS].some((field) =>
    canEditClientField(user, field),
  );
}

export function deniedReasonForField(user, fieldKey) {
  if (isReadOnly(user)) return 'Perfil somente consulta.';
  if (SENSITIVE_CLIENT_FIELDS.includes(fieldKey)) return 'Campo sensível bloqueado para este perfil.';
  return 'Sem permissão para alterar este campo.';
}

export function isUserLocked(user) {
  return user?.bloqueado_ate && new Date(user.bloqueado_ate).getTime() > Date.now();
}

export function lockUntilDate() {
  return new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000).toISOString();
}

export function createHistoryEntries({ user, previousClient, nextClient, fields, tipoAcao }) {
  if (!user || !previousClient || !nextClient) return [];
  const now = new Date().toISOString();
  return fields
    .filter((fieldKey) => String(previousClient[fieldKey] ?? '') !== String(nextClient[fieldKey] ?? ''))
    .map((fieldKey) => ({
      id: randomId('hist'),
      usuario_id: user.id,
      usuario_nome: user.nome,
      cliente_id: nextClient.id,
      cliente_nome: nextClient.nome_identificacao || nextClient.razao_social,
      campo_alterado: fieldKey,
      valor_anterior: previousClient[fieldKey] ?? '',
      valor_novo: nextClient[fieldKey] ?? '',
      data_alteracao: now,
      tipo_acao: tipoAcao,
    }));
}

export function hasPasswordHash(user) {
  return !isBlank(user?.senha_hash);
}
