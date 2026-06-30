import {
  ACCESS_PROFILE_KEYS,
  ACCESS_PROFILES,
  COMMON_PASSWORDS,
  PERMISSIONS,
  SENSITIVE_CLIENT_FIELDS,
  SIMPLE_OPERATIONAL_CLIENT_FIELDS,
  STATUS_CLIENT_FIELDS,
  OPERATIONAL_CLIENT_FIELDS,
} from '../data/security.js';
import { normalizeText } from './formatters.js';

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
    historico_alteracoes: [],
  };
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { senha_hash, ...safeUser } = user;
  return safeUser;
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
