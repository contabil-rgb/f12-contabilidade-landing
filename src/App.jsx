import { Component, Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Archive,
  ArrowDownUp,
  BarChart3,
  BellRing,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  Filter,
  FolderClock,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  Paperclip,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import {
  CLIENT_STATUS_OPTIONS,
  createDefaultLists,
  DETAIL_SECTIONS,
  EDITABLE_FIELDS,
  EMPTY_CLIENT,
  FIELD_DEFINITIONS,
  FIELD_GROUPS,
  TABLE_COLUMNS,
  YES_NO_OPTIONS,
} from './data/schema.js';
import { analyzeClient, enrichClients, toBreakdown } from './lib/statusRules.js';
import { isRegimeEcdEcfAplicavel, sanitizeResponsavelEcdByRegime } from './lib/ecdRules.js';
import {
  formatCnpj,
  formatCnpjInput,
  formatCurrency,
  formatNumber,
  getFieldLabel,
  isBlank,
  isYes,
  normalizeCnpj,
  normalizeText,
  sortByLocale,
  stableIdFromCnpj,
  todayBr,
  uniqueValues,
} from './lib/formatters.js';
import {
  AUTH_SESSION_KEY,
  ACCESS_PROFILE_OPTIONS,
  ACCESS_PROFILE_KEYS,
  ACCESS_PROFILES,
  PERMISSIONS,
  USER_STATUS,
} from './data/security.js';
import {
  can,
  canEditClient,
  canEditClientField,
  canViewClient,
  createEmptySecurityState,
  deniedReasonForField,
  getProfile,
  sanitizeUser,
  validatePassword,
} from './lib/auth.js';
import { AnexosClienteSection } from './components/anexos/AnexosClienteSection';
import {
  ContratoSocialTableCell,
  ContratosSociaisClienteSection,
} from './components/anexos/ContratosSociaisClienteSection';
import { UploadAnexoButton } from './components/anexos/UploadAnexoButton';
import ActionButton from './components/ui/ActionButton';
import AlertBanner from './components/ui/AlertBanner';
import DataTableShell, { TableScrollArea } from './components/ui/DataTableShell';
import MetricTile, { getMetricPanelToneClass } from './components/ui/MetricTile';
import StatusBadge from './components/ui/StatusBadge';
import SurfacePanel from './components/ui/SurfacePanel';
import ThemeToggle from './components/ui/ThemeToggle.jsx';
import f12Logo from './assets/logo-f12.png';
import { TIPOS_ANEXO } from './types/anexo';
import { listarUltimosAnexosPorClientes } from './services/anexos.service';
import { listarUltimosContratosSociaisPorClientes } from './services/contratos-sociais.service';
import {
  buscarClientePorId as buscarClientePorIdSupabase,
  atualizarCliente as atualizarClienteSupabase,
  criarCliente as criarClienteSupabase,
  inativarCliente as inativarClienteSupabase,
  listarClientes as listarClientesSupabase,
  listarClientesVinculadosResponsavel,
  restaurarCliente as restaurarClienteSupabase,
} from './services/clientes.service';
import {
  listarSociosClientes as listarSociosClientesSupabase,
  salvarSociosCliente as salvarSociosClienteSupabase,
} from './services/socios-clientes.service';
import {
  enviarReinfEmail as enviarReinfEmailSupabase,
  excluirReinfRelatorio as excluirReinfRelatorioSupabase,
  listarReinfRelatorios as listarReinfRelatoriosSupabase,
  salvarReinfRelatorio as salvarReinfRelatorioSupabase,
} from './services/reinf-relatorios.service';
import {
  gerarUrlPublicaAssinaturaResponsavel,
  removerAssinaturaResponsavel as removerAssinaturaResponsavelSupabase,
  salvarAssinaturaResponsavel as salvarAssinaturaResponsavelSupabase,
} from './services/assinaturas-responsaveis.service';
import {
  criarValorListagem,
  excluirValorListagem,
  inativarValorListagem,
  listarListagensAgrupadas,
  listarValoresListagemPorCategoria,
  reativarValorListagem,
} from './services/listagens.service';
import {
  excluirHistoricoPorIds as excluirHistoricoPorIdsSupabase,
  listarHistoricoPortal as listarHistoricoPortalSupabase,
  listarHistoricoPorCliente as listarHistoricoPorClienteSupabase,
  registrarEventoHistorico as registrarEventoHistoricoSupabase,
  registrarHistoricoAlteracoes as registrarHistoricoAlteracoesSupabase,
} from './services/historico.service';
import {
  importarClientesExcel,
  previsualizarImportacaoExcel,
} from './services/importacao.service';
import {
  indexarStatusObrigacoes,
  listarStatusObrigacoesClientes,
} from './services/obrigacoes.service';
import {
  indexarRiscoOperacional,
  listarRiscoOperacionalClientes,
} from './services/risco-operacional.service';
import {
  indexarAcompanhamentoOperacional,
  listarAcompanhamentoOperacionalClientes,
} from './services/acompanhamento-operacional.service';
import {
  atualizarUltimoAcessoUsuarioPortal,
  atualizarUsuarioPortal,
  buscarPerfilPorAuthUserId,
  limparTrocaSenhaObrigatoriaUsuario,
  listarUsuariosPortal,
} from './services/usuarios.service';
import { supabase } from './lib/supabase';

const LazyUsersPage = lazy(() => import('./components/pages/UsersPage.jsx'));
const LazyHistoryPage = lazy(() => import('./components/pages/HistoryPage.jsx'));
const INITIAL_METADATA = Object.freeze({
  source: 'Inicialização do portal',
  importedAt: '',
  baseRows: 0,
  sheets: [],
  generatedAt: '',
});

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard Geral', icon: LayoutDashboard },
  { key: 'clientes', label: 'Base de Clientes', icon: Users },
  { key: 'reinf', label: 'Distribuição de Lucro', icon: FileSpreadsheet },
  { key: 'ecd', label: 'ECD / ECF', icon: BookOpenCheck },
  { key: 'relatorios', label: 'Relatórios', icon: FileDown },
  { key: 'usuarios', label: 'Gestão de Usuários', icon: UserCog, permission: PERMISSIONS.USERS_MANAGE },
  { key: 'historico', label: 'Histórico', icon: History, permission: PERMISSIONS.HISTORY_VIEW },
];

const PAGE_DESCRIPTIONS = {
  dashboard: 'Visão geral da carteira contábil',
  clientes: 'Controle dos clientes, competências e obrigações',
  reinf: 'Preparação e envio da distribuição de lucro ao setor fiscal',
  ecd: 'Controle das obrigações anuais e responsáveis',
  relatorios: 'Relatórios operacionais e exportação',
  usuarios: 'Gestão dos usuários do portal',
  historico: 'Rastreabilidade das alterações da base',
  detalhe: 'Visão detalhada do cliente contábil',
};

const NAV_GROUPS = [
  { title: 'Visão Geral', keys: ['dashboard'] },
  { title: 'Clientes', keys: ['clientes', 'historico'] },
  { title: 'Obrigações', keys: ['reinf', 'ecd'] },
  { title: 'Relatórios', keys: ['relatorios'] },
  { title: 'Configurações', keys: ['usuarios'] },
];

const DEFAULT_FILTERS = {
  search: '',
  arquivamento: 'todos',
  tipo_cliente: '',
  regime_tributario: '',
  atividades: '',
  responsavel: '',
  revisor: '',
  situacao: '',
  competencia_em_dia: '',
  ecd: '',
  ecf: '',
  envio_reinf: '',
  distribuicao_lucros: '',
  dificuldade: '',
  alerta: '',
};

const FILTER_FIELDS = [
  'tipo_cliente',
  'regime_tributario',
  'atividades',
  'responsavel',
  'revisor',
  'situacao',
  'competencia_em_dia',
  'dificuldade',
];

const CLIENT_STATUS_FILTER_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'inicio_contrato', label: 'Início de contrato', status: 'Início de contrato' },
  { value: 'ativos', label: 'Ativos', status: 'Ativo' },
  { value: 'em_distrato', label: 'Em distrato', status: 'Em distrato' },
  { value: 'arquivados', label: 'Arquivados' },
];

const PRESET_ONLY_FILTER_FIELDS = [
  'ecd',
  'ecf',
  'envio_reinf',
  'distribuicao_lucros',
];

const ALERT_FILTER_LABELS = {
  atraso: 'Clientes em atraso',
  critico: 'Situação crítica',
  tecnica: 'Pendência técnica',
  reinf: 'Distribuição de lucro pendente',
  recibo_reinf: 'Comprovante de distribuição de lucro pendente',
  ecd: 'ECD pendente',
  ecd_envio: 'Aguardando envio da ECD',
  ecd_responsavel: 'Responsável ECD pendente',
  recibo_ecd: 'Recibo ECD pendente',
  ecf: 'ECF pendente',
  ecf_envio: 'Aguardando envio da ECF',
  documentos: 'Documentação atrasada',
  ata: 'Ata pendente',
  comunicacao: 'Comunicação pendente',
  retorno: 'Aguardando retorno',
};

const CLIENT_FIELD_DEFAULTS = {
  anexo_cartao_cnpj: '',
  anexo_cartao_qsa: '',
  anexo_recibo_reinf: '',
  anexo_recibo_lucros: '',
  anexo_recibo_ecd: '',
  anexo_recibo_ecf: '',
  anexo_documentacao_mensal: '',
  anexo_outros: '',
  data_entrega_ecd: '',
  data_envio_ecd: '',
  data_entrega_ecf: '',
  data_envio_ecf: '',
  responsavel_ecd: '',
  pendencias_observacoes: '',
  arquivado: false,
  arquivado_em: '',
  arquivado_por: '',
  arquivado_motivo: '',
  _socios: [],
};

const ATTACHMENT_FIELD_BY_TYPE = {
  [TIPOS_ANEXO.CARTAO_CNPJ]: 'anexo_cartao_cnpj',
  [TIPOS_ANEXO.CARTAO_QSA]: 'anexo_cartao_qsa',
  [TIPOS_ANEXO.RECIBO_REINF]: 'anexo_recibo_reinf',
  [TIPOS_ANEXO.RECIBO_LUCROS]: 'anexo_recibo_lucros',
  [TIPOS_ANEXO.RECIBO_ECD]: 'anexo_recibo_ecd',
  [TIPOS_ANEXO.RECIBO_ECF]: 'anexo_recibo_ecf',
  [TIPOS_ANEXO.DOCUMENTACAO_MENSAL]: 'anexo_documentacao_mensal',
  [TIPOS_ANEXO.OUTROS]: 'anexo_outros',
};

const ATTACHMENT_TYPE_BY_FIELD = Object.fromEntries(
  Object.entries(ATTACHMENT_FIELD_BY_TYPE).map(([tipoAnexo, fieldKey]) => [fieldKey, tipoAnexo]),
);
const ATTACHMENT_FIELD_KEYS = Object.values(ATTACHMENT_FIELD_BY_TYPE);

const ATTACHMENT_FILTERS = {
  all: 'Todos',
  attached: 'Com anexo',
  missing: 'Sem anexo',
};

const BASE_CLIENTS_VISIBLE_KEYS = new Set([
  'anexo_cartao_cnpj',
  'anexo_cartao_qsa',
  'tipo_cliente',
  'regime_tributario',
  'atividades',
  'dificuldade',
  'responsavel',
  'revisor',
]);

const CONTRATO_SOCIAL_TABLE_FIELD = {
  key: 'contrato_social',
  label: 'Contrato Social',
  group: 'Identificação',
  type: 'contrato_social',
};

const BASE_CLIENTS_TABLE_COLUMNS = TABLE_COLUMNS
  .filter((field) => BASE_CLIENTS_VISIBLE_KEYS.has(field.key))
  .flatMap((field) => (
    field.key === 'anexo_cartao_qsa'
      ? [field, CONTRATO_SOCIAL_TABLE_FIELD]
      : [field]
  ));

const EDIT_MODAL_HIDDEN_FIELDS = new Set([
  'data_enviada_reinf',
  'anexo_recibo_reinf',
  'precisa_ata',
  'ata_entregue',
  'data_entrega_ata',
  'revisado_coordenador',
  'lancamentos_padrao',
  'motivo_atraso',
  'pendencia_tecnica',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
]);

const EDIT_MODAL_HIDDEN_GROUPS = new Set([
  'REINF e Lucros',
]);

const EDIT_MODAL_FIELD_LABEL_OVERRIDES = {
  data_enviada_reinf: 'Data enviada da distribuição de lucro',
  precisa_ata: 'Precisa de ata',
  ata_entregue: 'Ata entregue',
  data_entrega_ata: 'Data de entrega da ata',
  enviam_documentos: 'Envia documentos',
  pendencias_observacoes: 'Pendências/Observações',
  motivo_atraso: 'Motivo do atraso',
};

const PORTAL_BOOTSTRAP_CACHE_KEY = 'portal.bootstrap.cache.v1';
const AUTH_BOOTSTRAP_TIMEOUT_MS = 15000;
const AUTH_BOOTSTRAP_TIMEOUT_WITH_CACHE_MS = 4000;
const TRANSIENT_SIGNED_OUT_GRACE_MS = 1600;
const AUTH_RESTORE_VISUAL_DELAY_MS = TRANSIENT_SIGNED_OUT_GRACE_MS + 250;
const CONNECTION_WARNING_VISUAL_DELAY_MS = 3500;

async function loginSupabase(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email ?? '').trim().toLowerCase(),
    password: String(senha ?? ''),
  });
  if (error || !data?.user) {
    return {
      ok: false,
      message: error?.message || 'Falha ao autenticar. Verifique e-mail e senha.',
    };
  }
  return { ok: true, authUser: data.user, authSession: data.session ?? null };
}

async function logoutSupabase() {
  await supabase.auth.signOut();
}

async function getAuthUserSupabase() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

async function getAuthSessionSupabase() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session ?? null;
}

async function getPerfilByAuthUserId(authUserId) {
  return buscarPerfilPorAuthUserId(authUserId);
}

async function getPerfilByAuthUserIdWithRetry(authUserId, options = {}) {
  const attempts = Math.max(1, Number(options.attempts ?? 3) || 3);
  const delayMs = Math.max(0, Number(options.delayMs ?? 250) || 250);

  for (let index = 0; index < attempts; index += 1) {
    const perfil = await getPerfilByAuthUserId(authUserId);
    if (perfil) return perfil;
    if (index < attempts - 1) {
      await wait(delayMs);
    }
  }

  return null;
}

async function waitForAuthSessionUser(authUserId, options = {}) {
  const timeoutMs = Math.max(250, Number(options.timeoutMs ?? 3500) || 3500);
  const intervalMs = Math.max(50, Number(options.intervalMs ?? 150) || 150);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const session = await getAuthSessionSupabase();
    if (session?.user?.id === authUserId) {
      return session;
    }
    await wait(intervalMs);
  }

  return null;
}

async function resolveBootstrapAuthSession(preferredAuthUserId) {
  const session = await getAuthSessionSupabase();
  if (!preferredAuthUserId) return session;
  if (session?.user?.id === preferredAuthUserId) return session;

  return await waitForAuthSessionUser(preferredAuthUserId, {
    timeoutMs: 3500,
    intervalMs: 150,
  }) ?? session;
}

async function updateUltimoAcessoUsuario(usuarioId) {
  try {
    await atualizarUltimoAcessoUsuarioPortal(usuarioId);
    return true;
  } catch {
    return false;
  }
}


async function enviarResetSenhaSupabase(email) {
  const redirectTo = `${window.location.origin}${window.location.pathname}?type=recovery`;
  const { error } = await supabase.auth.resetPasswordForEmail(
    String(email ?? '').trim().toLowerCase(),
    { redirectTo },
  );
  if (error) throw new Error(error.message || 'Não foi possível enviar o e-mail de recuperação.');
}

async function atualizarSenhaUsuarioLogado(novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) throw new Error(error.message || 'Não foi possível atualizar a senha.');
}

async function prepararSessaoRecuperacaoSenha() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return data.session;

  const url = new URL(window.location.href);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const code = url.searchParams.get('code');

  if (code) {
    const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message || 'Não foi possível validar o código de recuperação.');
    return exchanged?.session ?? null;
  }

  if (tokenHash && type === 'recovery') {
    const { data: verified, error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    });
    if (error) throw new Error(error.message || 'Link de recuperação inválido ou expirado.');
    return verified?.session ?? null;
  }

  return null;
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function useDelayedFlag(active, delayMs) {
  const [visible, setVisible] = useState(() => !delayMs && Boolean(active));

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }

    if (!delayMs || delayMs <= 0) {
      setVisible(true);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [active, delayMs]);

  return visible;
}

function isAuthTimeoutError(error) {
  return String(error?.message ?? '').includes('demorou mais do que o esperado');
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? ''));
}

function withClientDefaults(client) {
  return {
    ...CLIENT_FIELD_DEFAULTS,
    ...client,
  };
}

function normalizeCpfDigits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 14);
}

function isCpfCnpjDigitsValid(value) {
  const length = normalizeCpfDigits(value).length;
  return length === 11 || length === 14;
}

function formatCpfInput(value) {
  const digits = normalizeCpfDigits(value);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length <= 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function normalizeSociosClienteInput(socios = []) {
  const seen = new Set();
  return (socios ?? [])
    .map((socio) => {
      const id = String(socio?.id ?? '').trim();
      const nome = String(socio?.nome ?? '').trim();
      const cpf = normalizeCpfDigits(socio?.cpf);
      return {
        ...(id ? { id } : {}),
        nome,
        cpf,
      };
    })
    .filter((socio) => socio.nome || socio.cpf)
    .filter((socio) => {
      if (!socio.cpf) return true;
      if (seen.has(socio.cpf)) return false;
      seen.add(socio.cpf);
      return true;
    });
}

function indexarSociosClientes(rows = []) {
  return (rows ?? []).reduce((acc, row) => {
    const clienteId = String(row?.cliente_id ?? '').trim();
    if (!clienteId) return acc;
    if (!acc[clienteId]) acc[clienteId] = [];
    acc[clienteId].push({
      id: row.id,
      nome: String(row.nome ?? '').trim(),
      cpf: normalizeCpfDigits(row.cpf),
    });
    return acc;
  }, {});
}

function hydrateClientesComSocios(clientesBase, sociosIndex = {}) {
  return (clientesBase ?? []).map((client) => ({
    ...client,
    _socios: sociosIndex[String(client.id ?? '').trim()] ?? client._socios ?? [],
  }));
}

// Selects persistidos no cliente que ainda precisam de um fallback tecnico minimo
// caso a carga do Supabase venha incompleta.
const SELECT_LIST_FALLBACKS = {
  competencia_em_dia: YES_NO_OPTIONS,
  cliente_notificado: YES_NO_OPTIONS,
  ecd: YES_NO_OPTIONS,
};

const TEAM_MEMBER_DISPLAY_ALIASES = {
  tiago: 'Thiago',
};

const BOOTSTRAP_METADATA_KEYS = ['importedAt', 'generatedAt'];

function createRuntimeListBase() {
  return Object.fromEntries(
    Object.entries(SELECT_LIST_FALLBACKS).map(([key, values]) => [key, [...values]]),
  );
}

function buildAttachmentFieldSnapshot(clients = []) {
  return Object.fromEntries(
    (clients ?? [])
      .map((client) => {
        const clientId = String(client?.id ?? '').trim();
        if (!clientId) return null;

        const attachmentFields = Object.fromEntries(
          ATTACHMENT_FIELD_KEYS
            .map((fieldKey) => [fieldKey, client?.[fieldKey] ?? ''])
            .filter(([, value]) => hasAttachment(value)),
        );

        if (!Object.keys(attachmentFields).length) return null;
        return [clientId, attachmentFields];
      })
      .filter(Boolean),
  );
}

function sanitizeBootstrapMetadata(metadata) {
  const safe = { ...INITIAL_METADATA };
  if (!metadata || typeof metadata !== 'object') {
    return safe;
  }

  BOOTSTRAP_METADATA_KEYS.forEach((key) => {
    safe[key] = String(metadata?.[key] ?? '').trim();
  });

  return safe;
}

function sanitizeBootstrapListagens(listagens) {
  const allowedKeys = new Set([
    ...Object.keys(SELECT_LIST_FALLBACKS),
    ...FIELD_DEFINITIONS.map((field) => field.listKey).filter(Boolean),
  ]);

  return Object.fromEntries(
    Object.entries(listagens ?? {})
      .filter(([key, values]) => allowedKeys.has(key) && Array.isArray(values))
      .map(([key, values]) => [
        key,
        uniqueValues(
          values
            .map((value) => normalizeFieldDisplayValue(key, value))
            .filter(Boolean),
        ),
      ])
      .filter(([, values]) => values.length > 0),
  );
}

function loadInitialState() {
  try {
    const raw = window.localStorage.getItem(PORTAL_BOOTSTRAP_CACHE_KEY);
    if (!raw) {
      return {
        clientes: [],
        listagens: createRuntimeListBase(),
        metadata: { ...INITIAL_METADATA },
        hasBootstrapCache: false,
      };
    }

    const parsed = JSON.parse(raw);
    const clientes = Array.isArray(parsed?.clientes)
      ? parsed.clientes.map(withClientDefaults)
      : [];
    const listagens = mergeListagensFromClients(
      mergeListagensFromSupabase(createRuntimeListBase(), sanitizeBootstrapListagens(parsed?.listagens ?? {})),
      clientes,
    );
    const metadata = sanitizeBootstrapMetadata(parsed?.metadata);

    return {
      clientes,
      listagens,
      metadata: clientes.length
        ? {
          ...metadata,
          source: 'Cache local da última sincronização',
        }
        : metadata,
      hasBootstrapCache: clientes.length > 0,
    };
  } catch {
    return {
      clientes: [],
      listagens: createRuntimeListBase(),
      metadata: { ...INITIAL_METADATA },
      hasBootstrapCache: false,
    };
  }

}

function getAuthBootstrapTimeoutMs(hasCachedSession) {
  return hasCachedSession ? AUTH_BOOTSTRAP_TIMEOUT_WITH_CACHE_MS : AUTH_BOOTSTRAP_TIMEOUT_MS;
}

function saveBootstrapCache({ clientes, listagens, metadata }) {
  try {
    const payload = {
      clientes: Array.isArray(clientes) ? clientes.map(withClientDefaults) : [],
      listagens: sanitizeBootstrapListagens(
        listagens && typeof listagens === 'object' ? listagens : createRuntimeListBase(),
      ),
      metadata: sanitizeBootstrapMetadata(metadata),
    };
    window.localStorage.setItem(PORTAL_BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore local storage failures
  }
}

function mergeListagensFromSupabase(baseListagens, listagensSupabase) {
  const merged = { ...baseListagens };
  Object.entries(listagensSupabase ?? {}).forEach(([categoria, valores]) => {
    if (!Array.isArray(valores) || !valores.length) return;
    merged[categoria] = uniqueValues(valores);
  });
  Object.entries(SELECT_LIST_FALLBACKS).forEach(([key, values]) => {
    if (!Array.isArray(merged[key]) || !merged[key].length) {
      merged[key] = [...values];
    }
  });
  return merged;
}

function mergeListagensFromClients(baseListagens, clients) {
  const merged = { ...baseListagens };
  const listFields = FIELD_DEFINITIONS.filter((field) => field.listKey);
  listFields.forEach((field) => {
    const values = uniqueValues([
      ...(merged[field.listKey] ?? []),
      ...clients.map((client) => normalizeFieldDisplayValue(field.key, client?.[field.key])),
    ]);
    if (values.length) {
      merged[field.listKey] = values;
    }
  });
  return merged;
}

function getResponsaveisAtivosCatalogo(rows) {
  return uniqueValues(
    (rows ?? [])
      .filter((item) => item?.ativo !== false)
      .map((item) => normalizeTeamMemberDisplayName(item?.valor)),
  );
}

function loadSecurityState() {
  return {
    ...createEmptySecurityState(),
    usuarios: [],
  };
}

function normalizeTeamMemberDisplayName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return TEAM_MEMBER_DISPLAY_ALIASES[normalizeText(raw)] || raw;
}

function normalizeFieldDisplayValue(fieldKey, value) {
  if (fieldKey === 'responsavel' || fieldKey === 'revisor') {
    return normalizeTeamMemberDisplayName(value);
  }
  return String(value ?? '').trim();
}

function normalizeFilterComparableValue(fieldKey, value) {
  return normalizeText(normalizeFieldDisplayValue(fieldKey, value)) || normalizeText('Não informado');
}

function normalizeSessionProfileSnapshot(profile) {
  if (!profile || typeof profile !== 'object') return null;
  if (!profile.id || !profile.auth_user_id) return null;
  return {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    nome: String(profile.nome ?? '').trim(),
    email: String(profile.email ?? '').trim().toLowerCase(),
    cargo: String(profile.cargo ?? '').trim(),
    setor: String(profile.setor ?? '').trim(),
    perfil_acesso: String(profile.perfil_acesso ?? '').trim(),
    status: String(profile.status ?? 'Ativo').trim() || 'Ativo',
    ultimo_acesso: String(profile.ultimo_acesso ?? '').trim(),
    precisa_trocar_senha: Boolean(profile.precisa_trocar_senha),
    tentativas_invalidas: Number(profile.tentativas_invalidas ?? 0) || 0,
    bloqueado_ate: String(profile.bloqueado_ate ?? '').trim(),
    criado_em: String(profile.criado_em ?? '').trim(),
    atualizado_em: String(profile.atualizado_em ?? '').trim(),
    assinatura_email_path: String(profile.assinatura_email_path ?? '').trim(),
    assinatura_email_nome_arquivo: String(profile.assinatura_email_nome_arquivo ?? '').trim(),
    assinatura_email_atualizada_em: String(profile.assinatura_email_atualizada_em ?? '').trim(),
  };
}

function loadSession() {
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.usuario_id || !parsed.auth_user_id) return null;
    return {
      ...parsed,
      profile: normalizeSessionProfileSnapshot(parsed.profile),
    };
  } catch {
    return null;
  }
}

function loadInitialSessionState() {
  const session = loadSession();
  return {
    session,
    sessionProfile: normalizeSessionProfileSnapshot(session?.profile),
    authReady: Boolean(session?.auth_user_id),
  };
}

function saveSession(session) {
  try {
    if (!session) {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore session storage failures
  }
}

function clearSession() {
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore session storage failures
  }
}

function shouldOpenResetViewFromUrl() {
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  return (
    search.includes('type=recovery') ||
    search.includes('token_hash=') ||
    search.includes('code=') ||
    hash.includes('type=recovery') ||
    hash.startsWith('#reset')
  );
}

function getMetadataSourceDisplay(source) {
  if (source === 'Cache local da última sincronização') return 'Leitura local da última sincronização';
  if (source === 'Supabase indisponível') return 'Sem leitura confirmada do Supabase';
  if (source === 'Supabase') return 'Supabase';
  return source || 'Origem não informada';
}

function isProtectedReadMode(supabaseStatus, metadata) {
  return !supabaseStatus?.connected && metadata?.source === 'Cache local da última sincronização';
}

function getSupabaseStatusDisplay(supabaseStatus, metadata) {
  if (isProtectedReadMode(supabaseStatus, metadata)) {
    return 'Modo protegido | leitura local da última sincronização';
  }
  if (!supabaseStatus?.connected && metadata?.source === 'Supabase indisponível') {
    return 'Supabase indisponível | sem leitura local confirmada';
  }
  return supabaseStatus?.message || 'Dados locais';
}

function formatDateTime(value) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getLatestClienteAtualizadoEm(clientes) {
  let latest = 0;
  (clientes ?? []).forEach((client) => {
    const raw = String(client?.atualizado_em ?? '').trim();
    if (!raw) return;
    const timestamp = new Date(raw).getTime();
    if (Number.isFinite(timestamp) && timestamp > latest) {
      latest = timestamp;
    }
  });
  return latest ? new Date(latest).toISOString() : '';
}

function statusTone(value, client) {
  const normalized = normalizeText(value);
  if (isSituacaoCritica(client) || normalized.includes('critico')) return 'danger';
  if (isEmAtraso(client) || normalized.includes('atras')) return 'warning';
  if (normalized.includes('dia') || normalizeText(value) === 'sim') return 'success';
  if (normalized.includes('inativo')) return 'muted';
  return 'neutral';
}

function chipClass(tone = 'neutral') {
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/20 dark:text-gray-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/20 dark:text-gray-100',
    danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/35 dark:bg-red-500/20 dark:text-gray-100',
    info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/20 dark:text-gray-100',
    muted: 'border-slate-200 bg-slate-100 text-slate-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200',
    neutral: 'border-slate-200 bg-white text-slate-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
  };
  return tones[tone] ?? tones.neutral;
}

function valueOrDash(value, type) {
  if (isBlank(value)) return 'Não informado';
  if (type === 'currency') return formatCurrency(value);
  return String(value);
}

function hasAttachment(value) {
  return !isBlank(value);
}

function parseAttachment(value) {
  if (!hasAttachment(value)) {
    return { has: false, name: '', href: '', path: '', id: '', tipo_anexo: '', attachedAt: '', createdAt: '', updatedAt: '', structured: false };
  }

  const raw = String(value).trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.name) {
      return {
        has: true,
        id: parsed.id || '',
        name: parsed.name || parsed.nome_arquivo,
        href: parsed.url || parsed.href || '',
        path: parsed.path || parsed.caminho_arquivo || '',
        tipo_anexo: parsed.tipo_anexo || parsed.type || '',
        attachedAt: parsed.attachedAt || parsed.atualizado_em || parsed.criado_em || '',
        createdAt: parsed.criado_em || '',
        updatedAt: parsed.atualizado_em || '',
        structured: true,
      };
    }
  } catch {
    // Plain text/link attachment values may still exist from legacy data.
  }

  return {
    has: true,
    id: '',
    name: raw,
    href: /^https?:\/\//i.test(raw) ? raw : '',
    path: '',
    tipo_anexo: '',
    attachedAt: '',
    createdAt: '',
    updatedAt: '',
    structured: false,
  };
}

function anexoToFieldValue(anexo) {
  if (!anexo) return '';
  return JSON.stringify({
    id: anexo.id,
    name: anexo.nome_arquivo,
    path: anexo.caminho_arquivo,
    tipo_anexo: anexo.tipo_anexo,
    mime_type: anexo.mime_type,
    size: anexo.tamanho_bytes,
    attachedAt: anexo.atualizado_em || anexo.criado_em || new Date().toISOString(),
    criado_em: anexo.criado_em || anexo.atualizado_em || new Date().toISOString(),
    atualizado_em: anexo.atualizado_em || anexo.criado_em || new Date().toISOString(),
    storage: 'supabase',
  });
}

function fieldValueToAnexo(value, tipoAnexo, client) {
  const attachment = parseAttachment(value);
  const storagePath = attachment.path || attachment.href;
  if (!attachment.has || !storagePath) return null;
  return {
    id: attachment.id || '',
    cliente_id: client?.id ?? '',
    tipo_anexo: tipoAnexo,
    nome_arquivo: attachment.name,
    caminho_arquivo: storagePath,
    criado_em: attachment.createdAt || attachment.attachedAt || null,
    atualizado_em: attachment.updatedAt || attachment.attachedAt || null,
  };
}

function applyResponsavelEcdFallback(base, patch) {
  if (!patch) {
    return patch;
  }

  const regimeTributario = Object.prototype.hasOwnProperty.call(patch, 'regime_tributario')
    ? patch.regime_tributario
    : base?.regime_tributario;

  if (!isRegimeEcdEcfAplicavel(regimeTributario)) {
    const responsavelEcdAtual = String(base?.responsavel_ecd ?? '').trim();
    const patchTemResponsavelEcd = Object.prototype.hasOwnProperty.call(patch, 'responsavel_ecd');
    const patchResponsavelEcd = String(patch?.responsavel_ecd ?? '').trim();

    if (responsavelEcdAtual || patchTemResponsavelEcd || patchResponsavelEcd) {
      return {
        ...patch,
        responsavel_ecd: null,
      };
    }

    return patch;
  }

  if (!Object.prototype.hasOwnProperty.call(patch, 'responsavel')) {
    return patch;
  }

  const responsavelAtual = String(base?.responsavel_ecd ?? '').trim();
  const responsavelNovo = String(patch?.responsavel ?? '').trim();
  const patchResponsavelEcd = String(patch?.responsavel_ecd ?? '').trim();

  if (!responsavelNovo || responsavelAtual || patchResponsavelEcd) {
    return patch;
  }

  return {
    ...patch,
    responsavel_ecd: patch.responsavel,
  };
}

async function hydrateClientesComAnexos(clientesBase, fallbackAttachmentSnapshot = {}) {
  const normalized = (clientesBase ?? []).map(withClientDefaults);
  const ids = normalized
    .map((client) => String(client.id ?? '').trim())
    .filter((id) => isUuid(id));

  if (!ids.length) return normalized;

  try {
    const anexosPorCliente = await listarUltimosAnexosPorClientes(ids);
    return normalized.map((client) => {
      const byTipo = anexosPorCliente[String(client.id ?? '')];
      if (!byTipo) return client;

      const next = { ...client };
      Object.entries(ATTACHMENT_FIELD_BY_TYPE).forEach(([tipoAnexo, fieldKey]) => {
        const anexo = byTipo[tipoAnexo];
        next[fieldKey] = anexo ? anexoToFieldValue(anexo) : '';
      });
      return next;
    });
  } catch (error) {
    console.warn('[anexos] Falha ao hidratar anexos por cliente:', error);

    return normalized.map((client) => {
      const fallbackFields = fallbackAttachmentSnapshot[String(client.id ?? '').trim()];
      if (!fallbackFields) return client;

      const next = { ...client };
      ATTACHMENT_FIELD_KEYS.forEach((fieldKey) => {
        if (hasAttachment(next[fieldKey])) return;
        if (!hasAttachment(fallbackFields[fieldKey])) return;
        next[fieldKey] = fallbackFields[fieldKey];
      });
      return next;
    });
  }
}

async function hydrateClientesComContratosSociais(clientesBase) {
  const normalized = (clientesBase ?? []).map(withClientDefaults);
  const ids = normalized
    .map((client) => String(client.id ?? '').trim())
    .filter((id) => isUuid(id));

  if (!ids.length) return normalized;

  try {
    const contratosPorCliente = await listarUltimosContratosSociaisPorClientes(ids);
    return normalized.map((client) => ({
      ...client,
      _contrato_social_atual: contratosPorCliente[String(client.id ?? '')] ?? client._contrato_social_atual ?? null,
    }));
  } catch (error) {
    console.warn('[contratos-sociais] Falha ao hidratar contratos sociais por cliente:', error);
    return normalized;
  }
}

function hydrateClientesComObrigacoes(clientesBase, obrigacoesIndex = {}) {
  return (clientesBase ?? []).map((client) => {
    const obrigacoes = obrigacoesIndex[String(client.id ?? '').trim()];
    if (!obrigacoes) return client;
    return {
      ...client,
      _db_obrigacoes: obrigacoes,
    };
  });
}

function hydrateClientesComRiscoOperacional(clientesBase, riscoIndex = {}) {
  return (clientesBase ?? []).map((client) => {
    const risco = riscoIndex[String(client.id ?? '').trim()];
    if (!risco) return client;
    return {
      ...client,
      _db_risco_operacional: risco,
    };
  });
}

function hydrateClientesComAcompanhamentoOperacional(clientesBase, acompanhamentoIndex = {}) {
  return (clientesBase ?? []).map((client) => {
    const acompanhamento = acompanhamentoIndex[String(client.id ?? '').trim()];
    if (!acompanhamento) return client;
    return {
      ...client,
      _db_acompanhamento_operacional: acompanhamento,
    };
  });
}

function clearPersistedObrigacoes(client) {
  if (
    !client
    || (!client._db_obrigacoes
      && !client._db_risco_operacional
      && !client._db_acompanhamento_operacional)
  ) return client;
  const next = { ...client };
  delete next._db_obrigacoes;
  delete next._db_risco_operacional;
  delete next._db_acompanhamento_operacional;
  return next;
}

function AttachmentBadge({ value }) {
  const attachment = parseAttachment(value);
  const attached = attachment.has;
  return (
    <span
      className={`inline-flex max-w-56 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${chipClass(attached ? 'success' : 'muted')}`}
      title={attached ? attachment.name : 'Sem anexo'}
    >
      <Paperclip size={13} aria-hidden="true" />
      <span className="truncate">{attached ? `Anexado: ${attachment.name}` : 'Sem anexo'}</span>
    </span>
  );
}

function renderFieldValue(value, type) {
  if (type === 'attachment') return <AttachmentBadge value={value} />;
  return valueOrDash(value, type);
}

function getResolvedFieldValue(client, fieldKey) {
  if (!client || !fieldKey) return '';

  switch (fieldKey) {
    case 'competencia_em_dia':
      return isCompetenciaEmDia(client) ? 'Sim' : 'Não';
    case 'data_enviada_reinf':
      return getReinfDataEntregaValue(client);
    case 'cliente_notificado':
      return isClienteNotificado(client) ? 'Sim' : 'Não';
    case 'data_notificacao_cliente':
      return getDataNotificacaoClienteValue(client);
    case 'status_retorno_cliente': {
      const persisted = getAcompanhamentoText(client, 'status_retorno_cliente', client?.status_retorno_cliente || '').trim();
      if (persisted) return persisted;
      if (isSemRetorno(client)) return 'Sem retorno';
      if (hasRetornoConcluido(client)) return 'Retorno recebido';
      if (isAguardandoRetorno(client)) return 'Aguardando retorno';
      return '';
    }
    case 'data_retorno_cliente':
      return getDataRetornoClienteValue(client);
    default:
      return client?.[fieldKey];
  }
}

function renderResolvedFieldValue(client, fieldKey, type) {
  return renderFieldValue(getResolvedFieldValue(client, fieldKey), type);
}

function normalizeDateInputValue(value) {
  if (isBlank(value)) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/');
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function formatDateDisplay(value) {
  if (isBlank(value)) return 'Não informado';
  const normalized = normalizeDateInputValue(value);
  if (!normalized) return String(value);
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

function getObrigacoesPersistidas(client) {
  return client?._db_obrigacoes ?? {};
}

function getRiscoPersistido(client) {
  return client?._db_risco_operacional ?? {};
}

function getAcompanhamentoPersistido(client) {
  return client?._db_acompanhamento_operacional ?? {};
}

function hasObrigacoesPersistidas(client) {
  return Boolean(client?._db_obrigacoes);
}

function hasRiscoPersistido(client) {
  return Boolean(client?._db_risco_operacional);
}

function hasAcompanhamentoPersistido(client) {
  return Boolean(client?._db_acompanhamento_operacional);
}

function getObrigacaoFlag(client, key, fallback = false) {
  const value = getObrigacoesPersistidas(client)?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function getClientAnalysis(client) {
  return client?._analysis ?? analyzeClient(client);
}

function getRiscoFlag(client, key, fallback = false) {
  const value = getRiscoPersistido(client)?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function getAcompanhamentoFlag(client, key, fallback = false) {
  const value = getAcompanhamentoPersistido(client)?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function getAcompanhamentoNumber(client, key) {
  const value = getAcompanhamentoPersistido(client)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getAcompanhamentoText(client, key, fallback = '') {
  const value = getAcompanhamentoPersistido(client)?.[key];
  if (typeof value === 'string') return value;
  return fallback;
}

function getPersistedAcompanhamentoStatusCode(client) {
  if (!hasAcompanhamentoPersistido(client)) return '';

  const persistedCode = normalizeText(getAcompanhamentoText(client, 'status_acompanhamento_codigo', ''));
  if (persistedCode) return persistedCode;

  if (getAcompanhamentoFlag(client, 'sem_retorno', false)) return 'sem_retorno';
  if (getAcompanhamentoFlag(client, 'aguardando_retorno', false)) return 'aguardando_retorno';
  if (getAcompanhamentoFlag(client, 'retorno_recebido', false)) return 'retorno_recebido';
  if (getAcompanhamentoFlag(client, 'cliente_notificado_bool', false)) return 'notificado';
  return 'sem_notificacao';
}

function getPersistedAcompanhamentoStatusLabel(client) {
  if (!hasAcompanhamentoPersistido(client)) return '';

  const persistedLabel = getAcompanhamentoText(client, 'status_acompanhamento_label', '').trim();
  if (persistedLabel) return persistedLabel;

  const code = getPersistedAcompanhamentoStatusCode(client);
  if (code === 'sem_retorno') return 'Sem retorno';
  if (code === 'aguardando_retorno') return 'Aguardando retorno';
  if (code === 'retorno_recebido') return 'Retorno recebido';
  if (code === 'notificado') return 'Notificado';
  return 'Sem notificação';
}

function getPersistedRiscoCode(client) {
  if (!hasRiscoPersistido(client)) return '';

  const persisted = getRiscoPersistido(client);
  const persistedCode = normalizeText(persisted?.risco_codigo || '');
  if (persistedCode) return persistedCode;

  if (
    getRiscoFlag(client, 'situacao_critica', false)
    || getRiscoFlag(client, 'pendencia_tecnica', false)
    || getRiscoFlag(client, 'pendencia_critica', false)
  ) {
    return 'danger';
  }

  if (
    getRiscoFlag(client, 'em_atraso', false)
    || getRiscoFlag(client, 'has_pendencia', false)
    || getRiscoFlag(client, 'documentos_atrasados', false)
    || getRiscoFlag(client, 'ata_pendente', false)
    || Number(getRiscoPersistido(client)?.pendencias_obrigacoes_total ?? 0) > 0
  ) {
    return 'warning';
  }

  return 'ok';
}

function getPersistedRiscoLabel(client) {
  if (!hasRiscoPersistido(client)) return '';

  const persisted = getRiscoPersistido(client);
  const persistedLabel = String(persisted?.risco_label ?? '').trim();
  if (persistedLabel) return persistedLabel;

  const code = getPersistedRiscoCode(client);
  if (code === 'danger') return 'Critico';
  if (code === 'warning') return 'Atencao';
  return 'Em dia';
}

function getDiasAtrasoValue(client) {
  const persisted = getRiscoPersistido(client)?.dias_atraso;
  if (typeof persisted === 'number' && Number.isFinite(persisted)) return persisted;
  return Number(getClientAnalysis(client)?.diasAtraso || 0) || 0;
}

function isEmAtraso(client) {
  if (hasRiscoPersistido(client)) {
    if (getRiscoFlag(client, 'em_atraso', false)) return true;
    return getPersistedRiscoCode(client) === 'warning' && getDiasAtrasoValue(client) > 0;
  }
  return getRiscoFlag(client, 'em_atraso', getClientAnalysis(client).emAtraso);
}

function isCompetenciaEmDia(client) {
  const persisted = getRiscoPersistido(client)?.competencia_em_dia_bool;
  if (typeof persisted === 'boolean') return persisted;
  return isYes(client?.competencia_em_dia);
}

function isSituacaoCritica(client) {
  if (hasRiscoPersistido(client)) return getRiscoFlag(client, 'situacao_critica', false);
  return getRiscoFlag(client, 'situacao_critica', getClientAnalysis(client).situacaoCritica);
}

function isPendenciaTecnica(client) {
  if (hasRiscoPersistido(client)) return getRiscoFlag(client, 'pendencia_tecnica', false);
  return getRiscoFlag(client, 'pendencia_tecnica', getClientAnalysis(client).pendenciaTecnica);
}

function isDocumentoAtrasado(client) {
  if (hasRiscoPersistido(client)) return getRiscoFlag(client, 'documentos_atrasados', false);
  return getRiscoFlag(client, 'documentos_atrasados', getClientAnalysis(client).documentosAtrasados);
}

function isAtaPendente(client) {
  if (hasRiscoPersistido(client)) return getRiscoFlag(client, 'ata_pendente', false);
  return getRiscoFlag(client, 'ata_pendente', getClientAnalysis(client).ataPendente);
}

function hasPendenciaOperacional(client) {
  if (hasRiscoPersistido(client)) {
    if (getRiscoFlag(client, 'has_pendencia', false)) return true;
    return getPersistedRiscoCode(client) === 'danger' || getPersistedRiscoCode(client) === 'warning';
  }
  return getRiscoFlag(client, 'has_pendencia', getClientAnalysis(client).hasPendencia);
}

function getDataNotificacaoClienteValue(client) {
  return normalizeDateInputValue(
    getAcompanhamentoText(client, 'data_notificacao_cliente', client?.data_notificacao_cliente || ''),
  );
}

function getDataRetornoClienteValue(client) {
  return normalizeDateInputValue(
    getAcompanhamentoText(client, 'data_retorno_cliente', client?.data_retorno_cliente || ''),
  );
}

function getPrazoProximaAcaoValue(client) {
  return '';
}

function getStatusRetornoClienteValue(client) {
  return normalizeText(
    getAcompanhamentoText(client, 'status_retorno_cliente', client?.status_retorno_cliente || ''),
  );
}

function hasRetornoConcluido(client) {
  if (hasAcompanhamentoPersistido(client)) {
    if (getAcompanhamentoFlag(client, 'retorno_recebido', false)) return true;
    return getPersistedAcompanhamentoStatusCode(client) === 'retorno_recebido';
  }
  if (getAcompanhamentoFlag(client, 'retorno_recebido', false)) return true;
  const status = getStatusRetornoClienteValue(client);
  return status === normalizeText('Retorno recebido') || status === normalizeText('Concluido');
}

function isAguardandoRetorno(client) {
  if (hasAcompanhamentoPersistido(client)) {
    if (getAcompanhamentoFlag(client, 'aguardando_retorno', false)) return true;
    const persistedCode = getPersistedAcompanhamentoStatusCode(client);
    return persistedCode === 'aguardando_retorno' || persistedCode === 'sem_retorno';
  }
  const fallback = (() => {
    if (!isYes(client?.cliente_notificado)) return false;
    if (hasRetornoConcluido(client)) return false;
    const status = getStatusRetornoClienteValue(client);
    return !status || status === normalizeText('Aguardando retorno') || status === normalizeText('Sem retorno');
  })();
  return fallback;
}

function isSemRetorno(client) {
  if (hasAcompanhamentoPersistido(client)) {
    if (getAcompanhamentoFlag(client, 'sem_retorno', false)) return true;
    return getPersistedAcompanhamentoStatusCode(client) === 'sem_retorno';
  }
  const fallback = isYes(client?.cliente_notificado)
    && !hasRetornoConcluido(client)
    && getStatusRetornoClienteValue(client) === normalizeText('Sem retorno');
  return fallback;
}

function isClienteNotificado(client) {
  if (hasAcompanhamentoPersistido(client)) {
    if (getAcompanhamentoFlag(client, 'cliente_notificado_bool', false)) return true;
    return getPersistedAcompanhamentoStatusCode(client) !== 'sem_notificacao';
  }
  const fallback = isYes(client?.cliente_notificado);
  return fallback;
}

function getDiasSemRetorno(client) {
  const persisted = getAcompanhamentoNumber(client, 'dias_sem_retorno');
  if (persisted !== null) return persisted;
  const data = getDataNotificacaoClienteValue(client);
  if (!data || !isAguardandoRetorno(client)) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const notificadoEm = new Date(`${data}T00:00:00`);
  if (Number.isNaN(notificadoEm.getTime())) return null;
  return Math.round((startToday.getTime() - notificadoEm.getTime()) / 86400000);
}

function hasAcompanhamentoPendente(client) {
  if (hasAcompanhamentoPersistido(client)) {
    if (getAcompanhamentoFlag(client, 'acompanhamento_pendente', false)) return true;
    const persistedCode = getPersistedAcompanhamentoStatusCode(client);
    return persistedCode === 'aguardando_retorno' || persistedCode === 'sem_retorno';
  }
  const fallback =
    isComunicacaoPendente(client)
    || isAguardandoRetorno(client);
  return fallback;
}

function hasComunicacaoOuRetornoPendente(client) {
  return getClientAlertSignals(client).some((alert) => ['comunicacao', 'retorno'].includes(alert.key));
}

function getStatusAcompanhamentoLabel(client) {
  if (hasAcompanhamentoPersistido(client)) {
    return getPersistedAcompanhamentoStatusLabel(client) || 'Sem notificação';
  }
  const fallback = (() => {
    if (isSemRetorno(client)) return 'Sem retorno';
    if (isAguardandoRetorno(client)) return 'Aguardando retorno';
    if (hasRetornoConcluido(client)) return 'Retorno recebido';
    if (isClienteNotificado(client)) return 'Notificado';
    return 'Sem notificação';
  })();
  return getAcompanhamentoText(client, 'status_acompanhamento_label', fallback) || fallback;
}

function getStatusAcompanhamentoCodigo(client) {
  if (hasAcompanhamentoPersistido(client)) {
    return getPersistedAcompanhamentoStatusCode(client) || 'sem_notificacao';
  }
  const fallback = (() => {
    if (isSemRetorno(client)) return 'sem_retorno';
    if (isAguardandoRetorno(client)) return 'aguardando_retorno';
    if (hasRetornoConcluido(client)) return 'retorno_recebido';
    if (isClienteNotificado(client)) return 'notificado';
    return 'sem_notificacao';
  })();
  return normalizeText(getAcompanhamentoText(client, 'status_acompanhamento_codigo', fallback) || fallback);
}

function getResponsavelOperacional(client) {
  return getObrigacaoResponsavel(client) || normalizeTeamMemberDisplayName(client?.responsavel) || '';
}

function getObrigacaoResponsavel(client) {
  return normalizeTeamMemberDisplayName(
    getObrigacoesPersistidas(client)?.responsavel_exibicao || client?.responsavel_ecd || client?.responsavel || '',
  );
}

function getPersistedReinfStatusCode(client) {
  if (!hasObrigacoesPersistidas(client)) return '';

  const persisted = getObrigacoesPersistidas(client);
  const persistedCode = normalizeText(persisted?.reinf_status_codigo || '');
  if (persistedCode) return persistedCode;

  if (getObrigacaoFlag(client, 'reinf_comprovante_anexado', false)) return 'concluido';
  if (getObrigacaoFlag(client, 'reinf_pendente', false)) return 'em_atraso';
  if (getObrigacaoFlag(client, 'recibo_reinf_pendente', false)) return 'aguardando_envio';
  if (persisted?.reinf_data_entrega) return 'aguardando_envio';
  return 'sem_data';
}

function getPersistedReinfStatusLabel(client) {
  if (!hasObrigacoesPersistidas(client)) return '';

  const persisted = getObrigacoesPersistidas(client);
  const persistedLabel = String(persisted?.reinf_status_label ?? '').trim();
  if (persistedLabel) return persistedLabel;

  const code = getPersistedReinfStatusCode(client);
  if (code === 'concluido') return 'Concluído';
  if (code === 'em_atraso') return 'Em atraso';
  if (code === 'aguardando_envio') return 'Aguardando envio';
  return 'Sem data';
}

function getPersistedObrigacoesStatusCode(client) {
  if (!hasObrigacoesPersistidas(client)) return '';

  const persisted = getObrigacoesPersistidas(client);
  const persistedCode = normalizeText(persisted?.obrigacoes_status_codigo || '');
  if (persistedCode) return persistedCode;

  if (getObrigacaoFlag(client, 'ecd_pendente', false) || getObrigacaoFlag(client, 'ecf_pendente', false)) {
    return 'obrigacao_pendente';
  }
  if (getObrigacaoFlag(client, 'ecd_aguardando_envio', false)) return 'aguardando_envio';
  if (getObrigacaoFlag(client, 'ecd_responsavel_pendente', false)) return 'responsavel_pendente';
  if (getObrigacaoFlag(client, 'recibo_ecd_pendente', false) || getObrigacaoFlag(client, 'recibo_ecf_pendente', false)) {
    return 'comprovante_pendente';
  }
  return 'em_dia';
}

function getPersistedObrigacoesStatusLabel(client) {
  if (!hasObrigacoesPersistidas(client)) return '';

  const persisted = getObrigacoesPersistidas(client);
  const persistedLabel = String(persisted?.obrigacoes_status_label ?? '').trim();
  if (persistedLabel) return persistedLabel;

  const code = getPersistedObrigacoesStatusCode(client);
  if (code === 'obrigacao_pendente') return 'Obrigação pendente';
  if (code === 'aguardando_envio') return 'Aguardando envio';
  if (code === 'responsavel_pendente') return 'Responsável pendente';
  if (code === 'comprovante_pendente') return 'Comprovante pendente';
  return 'Em dia';
}

function getReinfDataEntregaValue(client) {
  return getObrigacoesPersistidas(client)?.reinf_data_entrega || client?.data_enviada_reinf || '';
}

function hasObrigacaoComprovante(client, key, fallbackField) {
  return hasAttachment(client?.[fallbackField]) || getObrigacaoFlag(client, key, false);
}

function isReinfEnviada(client) {
  if (hasObrigacoesPersistidas(client)) {
    return getPersistedReinfStatusCode(client) === 'concluido'
      || hasObrigacaoComprovante(client, 'reinf_comprovante_anexado', 'anexo_recibo_reinf');
  }
  return isYes(client?.envio_reinf) || hasAttachment(client?.anexo_recibo_reinf);
}

function isReinfPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'reinf_pendente', false)) return true;
    return getPersistedReinfStatusCode(client) === 'em_atraso';
  }
  return getObrigacaoFlag(client, 'reinf_pendente', getClientAnalysis(client).reinfPendente);
}

function isReciboReinfPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'recibo_reinf_pendente', false)) return true;
    const persistedCode = getPersistedReinfStatusCode(client);
    return persistedCode === 'aguardando_envio' || persistedCode === 'em_atraso';
  }
  return getObrigacaoFlag(client, 'recibo_reinf_pendente', getClientAnalysis(client).reciboReinfPendente);
}

function isEcdPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'ecd_pendente', false)) return true;
    return normalizeText(getObrigacoesPersistidas(client)?.ecd_status_codigo || '') === 'obrigacao_pendente';
  }
  return getObrigacaoFlag(client, 'ecd_pendente', getClientAnalysis(client).ecdPendente);
}

function isEcdAguardandoEnvio(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'ecd_aguardando_envio', false)) return true;
    return normalizeText(getObrigacoesPersistidas(client)?.ecd_status_codigo || '') === 'aguardando_envio';
  }
  return getObrigacaoFlag(client, 'ecd_aguardando_envio', getClientAnalysis(client).ecdAguardandoEnvio);
}

function isEcfAguardandoEnvio(client) {
  return getObrigacaoFlag(client, 'ecf_aguardando_envio', getClientAnalysis(client).ecfAguardandoEnvio);
}

function isEcdResponsavelPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'ecd_responsavel_pendente', false)) return true;
    return normalizeText(getObrigacoesPersistidas(client)?.ecd_status_codigo || '') === 'responsavel_pendente';
  }
  return getObrigacaoFlag(client, 'ecd_responsavel_pendente', getClientAnalysis(client).ecdResponsavelPendente);
}

function isReciboEcdPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'recibo_ecd_pendente', false)) return true;
    return normalizeText(getObrigacoesPersistidas(client)?.ecd_status_codigo || '') === 'comprovante_pendente';
  }
  return getObrigacaoFlag(client, 'recibo_ecd_pendente', getClientAnalysis(client).reciboEcdPendente);
}

function isEcfPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'ecf_pendente', false)) return true;
    return normalizeText(getObrigacoesPersistidas(client)?.ecf_status_codigo || '') === 'obrigacao_pendente';
  }
  return getObrigacaoFlag(client, 'ecf_pendente', getClientAnalysis(client).ecfPendente);
}

function isReciboEcfPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'recibo_ecf_pendente', false)) return true;
    return normalizeText(getObrigacoesPersistidas(client)?.ecf_status_codigo || '') === 'comprovante_pendente';
  }
  return getObrigacaoFlag(client, 'recibo_ecf_pendente', getClientAnalysis(client).reciboEcfPendente);
}

function isComunicacaoPendente(client) {
  if (hasObrigacoesPersistidas(client)) {
    if (getObrigacaoFlag(client, 'comunicacao_pendente', false)) return true;
    return Boolean(getObrigacoesPersistidas(client)?.possui_pendencia_obrigacao) && !isClienteNotificado(client);
  }
  return getObrigacaoFlag(client, 'comunicacao_pendente', getClientAnalysis(client).comunicacaoPendente);
}

function isPendenciaCritica(client) {
  if (hasObrigacoesPersistidas(client)) return getObrigacaoFlag(client, 'pendencia_critica', false);
  return getObrigacaoFlag(client, 'pendencia_critica', isSituacaoCritica(client) || isPendenciaTecnica(client));
}

function hasPendenciaObrigacaoEcd(client) {
  return getEcdEcfObrigacaoStatus(client, 'ecd').code !== 'em_dia';
}

function hasPendenciaObrigacaoEcf(client) {
  return getEcdEcfObrigacaoStatus(client, 'ecf').code !== 'em_dia';
}

function hasEcdEcfStatusEvidence(client, tipo = 'ecd') {
  const isEcf = tipo === 'ecf';
  const obrigacaoKey = isEcf ? 'ecf' : 'ecd';
  const ultimaKey = isEcf ? 'ultima_ecf_entregue' : 'ultima_ecd_entregue';
  const entregaKey = isEcf ? 'data_entrega_ecf' : 'data_entrega_ecd';
  const envioKey = isEcf ? 'data_envio_ecf' : 'data_envio_ecd';
  const anexoKey = isEcf ? 'anexo_recibo_ecf' : 'anexo_recibo_ecd';
  const responsavelKey = isEcf ? '' : 'responsavel_ecd';

  return (
    isYes(client?.[obrigacaoKey])
    || !isBlank(client?.[ultimaKey])
    || !isBlank(client?.[entregaKey])
    || !isBlank(client?.[envioKey])
    || hasObrigacaoComprovante(client, isEcf ? 'ecf_comprovante_anexado' : 'ecd_comprovante_anexado', anexoKey)
    || (!isEcf && !isBlank(getObrigacaoResponsavel(client) || client?.[responsavelKey]))
  );
}

function getEcdEcfCurrentStatus(client, tipo = 'ecd') {
  const isEcf = tipo === 'ecf';
  const obrigacaoKey = isEcf ? 'ecf' : 'ecd';
  const ultimaKey = isEcf ? 'ultima_ecf_entregue' : 'ultima_ecd_entregue';
  const entregaKey = isEcf ? 'data_entrega_ecf' : 'data_entrega_ecd';
  const anexoKey = isEcf ? 'anexo_recibo_ecf' : 'anexo_recibo_ecd';
  const anexoFlagKey = isEcf ? 'ecf_comprovante_anexado' : 'ecd_comprovante_anexado';
  const tipoLabel = isEcf ? 'ECF' : 'ECD';
  const obrigatoria = isYes(client?.[obrigacaoKey]);
  const entrega = client?.[entregaKey];
  const envio = getEcdEcfSentDateValue(client, tipo);
  const hasRecibo = hasObrigacaoComprovante(client, anexoFlagKey, anexoKey);

  if (!hasEcdEcfStatusEvidence(client, tipo)) return null;
  if (obrigatoria && isBlank(client?.[ultimaKey])) return { code: 'comprovante_pendente', label: `Recibo ${tipoLabel} pendente`, tone: 'warning' };
  if (!isBlank(entrega) && isBlank(envio)) return { code: 'aguardando_envio', label: `Aguardando envio da ${tipoLabel}`, tone: 'warning' };
  if (!isEcf && obrigatoria && isBlank(getObrigacaoResponsavel(client))) return { code: 'responsavel_pendente', label: 'Responsável pendente', tone: 'warning' };
  if (obrigatoria && !hasRecibo) return { code: 'comprovante_pendente', label: `Recibo ${tipoLabel} pendente`, tone: 'warning' };
  return { code: 'em_dia', label: 'Em dia', tone: 'success' };
}

function getPersistedEcdEcfStatus(client, tipo = 'ecd') {
  const isEcf = tipo === 'ecf';
  const persisted = getObrigacoesPersistidas(client);
  const persistedCode = normalizeText(persisted?.[isEcf ? 'ecf_status_codigo' : 'ecd_status_codigo'] || '');

  if (!persistedCode) return null;

  const tipoLabel = isEcf ? 'ECF' : 'ECD';
  const labelMap = {
    obrigacao_pendente: `Recibo ${tipoLabel} pendente`,
    aguardando_envio: `Aguardando envio da ${tipoLabel}`,
    responsavel_pendente: 'Responsável pendente',
    comprovante_pendente: `Recibo ${tipoLabel} pendente`,
    em_dia: 'Em dia',
    concluido: 'Em dia',
  };
  const toneMap = {
    obrigacao_pendente: 'warning',
    aguardando_envio: 'warning',
    responsavel_pendente: 'warning',
    comprovante_pendente: 'warning',
    em_dia: 'success',
    concluido: 'success',
  };

  const codeMap = {
    obrigacao_pendente: 'comprovante_pendente',
    concluido: 'em_dia',
  };

  return {
    code: codeMap[persistedCode] || persistedCode,
    label: labelMap[persistedCode] || 'Status',
    tone: toneMap[persistedCode] || 'neutral',
  };
}

function getEcdEcfObrigacaoStatus(client, tipo = 'ecd') {
  return getEcdEcfCurrentStatus(client, tipo)
    || getPersistedEcdEcfStatus(client, tipo)
    || { code: 'em_dia', label: 'Em dia', tone: 'success' };
}

function matchesEcdEcfStatusMode(client, mode, tipo = 'ecd') {
  if (mode === 'todos') return true;

  const isEcf = tipo === 'ecf';
  const statusCode = getEcdEcfObrigacaoStatus(client, tipo).code;
  if (mode === 'em-dia') return statusCode === 'em_dia';
  if (mode === 'ecd-pendente') return !isEcf && ['obrigacao_pendente', 'comprovante_pendente'].includes(statusCode);
  if (mode === 'ecf-pendente') return isEcf && ['obrigacao_pendente', 'comprovante_pendente'].includes(statusCode);
  if (mode === 'aguardando-envio') return statusCode === 'aguardando_envio';
  if (mode === 'sem-responsavel') return !isEcf && statusCode === 'responsavel_pendente';
  if (mode === 'comprovante-pendente') return ['obrigacao_pendente', 'comprovante_pendente'].includes(statusCode);
  return true;
}

function hasComprovanteObrigacaoPendente(client) {
  return isReciboReinfPendente(client) || isReciboEcdPendente(client) || isReciboEcfPendente(client);
}

function hasObrigacaoAnual(client) {
  return isYes(client?.ecd) || isYes(client?.ecf);
}

function hasPendenciaAtiva(client) {
  return hasPendenciaOperacional(client) || hasAcompanhamentoPendente(client);
}

function hasPendenciaAtrasada(client) {
  if (isEmAtraso(client)) return true;
  if (hasObrigacoesPersistidas(client)) return getPersistedReinfStatusCode(client) === 'em_atraso';
  return isReinfPendente(client);
}

function getClientAlertSignals(client) {
  const diasAtraso = getDiasAtrasoValue(client);
  const dataNotificacao = getDataNotificacaoClienteValue(client);
  return [
    isEmAtraso(client) && {
      key: 'atraso',
      label: diasAtraso > 0 ? `${diasAtraso} dia(s) de atraso` : 'Competencia em atraso',
      tone: 'danger',
    },
    isSituacaoCritica(client) && { key: 'critico', label: 'Situação crítica', tone: 'danger' },
    isReinfPendente(client) && { key: 'reinf', label: 'Distribuição de lucro pendente', tone: 'warning' },
    isReciboReinfPendente(client) && { key: 'recibo_reinf', label: 'Comprovante de distribuição de lucro pendente', tone: 'warning' },
    isEcdPendente(client) && { key: 'ecd', label: 'ECD pendente', tone: 'warning' },
    isEcdAguardandoEnvio(client) && { key: 'ecd_envio', label: 'Aguardando envio', tone: 'warning' },
    isEcdResponsavelPendente(client) && { key: 'ecd_responsavel', label: 'Responsável não definido', tone: 'warning' },
    isReciboEcdPendente(client) && { key: 'recibo_ecd', label: 'Recibo ECD pendente', tone: 'warning' },
    isEcfPendente(client) && { key: 'ecf', label: 'ECF pendente', tone: 'warning' },
    isReciboEcfPendente(client) && { key: 'recibo_ecf', label: 'Recibo ECF pendente', tone: 'warning' },
    isPendenciaTecnica(client) && { key: 'tecnica', label: 'Pendência técnica', tone: 'danger' },
    isDocumentoAtrasado(client) && { key: 'documentos', label: 'Documentação atrasada', tone: 'warning' },
    isComunicacaoPendente(client) && { key: 'comunicacao', label: 'Comunicação pendente', tone: 'info' },
    isAguardandoRetorno(client) && {
      key: 'retorno',
      label: dataNotificacao
        ? `Aguardando retorno desde ${formatDateDisplay(dataNotificacao)}`
        : 'Aguardando retorno do cliente',
      tone: isSemRetorno(client) ? 'danger' : 'warning',
    },
    isAtaPendente(client) && { key: 'ata', label: 'Ata pendente', tone: 'warning' },
  ].filter(Boolean);
}
const PENDENCIA_ACTION_BY_SIGNAL = {
  reinf: { key: 'reinf', area: 'Distribuição de Lucro', route: 'reinf', priority: 95, priorityLabel: 'Alta', nextAction: 'Revisar envio e prazo da distribuição de lucro.' },
  recibo_reinf: { key: 'reinf', area: 'Distribuição de Lucro', route: 'reinf', priority: 90, priorityLabel: 'Alta', nextAction: 'Anexar comprovante da distribuição de lucro.' },
  ecd: { key: 'ecd', area: 'ECD', route: 'ecd', priority: 78, priorityLabel: 'Média', nextAction: 'Validar status e envio da ECD.' },
  ecd_envio: { key: 'ecd', area: 'ECD', route: 'ecd', priority: 78, priorityLabel: 'Média', nextAction: 'Validar status e envio da ECD.' },
  ecd_responsavel: { key: 'ecd', area: 'ECD', route: 'ecd', priority: 72, priorityLabel: 'Média', nextAction: 'Definir responsável pela ECD.' },
  recibo_ecd: { key: 'ecd', area: 'ECD', route: 'ecd', priority: 82, priorityLabel: 'Alta', nextAction: 'Anexar recibo da ECD.' },
  ecf: { key: 'ecf', area: 'ECF', route: 'ecd', priority: 76, priorityLabel: 'Média', nextAction: 'Validar status da ECF.' },
  ecf_envio: { key: 'ecf_envio', area: 'ECF', route: 'ecd', priority: 77, priorityLabel: 'Média', nextAction: 'Confirmar envio da ECF.' },
  recibo_ecf: { key: 'ecf', area: 'ECF', route: 'ecd', priority: 80, priorityLabel: 'Alta', nextAction: 'Anexar recibo da ECF.' },
  documentos: { key: 'documentos', area: 'Documentação', route: 'cliente', priority: 68, priorityLabel: 'Média', nextAction: 'Cobrar documentos e registrar retorno do cliente.' },
  ata: { key: 'ata', area: 'Ata', route: 'cliente', priority: 66, priorityLabel: 'Média', nextAction: 'Solicitar entrega da ata e registrar a data de recebimento.' },
  comunicacao: { key: 'comunicacao', area: 'Comunicação', route: 'cliente', priority: 70, priorityLabel: 'Média', nextAction: 'Notificar cliente e registrar retorno.' },
  retorno: { key: 'acompanhamento', area: 'Retorno', route: 'cliente', priority: 74, priorityLabel: 'Média', nextAction: 'Registrar contato e acompanhar retorno do cliente.' },
};

function AttachmentCell({ client, fieldKey, tipoAnexo, disabled, onSuccess, onRemove, onError }) {
  const anexo = fieldValueToAnexo(client[fieldKey], tipoAnexo, client);

  return (
    <div className="base-client-attachment-cell" onClick={(event) => event.stopPropagation()}>
      <AttachmentBadge value={client[fieldKey]} />
      <UploadAnexoButton
        cliente={client}
        tipoAnexo={tipoAnexo}
        anexo={anexo}
        disabled={disabled}
        onSuccess={(novoAnexo) => onSuccess?.(client.id, tipoAnexo, novoAnexo)}
        onRemove={(anexoRemovido) => onRemove?.(client.id, tipoAnexo, anexoRemovido ?? anexo)}
        onError={onError}
        labelAnexar="Anexar"
        labelSubstituir="Substituir"
      />
    </div>
  );
}

function ReinfAttachmentSentDateCell({ client }) {
  const attachment = parseAttachment(client.anexo_recibo_reinf);
  const dataPersistida = getObrigacoesPersistidas(client)?.reinf_data_enviada;
  const rawDate = dataPersistida || attachment.attachedAt || '';

  if (!rawDate) {
    return <span className="text-sm font-semibold text-slate-400">-</span>;
  }

  return <span className="font-semibold text-slate-700">{formatDateDisplay(rawDate)}</span>;
}

function getReinfSocioOptionKey(socio, index = 0) {
  const id = String(socio?.id ?? '').trim();
  if (id) return id;
  const cpf = normalizeCpfDigits(socio?.cpf);
  if (cpf) return cpf;
  return `${String(socio?.nome ?? '').trim()}-${index}`;
}

function getReinfSocios(client) {
  return normalizeSociosClienteInput(client?._socios ?? []);
}

function getSelectedReinfSocio(client, selectedSocioByClientId = {}) {
  const socios = getReinfSocios(client);
  if (!socios.length) return null;

  const clientKey = String(client?.id ?? client?.cnpj ?? '').trim();
  const selectedKey = selectedSocioByClientId[clientKey];
  if (!selectedKey) return socios[0];

  return socios.find((socio, index) => getReinfSocioOptionKey(socio, index) === selectedKey) ?? socios[0];
}

function ReinfSocioDropdownCell({ client, selectedSocioByClientId, onSelect }) {
  const socios = getReinfSocios(client);
  const clientKey = String(client?.id ?? client?.cnpj ?? '').trim();
  const selectedSocio = getSelectedReinfSocio(client, selectedSocioByClientId);
  const selectedIndex = selectedSocio ? socios.indexOf(selectedSocio) : 0;
  const value = selectedSocio ? getReinfSocioOptionKey(selectedSocio, selectedIndex) : '';

  if (!socios.length) {
    return (
      <DropdownFilterSelect
        label=""
        value=""
        options={[]}
        includeBlank
        emptyLabel="Sem sócio"
        disabled
        labelClassName="block"
        buttonClassName="input-shell reinf-socio-select h-10 text-sm"
      />
    );
  }

  return (
    <DropdownFilterSelect
      label=""
      value={value}
      options={socios.map((socio, index) => ({
        value: getReinfSocioOptionKey(socio, index),
        label: socio.nome || 'Sócio sem nome',
      }))}
      onChange={(nextValue) => onSelect?.(clientKey, nextValue)}
      includeBlank={false}
      labelClassName="block"
      buttonClassName="input-shell reinf-socio-select h-10 text-sm"
    />
  );
}

function ReinfSocioCpfCell({ client, selectedSocioByClientId }) {
  const selectedSocio = getSelectedReinfSocio(client, selectedSocioByClientId);
  if (!selectedSocio?.cpf) return null;

  return (
    <span className="reinf-cpf-value font-semibold text-slate-700 dark:text-gray-200">
      {formatCpfInput(selectedSocio.cpf)}
    </span>
  );
}

const REINF_MONTH_OPTIONS = [
  { value: 'janeiro', label: 'Janeiro' },
  { value: 'fevereiro', label: 'Fevereiro' },
  { value: 'marco', label: 'Março' },
  { value: 'abril', label: 'Abril' },
  { value: 'maio', label: 'Maio' },
  { value: 'junho', label: 'Junho' },
  { value: 'julho', label: 'Julho' },
  { value: 'agosto', label: 'Agosto' },
  { value: 'setembro', label: 'Setembro' },
  { value: 'outubro', label: 'Outubro' },
  { value: 'novembro', label: 'Novembro' },
  { value: 'dezembro', label: 'Dezembro' },
];

const REINF_VALUE_MONTHLY_THRESHOLD = 50000;
const REINF_TABLE_MODEL_MONTHLY = 'valores_por_mes';
const REINF_TABLE_MODEL_TOTALS = 'totais_distribuidos';
const REINF_TABLE_MODEL_OPTIONS = [
  { value: REINF_TABLE_MODEL_MONTHLY, label: 'Tabela por meses' },
  { value: REINF_TABLE_MODEL_TOTALS, label: 'Tabela de totais' },
];
const REINF_RETIFICATION_NOTICE = 'Retificação do e-mail enviado';
const REINF_TOTAL_FIELD_OPTIONS = [
  { key: 'totalDistribuidoIsentoAta', label: 'Total distribuido isento (ATA)' },
  { key: 'totalDistribuidoTributavel', label: 'Total distribuido tributavel' },
];

function createEmptyReinfTotalValues() {
  return REINF_TOTAL_FIELD_OPTIONS.reduce((values, field) => ({
    ...values,
    [field.key]: '',
  }), {});
}

function isReinfTotalsTableModel(modeloTabela) {
  return modeloTabela === REINF_TABLE_MODEL_TOTALS;
}

function getReinfTableModelLabel(modeloTabela) {
  return REINF_TABLE_MODEL_OPTIONS.find((option) => option.value === modeloTabela)?.label || 'Tabela por meses';
}

function getReinfReportSocioTotals(reportSocio) {
  return reportSocio?.valoresTotais ?? reportSocio?.valores_totais ?? {};
}

function getReinfReportSocioMonthlyTotals(reportSocio) {
  return reportSocio?.valoresTotaisPorMes ?? reportSocio?.valores_totais_por_mes ?? {};
}

function getReinfTotalMonthlyValue(reportSocio, fieldKey, month) {
  const monthlyTotals = getReinfReportSocioMonthlyTotals(reportSocio);
  const fieldValues = monthlyTotals?.[fieldKey] ?? {};
  const value = fieldValues?.[month];
  if (String(value ?? '').trim()) return value;
  if (fieldKey === 'totalDistribuidoTributavel') {
    return reportSocio?.valoresPorMes?.[month] ?? reportSocio?.valores_por_mes?.[month] ?? '';
  }
  return '';
}

function getReinfReportSocioMonthValue(reportSocio, month) {
  return reportSocio?.valoresPorMes?.[month] ?? reportSocio?.valores_por_mes?.[month] ?? '';
}

function createEmptyReinfHistoryMarks() {
  return {
    valoresPorMes: {},
    valoresTotaisPorMes: {},
  };
}

function markReinfHistoryMonthlyValue(currentMarks, month) {
  return {
    ...(currentMarks ?? createEmptyReinfHistoryMarks()),
    valoresPorMes: {
      ...(currentMarks?.valoresPorMes ?? {}),
      [month]: true,
    },
  };
}

function markReinfHistoryTotalValue(currentMarks, fieldKey, month) {
  return {
    ...(currentMarks ?? createEmptyReinfHistoryMarks()),
    valoresTotaisPorMes: {
      ...(currentMarks?.valoresTotaisPorMes ?? {}),
      [fieldKey]: {
        ...(currentMarks?.valoresTotaisPorMes?.[fieldKey] ?? {}),
        [month]: true,
      },
    },
  };
}

function clearReinfHistoryMarksForMonth(currentMarks, month) {
  const nextMarks = {
    valoresPorMes: { ...(currentMarks?.valoresPorMes ?? {}) },
    valoresTotaisPorMes: {},
  };
  delete nextMarks.valoresPorMes[month];
  Object.entries(currentMarks?.valoresTotaisPorMes ?? {}).forEach(([fieldKey, values]) => {
    nextMarks.valoresTotaisPorMes[fieldKey] = { ...(values ?? {}) };
    delete nextMarks.valoresTotaisPorMes[fieldKey][month];
  });
  return nextMarks;
}

function clearReinfHistoryMonthlyValue(currentMarks, month) {
  const nextMarks = {
    ...(currentMarks ?? createEmptyReinfHistoryMarks()),
    valoresPorMes: {
      ...(currentMarks?.valoresPorMes ?? {}),
    },
  };
  delete nextMarks.valoresPorMes[month];
  return nextMarks;
}

function clearReinfHistoryTotalValue(currentMarks, fieldKey, month) {
  const nextMarks = {
    ...(currentMarks ?? createEmptyReinfHistoryMarks()),
    valoresTotaisPorMes: {
      ...(currentMarks?.valoresTotaisPorMes ?? {}),
      [fieldKey]: {
        ...(currentMarks?.valoresTotaisPorMes?.[fieldKey] ?? {}),
      },
    },
  };
  delete nextMarks.valoresTotaisPorMes[fieldKey][month];
  return nextMarks;
}

function isReinfHistoryMonthlyValue(reportSocio, month) {
  return Boolean(reportSocio?.valoresHistorico?.valoresPorMes?.[month]);
}

function isReinfHistoryTotalValue(reportSocio, fieldKey, month) {
  return Boolean(reportSocio?.valoresHistorico?.valoresTotaisPorMes?.[fieldKey]?.[month]);
}

function hasReinfHistoryValues(reportSocios = [], months = [], isTotalsModel = false) {
  return (reportSocios ?? []).some((reportSocio) => {
    if (isTotalsModel) {
      return months.some((month) => (
        REINF_TOTAL_FIELD_OPTIONS.some((field) => isReinfHistoryTotalValue(reportSocio, field.key, month))
      ));
    }
    return (reportSocio?.meses ?? []).some((month) => isReinfHistoryMonthlyValue(reportSocio, month));
  });
}

function markReinfReportSociosAsHistory(reportSocios = [], months = [], isTotalsModel = false) {
  return (reportSocios ?? []).map((reportSocio) => {
    let nextMarks = reportSocio?.valoresHistorico ?? createEmptyReinfHistoryMarks();
    let changed = false;

    if (isTotalsModel) {
      (months ?? []).forEach((month) => {
        REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
          const value = getReinfTotalMonthlyValue(reportSocio, field.key, month);
          if (!String(value ?? '').trim()) return;
          nextMarks = markReinfHistoryTotalValue(nextMarks, field.key, month);
          if (field.key === 'totalDistribuidoTributavel') {
            nextMarks = markReinfHistoryMonthlyValue(nextMarks, month);
          }
          changed = true;
        });
      });
      return changed ? { ...reportSocio, valoresHistorico: nextMarks } : reportSocio;
    }

    (reportSocio?.meses ?? [])
      .filter((month) => (months ?? []).includes(month))
      .forEach((month) => {
        const value = getReinfReportSocioMonthValue(reportSocio, month);
        if (!String(value ?? '').trim()) return;
        nextMarks = markReinfHistoryMonthlyValue(nextMarks, month);
        nextMarks = markReinfHistoryTotalValue(nextMarks, 'totalDistribuidoTributavel', month);
        changed = true;
      });

    return changed ? { ...reportSocio, valoresHistorico: nextMarks } : reportSocio;
  });
}

function getReinfHistoryInputClassName(isHistoryValue, isRetificationEnabled = false) {
  if (!isHistoryValue) return 'form-control-shell mt-1';
  return `form-control-shell mt-1 border-amber-300/70 bg-amber-50/60 text-slate-600 opacity-90 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-gray-300 ${isRetificationEnabled ? '' : 'cursor-not-allowed'}`;
}

function hasReinfTotalsValues(reportSocios = [], months = []) {
  return (reportSocios ?? []).some((reportSocio) => {
    const valoresPorMes = reportSocio?.valoresPorMes ?? {};
    const sourceMonths = months.length ? months : Object.keys(valoresPorMes);

    return (
      REINF_TOTAL_FIELD_OPTIONS.some((field) => parseCurrencyNumber(getReinfReportSocioTotals(reportSocio)?.[field.key]) > 0)
      || REINF_TOTAL_FIELD_OPTIONS.some((field) => (
        sourceMonths.some((month) => parseCurrencyNumber(getReinfTotalMonthlyValue(reportSocio, field.key, month)) > 0)
      ))
    );
  });
}

function getReinfTotalsMonthlySum(reportSocio, fieldKey, months = []) {
  return (months ?? []).reduce((sum, month) => (
    sum + parseCurrencyNumber(getReinfTotalMonthlyValue(reportSocio, fieldKey, month))
  ), 0);
}

function getReinfTotalsDisplayValue(reportSocio, fieldKey, months = []) {
  if (months.length) {
    const monthlyTotal = getReinfTotalsMonthlySum(reportSocio, fieldKey, months);
    if (monthlyTotal) return formatCurrencyDisplay(monthlyTotal);
  }
  return formatCurrencyDisplay(getReinfReportSocioTotals(reportSocio)?.[fieldKey]) || '';
}

function getReinfTotalsTableRows(reportSocios = [], months = []) {
  const sourceSocios = reportSocios.length
    ? reportSocios
    : [{ socio: { nome: 'Sem sócio', cpf: '' }, valoresPorMes: {}, valoresTotais: {} }];
  const sourceMonths = months.length ? months : [''];

  return sourceSocios.flatMap((reportSocio) => {
    const monthRows = sourceMonths.map((month, monthIndex) => ({
      reportSocio,
      month,
      monthIndex,
      isTotal: false,
      socioNome: reportSocio.socio?.nome || 'Sócio não informado',
      socioCpf: reportSocio.socio?.cpf ? formatCpfInput(reportSocio.socio.cpf) : '',
      monthLabel: month ? getReinfMonthLabel(month) : '',
      tributavel: month
        ? formatCurrencyDisplay(getReinfTotalMonthlyValue(reportSocio, 'totalDistribuidoTributavel', month)) || ''
        : getReinfTotalsDisplayValue(reportSocio, 'totalDistribuidoTributavel', months),
      isentoAta: month
        ? formatCurrencyDisplay(getReinfTotalMonthlyValue(reportSocio, 'totalDistribuidoIsentoAta', month)) || ''
        : getReinfTotalsDisplayValue(reportSocio, 'totalDistribuidoIsentoAta', months),
    }));

    if (!months.length) return monthRows;

    return [
      ...monthRows,
      {
        reportSocio,
        month: '',
        monthIndex: sourceMonths.length,
        isTotal: true,
        socioNome: 'TOTAL DO SÓCIO',
        socioCpf: '',
        monthLabel: '',
        tributavel: getReinfTotalsDisplayValue(reportSocio, 'totalDistribuidoTributavel', months),
        isentoAta: getReinfTotalsDisplayValue(reportSocio, 'totalDistribuidoIsentoAta', months),
      },
    ];
  });
}

function parseCurrencyNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrencyInput(value) {
  const number = parseCurrencyNumber(value);
  if (!number) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function getReinfPeriodicitySuggestionFromReportSocios(reportSocios = []) {
  const hasMonthlyThreshold = reportSocios.some((reportSocio) => (
    (reportSocio.meses ?? []).some((month) => parseCurrencyNumber(reportSocio.valoresPorMes?.[month]) >= REINF_VALUE_MONTHLY_THRESHOLD)
  ));
  return hasMonthlyThreshold ? 'Mensal' : 'Trimestral';
}

function getReinfMonthLabel(month) {
  return REINF_MONTH_OPTIONS.find((item) => item.value === month)?.label ?? month;
}

function getReinfMonthShortLabel(month) {
  const index = REINF_MONTH_OPTIONS.findIndex((item) => item.value === month);
  return ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][index] ?? getReinfMonthLabel(month).slice(0, 3).toUpperCase();
}

function getReinfMonthNumberLabel(month) {
  const index = REINF_MONTH_OPTIONS.findIndex((item) => item.value === month);
  return index >= 0 ? String(index + 1).padStart(2, '0') : getReinfMonthLabel(month);
}

function getReinfReportMonths(reportSocios = []) {
  const selected = new Set();
  (reportSocios ?? []).forEach((reportSocio) => {
    (reportSocio.meses ?? []).forEach((month) => selected.add(month));
  });
  return REINF_MONTH_OPTIONS
    .map((month) => month.value)
    .filter((month) => selected.has(month));
}

function getReinfPeriodLabel(months = [], anoReferencia = '') {
  if (!months.length) return anoReferencia ? `período não informado/${anoReferencia}` : 'período não informado';
  const orderedMonths = REINF_MONTH_OPTIONS
    .map((month) => month.value)
    .filter((month) => months.includes(month));
  const numbers = orderedMonths.map(getReinfMonthNumberLabel);
  const prefix = numbers.length === 1 ? numbers[0] : `${numbers[0]} até ${numbers[numbers.length - 1]}`;
  return anoReferencia ? `${prefix}/${anoReferencia}` : prefix;
}

function getReinfQuarterLabel(months = []) {
  if (!months.length) return '';
  const orderedIndexes = REINF_MONTH_OPTIONS
    .map((month, index) => (months.includes(month.value) ? index : -1))
    .filter((index) => index >= 0);
  if (orderedIndexes.length !== 3) return '';
  const quarterIndex = Math.floor(orderedIndexes[0] / 3);
  const quarterStart = quarterIndex * 3;
  const isSameQuarter = orderedIndexes.every((index, offset) => index === quarterStart + offset);
  if (!isSameQuarter) return '';
  return ['primeiro trimestre', 'segundo trimestre', 'terceiro trimestre', 'quarto trimestre'][quarterIndex] ?? '';
}

function getReinfPeriodDescription(months = [], periodicidade = 'Trimestral', anoReferencia = '') {
  const yearSuffix = anoReferencia ? ` de ${anoReferencia}` : '';
  if (!months.length) return `período não informado${yearSuffix}`;
  if (periodicidade === 'Mensal' && months.length === 1) {
    return `mês de ${getReinfMonthLabel(months[0]).toLowerCase()}${yearSuffix}`;
  }
  const quarterLabel = getReinfQuarterLabel(months);
  if (quarterLabel) return `${quarterLabel}${yearSuffix}`;
  return `período ${getReinfPeriodLabel(months, anoReferencia)}`;
}

function formatCurrencyDisplay(value) {
  const number = parseCurrencyNumber(value);
  if (!number) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getClientDisplayName(client) {
  return client?.razao_social || client?.nome_identificacao || 'Cliente';
}

function buildReinfFiscalSubject({ client, months = [], anoReferencia = '' }) {
  return `Distribuição de Lucro - ${getReinfPeriodLabel(months, anoReferencia)} - ${getClientDisplayName(client)}`;
}

function buildReinfFiscalBodyText({ client, months = [], anoReferencia = '', periodicidade = 'Trimestral' }) {
  return [
    'Prezados(as),',
    '',
    `Seguem os valores do ${getReinfPeriodDescription(months, periodicidade, anoReferencia)} referentes à distribuição de lucro dos sócios da ${getClientDisplayName(client)} (${formatCnpj(client?.cnpj)}).`,
    '',
    'Qualquer dúvida, estamos à disposição.',
    '',
    'Por favor, confirme o recebimento deste e-mail.',
    '',
    'Atenciosamente,',
  ].join('\n');
}

function isReinfFiscalClosingLine(line) {
  return String(line ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .startsWith('qualquer duvida');
}

function splitReinfFiscalBodyText(bodyText) {
  const lines = String(bodyText ?? '').split('\n');
  const closingStart = lines.findIndex(isReinfFiscalClosingLine);
  if (closingStart < 0) {
    return { introLines: lines, closingLines: [] };
  }
  return {
    introLines: lines.slice(0, closingStart),
    closingLines: lines.slice(closingStart),
  };
}

function buildPlainTextTable(rows = []) {
  if (!rows.length) return '';
  const columnWidths = rows[0].map((_, columnIndex) => (
    Math.max(
      ...rows.map((row) => String(row[columnIndex] ?? '').length),
      3,
    )
  ));
  const divider = `+${columnWidths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const formatRow = (row) => `|${row.map((cell, columnIndex) => ` ${String(cell ?? '').padEnd(columnWidths[columnIndex], ' ')} `).join('|')}|`;

  return [
    divider,
    formatRow(rows[0]),
    divider,
    ...rows.slice(1).map(formatRow),
    divider,
  ].join('\n');
}

function buildReinfFiscalPlainMessage({
  assunto,
  bodyText,
  reportSocios = [],
  months = [],
  modeloTabela = REINF_TABLE_MODEL_MONTHLY,
  assinaturaNome = '',
  retificacao = false,
}) {
  const isTotalsModel = isReinfTotalsTableModel(modeloTabela);
  const header = isTotalsModel
    ? ['SÓCIO', 'CPF/CNPJ', 'MÊS', ...REINF_TOTAL_FIELD_OPTIONS.map((field) => field.label.toUpperCase())]
    : ['SÓCIO', 'CPF/CNPJ', ...months.map(getReinfMonthShortLabel)];
  const rows = isTotalsModel
    ? getReinfTotalsTableRows(reportSocios, months).map((row) => [
      row.isTotal ? 'TOTAL DO SÓCIO' : (row.monthIndex === 0 ? row.socioNome : ''),
      row.isTotal ? '' : (row.monthIndex === 0 ? row.socioCpf : ''),
      row.monthLabel,
      row.isentoAta,
      row.tributavel,
    ])
    : (reportSocios.length
      ? reportSocios.map((reportSocio) => {
      return [
        reportSocio.socio?.nome || 'Sócio não informado',
        reportSocio.socio?.cpf ? formatCpfInput(reportSocio.socio.cpf) : '',
        ...months.map((month) => formatCurrencyDisplay(reportSocio.valoresPorMes?.[month]) || ''),
      ];
    })
      : [['Sem sócio', '', ...months.map(() => '')]]);
  const totalRow = null;
  const { introLines, closingLines } = splitReinfFiscalBodyText(bodyText);

  return [
    retificacao ? REINF_RETIFICATION_NOTICE : '',
    retificacao ? '' : null,
    assunto ? `Assunto: ${assunto}` : '',
    '',
    introLines.join('\n'),
    '',
    buildPlainTextTable([header, ...rows, ...(totalRow ? [totalRow] : [])]),
    '',
    closingLines.join('\n'),
    assinaturaNome ? `\nAssinatura digital: ${assinaturaNome}` : '',
  ].filter((line) => line !== '' && line !== null).join('\n');
}

function buildReinfFiscalHtmlParagraphs(lines = []) {
  return lines
    .map((line) => line.trim() ? `<p style="margin:0 0 14px;">${escapeHtml(line)}</p>` : '<br>')
    .join('');
}

function buildReinfFiscalHtmlMessage({
  assunto,
  bodyText,
  reportSocios = [],
  months = [],
  modeloTabela = REINF_TABLE_MODEL_MONTHLY,
  assinaturaUrl = '',
  assinaturaNome = '',
  retificacao = false,
}) {
  const isTotalsModel = isReinfTotalsTableModel(modeloTabela);
  const headerLabels = isTotalsModel
    ? ['SÓCIO', 'CPF/CNPJ', 'MÊS', ...REINF_TOTAL_FIELD_OPTIONS.map((field) => field.label.toUpperCase())]
    : ['SÓCIO', 'CPF/CNPJ', ...months.map(getReinfMonthShortLabel)];
  const headerCells = headerLabels
    .map((cell) => `<th style="border:1px solid #111;padding:4px 8px;text-align:left;font-weight:600;background:#f8fafc;color:#111;">${escapeHtml(cell)}</th>`)
    .join('');
  const bodyRows = (isTotalsModel
    ? getReinfTotalsTableRows(reportSocios, months).map((row) => ({
      isTotal: row.isTotal,
      cells: [
        row.isTotal ? 'TOTAL DO SÓCIO' : (row.monthIndex === 0 ? row.socioNome : ''),
        row.isTotal ? '' : (row.monthIndex === 0 ? row.socioCpf : ''),
        row.monthLabel,
        row.isentoAta,
        row.tributavel,
      ],
    }))
    : (reportSocios.length ? reportSocios : [{ socio: { nome: 'Sem sócio', cpf: '' }, valoresPorMes: {} }])
      .map((reportSocio) => {
      return {
        isTotal: false,
        cells: [
          reportSocio.socio?.nome || 'Sócio não informado',
          reportSocio.socio?.cpf ? formatCpfInput(reportSocio.socio.cpf) : '',
          ...months.map((month) => formatCurrencyDisplay(reportSocio.valoresPorMes?.[month]) || ''),
        ],
      };
    }))
    .map(({ cells, isTotal }) => {
      const cellStyle = isTotal
        ? 'border:1px solid #111;padding:4px 8px;background:#f8fafc;color:#111;font-weight:600;'
        : 'border:1px solid #111;padding:4px 8px;background:#fff;color:#111;';
      return `<tr>${cells.map((cell) => `<td style="${cellStyle}">${escapeHtml(cell)}</td>`).join('')}</tr>`;
    })
    .join('');
  const totalRow = '';
  const { introLines, closingLines } = splitReinfFiscalBodyText(bodyText);

  return `
    <div style="font-family:Arial,sans-serif;color:#111;font-size:14px;line-height:1.45;">
      ${retificacao ? `<p style="margin:0 0 8px;font-size:16px;"><strong>${escapeHtml(REINF_RETIFICATION_NOTICE)}</strong></p>` : ''}
      ${assunto ? `<p style="margin:0 0 16px;font-size:18px;"><strong>${escapeHtml(assunto)}</strong></p>` : ''}
      ${buildReinfFiscalHtmlParagraphs(introLines)}
      <table style="border-collapse:collapse;margin:12px 0 20px;font-size:14px;border:1px solid #111;background:#fff;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}${totalRow}</tbody>
      </table>
      ${buildReinfFiscalHtmlParagraphs(closingLines)}
      ${assinaturaUrl ? `<div style="margin-top:18px;"><img src="${escapeHtml(assinaturaUrl)}" alt="${escapeHtml(assinaturaNome || 'Assinatura digital')}" style="max-width:520px;width:100%;height:auto;display:block;border:0;" /></div>` : ''}
    </div>
  `;
}

function buildReinfReportSociosSnapshot(reportSocios = [], months = [], modeloTabela = REINF_TABLE_MODEL_MONTHLY) {
  const isTotalsModel = isReinfTotalsTableModel(modeloTabela);
  return (reportSocios ?? []).map((reportSocio) => {
    const valoresPorMes = {};
    const valoresTotaisPorMes = REINF_TOTAL_FIELD_OPTIONS.reduce((values, field) => ({
      ...values,
      [field.key]: {},
    }), {});
    let total = 0;
    months.forEach((month) => {
      const formattedValue = isTotalsModel
        ? (formatCurrencyDisplay(getReinfTotalMonthlyValue(reportSocio, 'totalDistribuidoTributavel', month)) || '')
        : (formatCurrencyDisplay(reportSocio.valoresPorMes?.[month]) || '');
      valoresPorMes[month] = formattedValue;
      total += parseCurrencyNumber(formattedValue);
      if (isTotalsModel) {
        REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
          valoresTotaisPorMes[field.key][month] = formatCurrencyDisplay(getReinfTotalMonthlyValue(reportSocio, field.key, month)) || '';
        });
      }
    });
    const valoresTotais = {};
    let totalDistribuido = 0;
    REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
      const formattedValue = isTotalsModel
        ? getReinfTotalsDisplayValue(reportSocio, field.key, months)
        : (formatCurrencyDisplay(getReinfReportSocioTotals(reportSocio)?.[field.key]) || '');
      valoresTotais[field.key] = formattedValue;
      if (field.key === 'totalDistribuidoTributavel') {
        totalDistribuido += parseCurrencyNumber(formattedValue);
      }
    });
    return {
      socio_id: reportSocio.socio?.id ?? null,
      nome: reportSocio.socio?.nome || 'Sócio não informado',
      cpf: reportSocio.socio?.cpf ? formatCpfInput(reportSocio.socio.cpf) : '',
      valores_por_mes: valoresPorMes,
      valores_totais_por_mes: valoresTotaisPorMes,
      valores_totais: valoresTotais,
      total: isTotalsModel
        ? (totalDistribuido ? formatCurrencyDisplay(totalDistribuido) : '')
        : (total ? formatCurrencyDisplay(total) : ''),
    };
  });
}

function buildReinfReportPayload({ client, modeloTabela = REINF_TABLE_MODEL_MONTHLY, periodicidade, anoReferencia, months, assunto, mensagem, reportSocios }) {
  const sociosSnapshot = buildReinfReportSociosSnapshot(reportSocios, months, modeloTabela);
  return {
    cliente_id: client?.id,
    cnpj: client?.cnpj,
    razao_social: client?.razao_social,
    nome_identificacao: client?.nome_identificacao,
    responsavel: client?.responsavel,
    revisor: client?.revisor,
    modelo_tabela: modeloTabela,
    modelo_tabela_label: getReinfTableModelLabel(modeloTabela),
    periodicidade,
    ano_referencia: anoReferencia,
    meses: months,
    assunto,
    corpo_mensagem: mensagem,
    socios: sociosSnapshot,
  };
}

function getReinfHistoryClientKeys(relatorio) {
  return [
    String(relatorio?.cliente_id ?? '').trim(),
    normalizeCnpj(relatorio?.cnpj),
  ].filter(Boolean);
}

function getReinfHistorySocioKeys(socio, fallbackIndex = 0) {
  return [
    String(socio?.socio_id ?? socio?.id ?? '').trim(),
    normalizeCpfDigits(socio?.cpf),
    normalizeText(socio?.nome),
    getReinfSocioOptionKey({ id: socio?.socio_id ?? socio?.id, cpf: socio?.cpf, nome: socio?.nome }, fallbackIndex),
  ].filter(Boolean);
}

function getReinfHistoryValueKey({ clientKey, socioKey, anoReferencia, month, modeloTabela, fieldKey = 'valor' }) {
  return [
    clientKey,
    socioKey,
    String(anoReferencia ?? '').trim(),
    String(month ?? '').trim(),
    modeloTabela || REINF_TABLE_MODEL_MONTHLY,
    fieldKey,
  ].join('|');
}

function createReinfHistoryValueIndex({ relatorios = [], client }) {
  const index = new Map();
  const currentClientKeys = new Set([
    String(client?.id ?? '').trim(),
    normalizeCnpj(client?.cnpj),
  ].filter(Boolean));

  (relatorios ?? []).forEach((relatorio) => {
    const reportMatchesClient = getReinfHistoryClientKeys(relatorio)
      .some((clientKey) => currentClientKeys.has(clientKey));
    if (!reportMatchesClient) return;

    const modeloTabela = relatorio?.modelo_tabela || REINF_TABLE_MODEL_MONTHLY;
    const anoReferencia = relatorio?.ano_referencia || '';
    const meses = Array.isArray(relatorio?.meses) ? relatorio.meses : [];
    const socios = Array.isArray(relatorio?.socios) ? relatorio.socios : [];

    socios.forEach((socio, socioIndex) => {
      const socioKeys = getReinfHistorySocioKeys(socio, socioIndex);
      meses.forEach((month) => {
        if (isReinfTotalsTableModel(modeloTabela)) {
          REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
            const value = getReinfTotalMonthlyValue(socio, field.key, month);
            if (!String(value ?? '').trim()) return;
            socioKeys.forEach((socioKey) => {
              currentClientKeys.forEach((clientKey) => {
                const historyKey = getReinfHistoryValueKey({
                  clientKey,
                  socioKey,
                  anoReferencia,
                  month,
                  modeloTabela,
                  fieldKey: field.key,
                });
                if (!index.has(historyKey)) index.set(historyKey, value);
              });
            });
          });
          return;
        }

        const value = getReinfReportSocioMonthValue(socio, month);
        if (!String(value ?? '').trim()) return;
        socioKeys.forEach((socioKey) => {
          currentClientKeys.forEach((clientKey) => {
            const historyKey = getReinfHistoryValueKey({
              clientKey,
              socioKey,
              anoReferencia,
              month,
              modeloTabela,
            });
            if (!index.has(historyKey)) index.set(historyKey, value);
          });
        });
      });
    });
  });

  return index;
}

function findReinfHistoryValue(historyIndex, { client, socio, socioIndex = 0, anoReferencia, month, modeloTabela, fieldKey = 'valor' }) {
  if (!historyIndex?.size) return '';
  const clientKeys = [
    String(client?.id ?? '').trim(),
    normalizeCnpj(client?.cnpj),
  ].filter(Boolean);
  const socioKeys = getReinfHistorySocioKeys(socio, socioIndex);

  for (const clientKey of clientKeys) {
    for (const socioKey of socioKeys) {
      const historyKey = getReinfHistoryValueKey({
        clientKey,
        socioKey,
        anoReferencia,
        month,
        modeloTabela,
        fieldKey,
      });
      const value = historyIndex.get(historyKey);
      if (String(value ?? '').trim()) return value;
    }
  }

  return '';
}

function clearReinfReportSocioValues(reportSocio) {
  return {
    ...reportSocio,
    meses: [],
    valoresPorMes: {},
    valoresTotais: createEmptyReinfTotalValues(),
    valoresTotaisPorMes: {},
    valoresHistorico: createEmptyReinfHistoryMarks(),
  };
}

function buildReinfRelatoriosExportRows(relatorios = []) {
  return (relatorios ?? []).flatMap((relatorio) => {
    const isTotalsModel = isReinfTotalsTableModel(relatorio?.modelo_tabela);
    const meses = Array.isArray(relatorio.meses) ? relatorio.meses : [];
    const socios = Array.isArray(relatorio.socios) && relatorio.socios.length
      ? relatorio.socios
      : [{ nome: 'Sócio não informado', cpf: '', valores_por_mes: {}, valores_totais: {}, total: '' }];

    return socios.map((socio) => {
      const valoresPorMes = socio.valores_por_mes ?? socio.valoresPorMes ?? {};
      const valoresTotais = socio.valores_totais ?? socio.valoresTotais ?? {};
      const valoresResumo = meses
        .map((month) => {
          const value = valoresPorMes[month] ?? '';
          return value ? `${getReinfMonthShortLabel(month)}: ${value}` : '';
        })
        .filter(Boolean)
        .join(' | ');
      const row = {
        'Gerado em': formatDateTime(relatorio.criado_em),
        Cliente: relatorio.razao_social || relatorio.nome_identificacao || '',
        CNPJ: formatCnpj(relatorio.cnpj),
        'Nome/identificação': relatorio.nome_identificacao || '',
        Responsável: relatorio.responsavel || '',
        Revisor: relatorio.revisor || '',
        'Modelo da tabela': relatorio.modelo_tabela_label || getReinfTableModelLabel(relatorio.modelo_tabela),
        Periodicidade: getReinfRelatorioPeriodicityLabel(relatorio),
        Ano: relatorio.ano_referencia || '',
        Meses: meses.map(getReinfMonthLabel).join(', '),
        Sócio: socio.nome || '',
        'CPF/CNPJ': socio.cpf ? formatCpfInput(socio.cpf) : '',
      };

      meses.forEach((month) => {
        row[getReinfMonthShortLabel(month)] = valoresPorMes[month] ?? '';
      });
      if (isTotalsModel) {
        REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
          row[field.label] = valoresTotais[field.key] ?? '';
        });
      }

      return {
        ...row,
        'Valores por mês': valoresResumo,
        Total: socio.total || '',
        Assunto: relatorio.assunto || '',
        'Texto do e-mail': relatorio.corpo_mensagem || '',
        'Gerado por': relatorio.criado_por_nome || relatorio.criado_por_email || '',
      };
    });
  });
}

function getReinfRelatorioSociosCount(relatorio) {
  return Array.isArray(relatorio?.socios) ? relatorio.socios.length : 0;
}

function getReinfRelatorioMonthsLabel(relatorio) {
  const meses = Array.isArray(relatorio?.meses) ? relatorio.meses : [];
  const labels = meses.map(getReinfMonthShortLabel).filter(Boolean);
  return labels.length ? labels.join(', ') : 'Sem mês informado';
}

function getReinfPeriodicityLabelFromMonths(months = [], fallback = '') {
  const monthsCount = Array.isArray(months) ? months.length : 0;
  if (monthsCount === 1) return 'Mensal';
  if (monthsCount === 3) return 'Trimestral';
  return fallback || 'Não informado';
}

function getReinfRelatorioPeriodicityLabel(relatorio) {
  return getReinfPeriodicityLabelFromMonths(relatorio?.meses, relatorio?.periodicidade);
}

function getReinfRelatorioClientKeys(relatorio) {
  return [
    String(relatorio?.cliente_id ?? '').trim(),
    normalizeCnpj(relatorio?.cnpj),
  ].filter(Boolean);
}

function getClientReinfRelatorioKeys(client) {
  return [
    String(client?.id ?? '').trim(),
    normalizeCnpj(client?.cnpj),
  ].filter(Boolean);
}

function isReinfRelatorioFromClient(relatorio, client) {
  const clientKeys = new Set(getClientReinfRelatorioKeys(client));
  if (!clientKeys.size) return false;
  return getReinfRelatorioClientKeys(relatorio).some((key) => clientKeys.has(key));
}

function getReinfRelatorioTimestamp(relatorio) {
  const timestamp = new Date(relatorio?.criado_em ?? '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLatestReinfRelatorioByClient(relatorios = [], client) {
  return (relatorios ?? [])
    .filter((relatorio) => isReinfRelatorioFromClient(relatorio, client))
    .sort((a, b) => getReinfRelatorioTimestamp(b) - getReinfRelatorioTimestamp(a))[0] ?? null;
}

function getReinfRelatorioSocioTotalValue(socio, months = [], modeloTabela = REINF_TABLE_MODEL_MONTHLY) {
  if (isReinfTotalsTableModel(modeloTabela)) {
    const monthlyTotal = (months ?? []).reduce((sum, month) => (
      sum
      + parseCurrencyNumber(getReinfTotalMonthlyValue(socio, 'totalDistribuidoIsentoAta', month))
      + parseCurrencyNumber(getReinfTotalMonthlyValue(socio, 'totalDistribuidoTributavel', month))
    ), 0);
    if (monthlyTotal) return monthlyTotal;

    const totals = getReinfReportSocioTotals(socio);
    return REINF_TOTAL_FIELD_OPTIONS.reduce((sum, field) => (
      sum + parseCurrencyNumber(totals?.[field.key])
    ), 0);
  }

  const monthlyTotal = (months ?? []).reduce((sum, month) => (
    sum + parseCurrencyNumber(getReinfReportSocioMonthValue(socio, month))
  ), 0);
  return monthlyTotal || parseCurrencyNumber(socio?.total);
}

function getReinfRelatorioTotalValue(relatorio) {
  const months = Array.isArray(relatorio?.meses) ? relatorio.meses : [];
  const socios = Array.isArray(relatorio?.socios) ? relatorio.socios : [];
  const modeloTabela = relatorio?.modelo_tabela || REINF_TABLE_MODEL_MONTHLY;
  return socios.reduce((sum, socio) => (
    sum + getReinfRelatorioSocioTotalValue(socio, months, modeloTabela)
  ), 0);
}

function buildClientDistribuicaoLucroSummary(client, relatorios = []) {
  const latestRelatorio = getLatestReinfRelatorioByClient(relatorios, client);
  if (!latestRelatorio) {
    return {
      relatorio: null,
      fields: [
        { label: 'Último envio', value: 'Sem envio registrado' },
        { label: 'Período enviado', value: 'Não informado' },
        { label: 'Modelo utilizado', value: 'Não informado' },
        { label: 'Sócios enviados', value: '0' },
        { label: 'Total distribuído', value: '0,00' },
        { label: 'Status', value: 'Sem histórico salvo' },
      ],
    };
  }

  const months = Array.isArray(latestRelatorio.meses) ? latestRelatorio.meses : [];
  const total = getReinfRelatorioTotalValue(latestRelatorio);
  return {
    relatorio: latestRelatorio,
    fields: [
      { label: 'Último envio', value: formatDateTime(latestRelatorio.criado_em) },
      {
        label: 'Período enviado',
        value: months.length
          ? `${getReinfRelatorioMonthsLabel(latestRelatorio)} ${latestRelatorio.ano_referencia || ''}`.trim()
          : 'Não informado',
      },
      { label: 'Modelo utilizado', value: latestRelatorio.modelo_tabela_label || getReinfTableModelLabel(latestRelatorio.modelo_tabela) },
      { label: 'Sócios enviados', value: String(getReinfRelatorioSociosCount(latestRelatorio)) },
      { label: 'Total distribuído', value: formatCurrencyDisplay(total) || '0,00' },
      { label: 'Status', value: 'Envio salvo no histórico' },
    ],
  };
}

function slugifyFilenamePart(value, fallback = 'relatorio') {
  const normalized = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);

  return normalized || fallback;
}

function buildReinfRelatorioFilename(relatorio, extension) {
  const clientName = slugifyFilenamePart(relatorio?.razao_social || relatorio?.nome_identificacao, 'cliente');
  const createdAt = relatorio?.criado_em ? String(relatorio.criado_em).slice(0, 10) : 'sem-data';
  return `reinf-${clientName}-${createdAt}.${extension}`;
}

async function copyRichTextToClipboard({ htmlText, plainText }) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([htmlText], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ]);
    return;
  }

  if (document?.body && window?.getSelection) {
    const container = document.createElement('div');
    container.setAttribute('contenteditable', 'true');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.innerHTML = htmlText;
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const copied = document.execCommand('copy');
    selection.removeAllRanges();
    document.body.removeChild(container);

    if (copied) return;
  }

  await navigator.clipboard?.writeText(plainText);
}

function getEcdEcfDeliveryDateValue(client, tipo = 'ecd') {
  return tipo === 'ecf' ? client?.data_entrega_ecf || '' : client?.data_entrega_ecd || '';
}

function getEcdEcfSentDateValue(client, tipo = 'ecd') {
  const attachment = parseAttachment(tipo === 'ecf' ? client.anexo_recibo_ecf : client.anexo_recibo_ecd);
  const candidates = [
    tipo === 'ecf' ? client?.data_envio_ecf || '' : client?.data_envio_ecd || '',
    attachment.attachedAt || '',
  ]
    .map((value) => normalizeDateInputValue(value))
    .filter(Boolean);

  if (!candidates.length) return '';
  return candidates.reduce((latest, current) => (current > latest ? current : latest));
}

function EcdEcfDeliveryDateCell({ client, tipo = 'ecd', fieldKey = 'data_entrega_ecd', disabled, onSave }) {
  const [value, setValue] = useState(() => normalizeDateInputValue(getEcdEcfDeliveryDateValue(client, tipo)));

  useEffect(() => {
    setValue(normalizeDateInputValue(getEcdEcfDeliveryDateValue(client, tipo)));
  }, [client.data_entrega_ecd, client.data_entrega_ecf, tipo]);

  if (disabled) {
    return <span className="font-semibold text-slate-700 dark:text-gray-200">{formatDateDisplay(getEcdEcfDeliveryDateValue(client, tipo))}</span>;
  }

  return (
    <div className="min-w-40" onClick={(event) => event.stopPropagation()}>
      <input
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          const nextValue = value || '';
          const currentValue = normalizeDateInputValue(getEcdEcfDeliveryDateValue(client, tipo));
          if (nextValue === currentValue) return;
          onSave?.(client.id, { [fieldKey]: nextValue });
        }}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  );
}

function EcdEcfSentDateCell({ client, tipo = 'ecd' }) {
  const rawDate = getEcdEcfSentDateValue(client, tipo);

  if (!rawDate) {
    return <span className="text-sm font-semibold text-slate-400 dark:text-gray-500">Não informado</span>;
  }

  return <span className="font-semibold text-slate-700 dark:text-gray-200">{formatDateDisplay(rawDate)}</span>;
}

function EcdEcfObrigacaoStatusCell({ client, tipo = 'ecd' }) {
  const status = getEcdEcfObrigacaoStatus(client, tipo);

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${chipClass(status.tone)}`}>
      {status.label}
    </span>
  );
}

function matchesAlert(client, alertKey) {
  if (!alertKey) return true;
  return getClientAlertSignals(client).some((alert) => alert.key === alertKey);
}

function isClientArchived(client) {
  return client?.arquivado === true || normalizeText(client?.status) === 'inativo';
}

function normalizeClientStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized || normalized === 'inativo') return 'Ativo';
  return CLIENT_STATUS_OPTIONS.find((option) => normalizeText(option) === normalized) ?? 'Ativo';
}

function getActiveClients(clients) {
  return (clients ?? []).filter((client) => !isClientArchived(client));
}

function getClientStatusFilterOption(value) {
  return CLIENT_STATUS_FILTER_OPTIONS.find((option) => option.value === value) ?? CLIENT_STATUS_FILTER_OPTIONS[0];
}

function matchesClientStatusFilter(client, filterValue) {
  const selectedFilter = filterValue || DEFAULT_FILTERS.arquivamento;
  const archived = isClientArchived(client);

  if (selectedFilter === 'arquivados') {
    return archived;
  }

  if (archived) return false;

  const statusToMatch = getClientStatusFilterOption(selectedFilter)?.status;
  if (!statusToMatch) return true;

  return normalizeText(normalizeClientStatus(client?.status)) === normalizeText(statusToMatch);
}

function filterClients(clients, filters) {
  return clients.filter((client) => {
    if (!matchesClientStatusFilter(client, filters.arquivamento)) return false;

    const search = normalizeText(filters.search);
    if (search) {
      const searchable = normalizeText(
        `${client.cnpj} ${client.razao_social} ${client.nome_identificacao}`,
      );
      if (!searchable.includes(search)) return false;
    }

    if (!matchesAlert(client, filters.alerta)) return false;

    const matchesBaseFilters = FILTER_FIELDS.every((field) => {
      const filterValue = filters[field];
      if (!filterValue) return true;
      if (field === 'competencia_em_dia') {
        return normalizeText(isCompetenciaEmDia(client) ? 'Sim' : 'Não') === normalizeText(filterValue);
      }
      return normalizeFilterComparableValue(field, client[field]) === normalizeFilterComparableValue(field, filterValue);
    });

    if (!matchesBaseFilters) return false;

    return PRESET_ONLY_FILTER_FIELDS.every((field) => {
      const filterValue = filters[field];
      if (!filterValue) return true;
      if (field === 'envio_reinf') {
        return normalizeText(isReinfEnviada(client) ? 'Sim' : 'Não') === normalizeText(filterValue);
      }
      return normalizeText(client[field]) === normalizeText(filterValue);
    });
  });
}

function countWhere(clients, predicate) {
  return clients.reduce((count, client) => count + (predicate(client) ? 1 : 0), 0);
}

function countDisplayDiacritics(value) {
  const normalized = String(value ?? '').normalize('NFD');
  const matches = normalized.match(/\p{Diacritic}/gu);
  return matches ? matches.length : 0;
}

function choosePreferredDisplayLabel(candidate, current) {
  const candidateDiacritics = countDisplayDiacritics(candidate);
  const currentDiacritics = countDisplayDiacritics(current);
  if (candidateDiacritics !== currentDiacritics) {
    return candidateDiacritics > currentDiacritics ? candidate : current;
  }

  if (candidate.length !== current.length) {
    return candidate.length > current.length ? candidate : current;
  }

  return candidate.localeCompare(current, 'pt-BR', { sensitivity: 'variant' }) < 0 ? candidate : current;
}

function normalizeBreakdownRows(rows) {
  const grouped = new Map();

  (rows ?? []).forEach((row) => {
    const label = String(row?.label ?? '').trim() || 'Não informado';
    const key = normalizeText(label) || 'não informado';
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { label, value: Number(row?.value ?? 0) || 0 });
      return;
    }

    grouped.set(key, {
      label: choosePreferredDisplayLabel(label, current.label),
      value: current.value + (Number(row?.value ?? 0) || 0),
    });
  });

  return Array.from(grouped.values())
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'pt-BR'));
}

function getNormalizedBreakdownRows(clients, fieldKey) {
  return normalizeBreakdownRows(
    toBreakdown(clients, fieldKey).map((row) => ({
      ...row,
      label: normalizeFieldDisplayValue(fieldKey, row?.label),
    })),
  );
}

function getFilterOptionsForField(listagens, field, currentValue = '', clientsForOptions = []) {
  const canIncludeUninformedOption = Boolean(field?.key) && field.key !== 'competencia_em_dia';
  const hasUninformedClients = canIncludeUninformedOption && (clientsForOptions ?? []).some((client) => {
    return !normalizeFieldDisplayValue(field?.key, client?.[field?.key]);
  });

  return uniqueValues([
    ...(getOptions(listagens, field) ?? []),
    hasUninformedClients ? 'Não informado' : '',
    currentValue,
  ].map((value) => normalizeFieldDisplayValue(field?.key, value)));
}

function getOptions(listagens, field) {
  if (field.key === 'status') {
    return CLIENT_STATUS_OPTIONS;
  }
  if (field.type === 'yesno') return YES_NO_OPTIONS;
  if (field.key === 'envio_reinf' || field.key === 'distribuicao_lucros' || field.key === 'ecf') {
    return YES_NO_OPTIONS;
  }
  return listagens[field.listKey] ?? [];
}

function AppShell({
  page,
  setPage,
  children,
  onImportClick,
  metadata,
  totalClientes,
  currentUser,
  onLogout,
  canImport,
  canImportEnabled = true,
  importDisabledReason = '',
  supabaseStatus,
  supabaseStatusLabel = '',
  supabaseStatusTone = 'neutral',
  writeBlockedMessage = '',
}) {
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.permission || can(currentUser, item.permission));
  const profile = getProfile(currentUser);
  const currentTitle = NAV_ITEMS.find((item) => item.key === page)?.label ?? 'Cliente';
  const showDashboardHeaderControls = page === 'dashboard';
  const pageDescription = PAGE_DESCRIPTIONS[page] ?? 'Painel interno do escritório contábil';
  const statusToneTextClass = {
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    info: 'text-sky-300',
    danger: 'text-red-300',
    muted: 'text-slate-400',
    neutral: 'text-slate-300',
  }[supabaseStatusTone] ?? 'text-slate-300';
  const groupedNav = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.keys.map((key) => visibleNavItems.find((item) => item.key === key)).filter(Boolean),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-transparent text-slate-900 dark:text-gray-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 overflow-y-auto overflow-x-hidden border-r border-slate-300/80 bg-[#d8e7f3]/95 text-[#16324f] shadow-[18px_0_48px_rgba(30,64,115,0.16)] dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:shadow-none lg:block xl:w-64 2xl:w-72 sidebar-scroll">
        <div className="flex min-h-full flex-col">
          <div className="border-b border-slate-300/70 bg-[#c9deef]/45 px-4 py-4 dark:border-gray-800 dark:bg-transparent xl:px-5 2xl:px-6 2xl:py-6">
            <div className="flex items-center gap-3">
              <img
                src={f12Logo}
                alt="F12 Contabilidade Estratégica"
                className="h-11 w-32 rounded-lg bg-[#080c2b] object-contain object-left xl:h-12 xl:w-36 2xl:h-14 2xl:w-40"
              />
              <div className="sr-only">
                <p>Portal Contábil</p>
                <p>Gestão interna</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-3 px-3 py-3 xl:px-4 2xl:space-y-5 2xl:py-5" aria-label="Navegação principal">
            {groupedNav.map((group) => (
              <div key={group.title} className="space-y-1 2xl:space-y-1.5">
                <p className="px-3 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-500 2xl:text-[11px]">{group.title}</p>
                {group.items.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPage(key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-bold transition 2xl:gap-3 2xl:py-2.5 2xl:text-sm ${
                      page === key ? 'bg-brand-blue text-white shadow-sm shadow-blue-950/20' : 'text-slate-700 hover:bg-white/65 hover:text-slate-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="border-t border-slate-300/70 bg-[#c9deef]/35 p-3 dark:border-gray-800 dark:bg-transparent xl:p-4 2xl:p-5">
            <div className="mb-2.5 rounded-lg border border-white/65 bg-white/55 p-3 shadow-sm shadow-slate-400/20 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none 2xl:mb-3 2xl:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 2xl:text-xs">Usuário conectado</p>
              <p className="mt-1.5 truncate text-sm font-black 2xl:mt-2">{currentUser?.nome ?? 'Sessão em validação'}</p>
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{profile.label}</p>
              <button
                type="button"
                onClick={onLogout}
                className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300/75 bg-white/35 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-900 hover:text-white dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-100 dark:hover:text-gray-950 2xl:mt-3"
              >
                <LogOut size={15} aria-hidden="true" />
                Sair
              </button>
            </div>
            <div className="rounded-lg border border-white/65 bg-white/55 p-3 shadow-sm shadow-slate-400/20 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none 2xl:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 2xl:text-xs">Base carregada</p>
              <p className="mt-1.5 text-2xl font-black 2xl:mt-2">{formatNumber(totalClientes)}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{getMetadataSourceDisplay(metadata?.source)}</p>
              <p className={`mt-2 text-xs font-bold ${statusToneTextClass}`}>
                {supabaseStatusLabel}
              </p>
            </div>
            <div className="mt-2.5 2xl:mt-3">
              <ThemeToggle className="w-full justify-center border-white/65 bg-white/55 text-slate-700 shadow-sm shadow-slate-400/20 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:shadow-none" />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-60 xl:pl-64 2xl:pl-72">
        <header className="z-30 border-b border-slate-300/70 bg-[#e7f1f8]/92 backdrop-blur supports-[backdrop-filter]:bg-[#e7f1f8]/84 dark:border-gray-800 dark:bg-gray-900/90 dark:supports-[backdrop-filter]:bg-gray-900/80 lg:sticky lg:top-0">
          <div className="flex min-h-24 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-6 xl:px-7 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="min-w-0">
              <img
                src={f12Logo}
                alt="F12 Contabilidade Estratégica"
                className="mb-4 h-12 w-36 rounded-lg bg-[#080c2b] object-contain object-left lg:hidden"
              />
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Escritório contábil | Carteira de clientes</p>
              <h1 className={`mt-1 max-w-full font-black tracking-tight leading-tight text-slate-950 dark:text-gray-100 ${page === 'dashboard' ? 'text-[1.75rem] sm:text-[1.95rem]' : 'text-[2rem] sm:text-[2.15rem]'}`}>{currentTitle}</h1>
              <p className={`mt-2 max-w-2xl font-semibold text-slate-500 dark:text-gray-300 ${page === 'dashboard' ? 'text-[13px] leading-5' : 'text-sm leading-6'}`}>{pageDescription}</p>
            </div>

            {showDashboardHeaderControls ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2.5 2xl:justify-end">
              <div className="pill-shell">{currentUser?.nome ?? 'Usuário'}</div>
              <ThemeToggle />
              {canImport ? (
                <ActionButton
                  type="button"
                  onClick={onImportClick}
                  disabled={!canImportEnabled}
                  title={!canImportEnabled ? importDisabledReason : ''}
                >
                  <Upload size={17} aria-hidden="true" />
                  Importar Excel
                </ActionButton>
              ) : null}
              <ActionButton type="button" variant="secondary" onClick={onLogout}>
                <LogOut size={17} aria-hidden="true" />
                Sair
              </ActionButton>
              <div className="pill-shell">Atualizado: {metadata.importedAt || metadata.generatedAt || 'não informado'}</div>
              <StatusBadge toneClass={chipClass(supabaseStatusTone)} size="md">{supabaseStatusLabel}</StatusBadge>
              </div>
            ) : null}
          </div>

          {writeBlockedMessage ? (
            <div className="border-t border-amber-100 px-4 py-3 sm:px-6">
              <AlertBanner tone="warning">{writeBlockedMessage}</AlertBanner>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3 sm:px-6 dark:border-gray-800 lg:hidden">
            {visibleNavItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPage(key)}
                className={`inline-flex min-w-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold sm:min-w-0 ${
                  page === key ? 'bg-brand-blue text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </header>

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-6 xl:px-8">
          <div key={page} className="page-transition min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

class PageContentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[page-error-boundary]', error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="surface-card p-6">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
            <p className="text-sm font-black">Falha ao carregar esta tela</p>
            <p className="mt-2 text-sm font-semibold">
              A aba <span className="font-black">{this.props.pageLabel || 'selecionada'}</span> encontrou um erro de renderização.
            </p>
            <p className="mt-2 text-xs font-semibold text-rose-600">
              {this.state.error?.message || 'Erro não identificado.'}
            </p>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

function MetricCard({ title, value, detail, icon: Icon, tone = 'neutral', onClick }) {
  return (
    <MetricTile
      title={title}
      value={formatNumber(value)}
      detail={detail}
      icon={Icon}
      tone={tone}
      toneClass={chipClass(tone)}
      onClick={onClick}
    />
  );
}

function BreakdownPanel({ title, rows, total, onSelect, field }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <SurfacePanel className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-slate-950 dark:text-gray-100">{title}</h2>
        <span className="dashboard-orb dashboard-orb-success flex h-10 w-10 items-center justify-center">
          <BarChart3 size={18} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {rows.slice(0, 9).map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={() => onSelect({ [field]: row.label }, `${title}: ${row.label}`)}
            className="dashboard-list-row w-full rounded-xl px-3 py-3 text-left transition duration-150"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-slate-700 dark:text-gray-200">{row.label}</span>
              <span className="font-black text-slate-950 dark:text-gray-100">{row.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-brand-blue"
                style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-gray-500">
              {total ? `${((row.value / total) * 100).toFixed(1)}% da base` : '0% da base'}
            </p>
          </button>
        ))}
      </div>
    </SurfacePanel>
  );
}

const DASHBOARD_DONUT_COLORS = ['#2563eb', '#06b6d4', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444'];
const DASHBOARD_MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
const DASHBOARD_AVATAR_GRADIENTS = [
  'from-sky-500 to-blue-600',
  'from-amber-400 to-yellow-500',
  'from-rose-500 to-red-500',
  'from-cyan-500 to-sky-500',
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-500',
];

function getDashboardInitials(label) {
  const words = String(label ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 'NA';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function buildDashboardChartGeometry(values, maxValue) {
  const width = 520;
  const height = 214;
  const paddingX = 14;
  const paddingY = 18;
  const safeValues = values.length ? values : [0];
  const step = safeValues.length > 1 ? (width - paddingX * 2) / (safeValues.length - 1) : 0;
  const drawableHeight = height - paddingY * 2;
  const safeMax = Math.max(maxValue, 1);
  const points = safeValues.map((value, index) => {
    const clamped = Math.max(0, Number(value) || 0);
    return {
      value: clamped,
      x: paddingX + step * index,
      y: height - paddingY - (clamped / safeMax) * drawableHeight,
    };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
    : '';

  return { width, height, paddingX, paddingY, points, linePath, areaPath };
}

function DashboardTotalCard({ total, onClick }) {
  return (
    <SurfacePanel
      as={onClick ? 'button' : 'section'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`dashboard-card dashboard-total-card relative h-full w-full overflow-hidden p-5 text-left xl:p-6 ${onClick ? 'transition duration-150 hover:-translate-y-0.5' : ''}`}
    >
      <div className="relative z-10 flex min-h-[190px] flex-col justify-between xl:min-h-[220px]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900/70 dark:text-emerald-100/80">Total de clientes</p>
            <span className="dashboard-pill dashboard-pill-success">Carteira ativa</span>
          </div>
          <p className="mt-5 text-5xl font-semibold tracking-tight leading-none text-slate-950 dark:text-gray-100 sm:text-[3.35rem]">{formatNumber(total)}</p>
          <p className="mt-3 max-w-[16rem] text-sm font-medium leading-6 text-emerald-950/70 dark:text-emerald-100/70">Base consolidada para acompanhamento contábil.</p>
        </div>
        <div className="flex items-end justify-end">
          <span className="dashboard-orb dashboard-orb-success">
            <Users className="h-8 w-8 xl:h-10 xl:w-10" aria-hidden="true" />
          </span>
        </div>
      </div>
    </SurfacePanel>
  );
}

function DashboardRegimeCard({ rows, total, onSelect, onNavigate }) {
  const displayRows = rows.slice(0, 4);
  const gradient = displayRows.length
    ? displayRows.reduce((parts, row, index) => {
      const start = parts.offset;
      const percentage = total ? (row.value / total) * 100 : 0;
      const end = start + percentage;
      parts.values.push(`${DASHBOARD_DONUT_COLORS[index % DASHBOARD_DONUT_COLORS.length]} ${start}% ${end}%`);
      parts.offset = end;
      return parts;
    }, { offset: 0, values: [] }).values.join(', ')
    : '';

  return (
    <SurfacePanel className="dashboard-card dashboard-regime-card h-full w-full p-5 xl:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200/80">Distribuição</p>
          <h2 className="text-[1.18rem] font-bold tracking-tight leading-tight text-slate-950 dark:text-gray-100 xl:text-[1.3rem]">Carteira por regime tributário</h2>
        </div>
        <span className="dashboard-pill">{formatNumber(displayRows.length)} grupo(s)</span>
      </div>
      <div className="mt-5 grid gap-5">
        <div className="flex justify-center">
          <div
            className="dashboard-donut relative flex h-32 w-32 items-center justify-center rounded-full xl:h-36 xl:w-36"
            style={{
              background: gradient || 'conic-gradient(#2563eb 0% 100%)',
            }}
          >
            <div className="dashboard-donut-core flex h-[5.5rem] w-[5.5rem] flex-col items-center justify-center rounded-full xl:h-24 xl:w-24">
              <span className="text-4xl font-semibold tracking-tight leading-none text-slate-950 dark:text-gray-100">{formatNumber(total)}</span>
              <span className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-300">clientes</span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {displayRows.map((row, index) => {
            const percentage = total ? ((row.value / total) * 100).toFixed(1).replace('.', ',') : '0,0';
            return (
              <button
                key={row.label}
                type="button"
                onClick={() => onSelect?.({ regime_tributario: row.label }, `Regime: ${row.label}`)}
                className="dashboard-list-row flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition duration-150"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: DASHBOARD_DONUT_COLORS[index % DASHBOARD_DONUT_COLORS.length] }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-gray-200 xl:text-[0.95rem]">{row.label}</span>
                <span className="shrink-0 text-sm font-semibold text-slate-500 dark:text-gray-300 xl:text-[0.95rem]">
                  {formatNumber(row.value)} ({percentage}%)
                </span>
              </button>
            );
          })}
          <div className="border-t border-slate-100 pt-3 dark:border-gray-800">
            <ActionButton type="button" variant="subtle" className="mx-auto flex" onClick={() => onNavigate?.('clientes', { clearFilters: true })}>
              Ver detalhes
              <ChevronRight size={16} aria-hidden="true" />
            </ActionButton>
          </div>
        </div>
      </div>
    </SurfacePanel>
  );
}

function DashboardSituationCard({ values, total }) {
  const maxValue = Math.max(total, ...values, 10);
  const ticks = [100, 75, 50, 25, 0].map((tick) => ({
    label: Math.round((maxValue * tick) / 100),
    position: tick,
  }));
  const { width, height, paddingX, paddingY, points, linePath, areaPath } = buildDashboardChartGeometry(values, maxValue);
  const lastPoint = points[points.length - 1];

  return (
    <SurfacePanel className="dashboard-card dashboard-chart-panel h-full w-full overflow-hidden p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[1.18rem] font-bold tracking-tight leading-tight text-slate-950 dark:text-gray-100 xl:text-[1.3rem]">Situação da carteira</h2>
        <span className="dashboard-pill dashboard-pill-info text-sm">
          {formatNumber(total)}
        </span>
      </div>
      <div className="mt-5 flex gap-4 sm:gap-5">
        <div className="hidden w-12 shrink-0 flex-col justify-between text-xs font-semibold text-slate-500 dark:text-gray-400 md:flex" style={{ height: `${height}px` }}>
          {ticks.map((tick) => (
            <span key={tick.position}>{formatNumber(tick.label)}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="dashboard-chart-frame relative overflow-hidden rounded-2xl" style={{ height: `${height}px` }}>
            <div className="absolute inset-0">
              {ticks.map((tick) => (
                <span
                  key={tick.position}
                  className="absolute inset-x-0 border-t border-slate-200/70 dark:border-white/10"
                  style={{ top: `${paddingY + ((100 - tick.position) / 100) * (height - paddingY * 2)}px` }}
                />
              ))}
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="dashboard-area-fill" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(37, 99, 235, 0.34)" />
                  <stop offset="100%" stopColor="rgba(37, 99, 235, 0.04)" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#dashboard-area-fill)" />
              <path d={linePath} className="dashboard-line" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point, index) => (
                <circle
                  key={`${point.x}-${point.y}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={index === points.length - 1 ? 5.5 : 4}
                  fill="#dbeafe"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                />
              ))}
            </svg>
            {lastPoint ? (
              <div
                className="absolute -translate-x-1/2 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-blue shadow-lg dark:border-blue-500/30 dark:bg-gray-800 dark:text-blue-200"
                style={{
                  left: `${(lastPoint.x / width) * 100}%`,
                  top: `${Math.max(((lastPoint.y - 52) / height) * 100, 6)}%`,
                }}
              >
                {formatNumber(lastPoint.value)}
              </div>
            ) : null}
          </div>
          <div className="mt-5 grid grid-cols-6 gap-1 text-center text-xs font-semibold text-slate-600 dark:text-gray-300 sm:gap-2 sm:text-sm">
            {DASHBOARD_MONTH_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </SurfacePanel>
  );
}

function DashboardRankingPanel({ title, rows, total, field, onSelect, onViewAll }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <SurfacePanel className="dashboard-card dashboard-ranking-card h-full w-full p-5 xl:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[1.16rem] font-semibold tracking-tight leading-tight text-slate-950 dark:text-gray-100 xl:text-[1.28rem]">{title}</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="rounded-full px-3 py-1 text-sm font-semibold text-sky-600 transition duration-150 hover:bg-sky-50 hover:text-sky-500 dark:text-sky-300 dark:hover:bg-sky-500/10 dark:hover:text-sky-200"
        >
          Ver todos
        </button>
      </div>
      <div className="mt-5 space-y-3.5">
        {rows.slice(0, 5).map((row, index) => {
          const percentage = total ? ((row.value / total) * 100).toFixed(1).replace('.', ',') : '0,0';
          return (
            <button
              key={`${field}-${row.label}`}
              type="button"
              onClick={() => onSelect?.({ [field]: row.label }, `${title}: ${row.label}`)}
              className="dashboard-list-row flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition duration-150"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${DASHBOARD_AVATAR_GRADIENTS[index % DASHBOARD_AVATAR_GRADIENTS.length]} text-xs font-semibold text-white shadow-sm`}>
                {getDashboardInitials(row.label)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-gray-200 xl:text-[0.95rem]">{row.label}</span>
                  <span className="shrink-0 text-sm font-semibold text-slate-500 dark:text-gray-300 xl:text-[0.95rem]">
                    {formatNumber(row.value)} ({percentage}%)
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-brand-blue"
                    style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </SurfacePanel>
  );
}

function DashboardQuickActionsPanel({ onNavigate }) {
  const actions = [
    { key: 'clientes', label: 'Base de Clientes', icon: Users, accent: 'text-sky-500', accentBg: 'bg-sky-500/10', route: 'clientes' },
    { key: 'ecd', label: 'ECD / ECF', icon: BookOpenCheck, accent: 'text-cyan-500', accentBg: 'bg-cyan-500/10', route: 'ecd' },
    { key: 'reinf', label: 'Distribuição de Lucro', icon: FileSpreadsheet, accent: 'text-emerald-500', accentBg: 'bg-emerald-500/10', route: 'reinf' },
    { key: 'relatorios', label: 'Relatórios', icon: FileDown, accent: 'text-violet-500', accentBg: 'bg-violet-500/10', route: 'relatorios' },
  ];

  return (
    <SurfacePanel className="dashboard-actions-card h-full w-full p-5 xl:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[1.18rem] font-semibold tracking-tight leading-tight text-slate-950 dark:text-gray-100 xl:text-[1.28rem]">Ações rápidas</h2>
      </div>
      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => onNavigate?.(action.route, { clearFilters: action.route === 'clientes' })}
              className="dashboard-action-tile flex min-h-[82px] items-center gap-3 rounded-xl px-4 py-4 text-left transition duration-150 hover:-translate-y-0.5"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${action.accentBg} ${action.accent}`}>
                <Icon size={22} aria-hidden="true" />
              </span>
              <span className="text-sm font-medium leading-6 text-slate-700 dark:text-gray-200 xl:text-[0.95rem]">{action.label}</span>
            </button>
          );
        })}
      </div>
    </SurfacePanel>
  );
}

function toBreakdownByResolver(clients, resolver, { filter } = {}) {
  const counts = new Map();

  (clients ?? []).forEach((client) => {
    if (filter && !filter(client)) return;
    const label = String(resolver(client) || '').trim() || 'Não informado';
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'pt-BR'));
}

function DashboardPage({ clients, onPreset, onNavigate }) {
  const total = clients.length;
  const emDia = countWhere(clients, (client) => isCompetenciaEmDia(client));
  const emAtraso = countWhere(clients, (client) => isEmAtraso(client));
  const criticos = countWhere(clients, (client) => isSituacaoCritica(client));
  const pendencias = countWhere(clients, (client) => hasPendenciaAtiva(client));
  const regimeRows = normalizeBreakdownRows(toBreakdown(clients, 'regime_tributario'));
  const responsavelRows = getNormalizedBreakdownRows(clients, 'responsavel');
  const revisorRows = getNormalizedBreakdownRows(clients, 'revisor');
  const situationValues = useMemo(() => {
    if (!total) return [0, 0, 0, 0, 0, 0];

    const base = [
      Math.max(Math.round(total * 0.56), emDia - Math.round(emAtraso / 2)),
      Math.max(Math.round(total * 0.72), emDia),
      Math.max(Math.round(total * 0.6), total - pendencias),
      Math.max(Math.round(total * 0.76), emDia + Math.round((total - emDia) / 3)),
      Math.max(Math.round(total * 0.62), total - criticos),
      total,
    ];

    return base.map((value) => Math.min(Math.max(value, 0), total));
  }, [criticos, emAtraso, emDia, pendencias, total]);

  return (
    <div className="min-w-0 space-y-6">
      <section className="min-w-0 grid items-start gap-5 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(21rem,1.05fr)_minmax(24rem,1.3fr)] 2xl:gap-6">
        <div className="min-w-0">
          <DashboardTotalCard total={total} onClick={() => onNavigate?.('clientes', { clearFilters: true })} />
        </div>
        <div className="min-w-0">
          <DashboardRegimeCard
            rows={regimeRows}
            total={total}
            onSelect={onPreset}
            onNavigate={onNavigate}
          />
        </div>
        <div className="min-w-0">
          <DashboardSituationCard values={situationValues} total={total} />
        </div>
      </section>

      <section className="min-w-0 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(20rem,0.9fr)] 2xl:gap-6">
        <DashboardRankingPanel
          title="Clientes por responsável"
          rows={responsavelRows}
          total={total}
          field="responsavel"
          onSelect={onPreset}
          onViewAll={() => onNavigate?.('clientes', { clearFilters: true })}
        />
        <DashboardRankingPanel
          title="Clientes por revisor"
          rows={revisorRows}
          total={total}
          field="revisor"
          onSelect={onPreset}
          onViewAll={() => onNavigate?.('clientes', { clearFilters: true })}
        />
        <DashboardQuickActionsPanel onNavigate={onNavigate} />
      </section>
    </div>
  );
}

function PageHeader({ title, description, right }) {
  return (
    <SurfacePanel title={title} description={description} right={right} />
  );
}

function SearchAndFilters({
  filters,
  setFilters,
  listagens,
  quickFilterLabel,
  onClear,
  onNewClient,
  onManualFilter,
  visibleCount,
  totalCount,
  canCreateClient,
  canCreateClientEnabled = true,
  createDisabledReason = '',
  clientsForOptions = [],
}) {
  function updateFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
    onManualFilter?.();
  }

  const alertOptions = Object.entries(ALERT_FILTER_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const activeFilterItems = [
    filters.search ? { key: 'search', label: 'Busca', value: filters.search } : null,
    filters.arquivamento && filters.arquivamento !== DEFAULT_FILTERS.arquivamento
      ? {
        key: 'arquivamento',
        label: 'Status do cliente',
        value: getClientStatusFilterOption(filters.arquivamento)?.label || filters.arquivamento,
      }
      : null,
    filters.alerta
      ? {
        key: 'alerta',
        label: 'Alerta',
        value: ALERT_FILTER_LABELS[filters.alerta] || filters.alerta,
      }
      : null,
    ...FILTER_FIELDS.map((fieldKey) => {
      const rawValue = filters[fieldKey];
      if (!rawValue) return null;
      const field = FIELD_DEFINITIONS.find((item) => item.key === fieldKey);
      return {
        key: fieldKey,
        label: field?.label || fieldKey,
        value: rawValue,
      };
    }),
  ].filter(Boolean);

  return (
    <SurfacePanel className="min-w-0 overflow-hidden p-0">
      <div className="border-b border-slate-200/80 bg-gradient-to-br from-white/90 via-white/70 to-slate-50/70 p-4 dark:border-gray-800 dark:from-gray-950/65 dark:via-gray-950/45 dark:to-gray-900/45 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">Busca principal</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300">
            {formatNumber(visibleCount)} de {formatNumber(totalCount)} cliente(s)
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={18} />
            <input
              value={filters.search}
              onChange={(event) => updateFilter({ search: event.target.value })}
              className="input-shell h-10 min-h-10 pl-11 text-sm shadow-sm"
              placeholder="Pesquisar cliente, CNPJ ou razão social"
            />
          </div>

          <div className="grid gap-2.5 min-[480px]:grid-cols-2 lg:flex lg:items-center">
            <ActionButton type="button" variant="secondary" size="sm" onClick={onClear}>
              <RefreshCcw size={16} aria-hidden="true" />
              Limpar filtros
            </ActionButton>
            {canCreateClient ? (
              <ActionButton
                type="button"
                size="sm"
                onClick={onNewClient}
                disabled={!canCreateClientEnabled}
                title={!canCreateClientEnabled ? createDisabledReason : ''}
              >
                <Plus size={16} aria-hidden="true" />
                Novo cliente
              </ActionButton>
            ) : null}
          </div>
        </div>
      </div>


      {quickFilterLabel || activeFilterItems.length ? (
        <div className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/45 sm:mx-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {quickFilterLabel ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                <Filter size={16} aria-hidden="true" />
                {quickFilterLabel}
                <button type="button" onClick={onClear} className="rounded-md p-1 transition hover:bg-sky-100 dark:hover:bg-sky-500/10">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ) : <span />}

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {activeFilterItems.length ? `${formatNumber(activeFilterItems.length)} ativo(s)` : 'Sem filtros'}
            </span>
          </div>

          {activeFilterItems.length ? (
            <div className="flex flex-wrap gap-2">
              {activeFilterItems.slice(0, 5).map((item) => (
                <span
                  key={item.key}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  <span className="text-slate-400 dark:text-gray-500">{item.label}:</span>
                  <span className="max-w-[18ch] truncate">{String(item.value)}</span>
                </span>
              ))}
              {activeFilterItems.length > 5 ? (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  +{activeFilterItems.length - 5} filtro(s)
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-gray-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">Filtros da carteira</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {activeFilterItems.length ? `${formatNumber(activeFilterItems.length)} ativo(s)` : 'Sem filtros'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <DropdownFilterSelect
            label="Status do cliente"
            value={filters.arquivamento}
            options={CLIENT_STATUS_FILTER_OPTIONS}
            onChange={(value) => updateFilter({ arquivamento: value || DEFAULT_FILTERS.arquivamento })}
            includeBlank={false}
            labelClassName="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400"
            buttonClassName="select-shell mt-2 normal-case"
          />
          <DropdownFilterSelect
            label="Alertas e acompanhamento"
            value={filters.alerta}
            options={alertOptions}
            onChange={(value) => updateFilter({ alerta: value })}
            labelClassName="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400"
            buttonClassName="select-shell mt-2 normal-case"
          />
          {FILTER_FIELDS.map((fieldKey) => {
            const field = FIELD_DEFINITIONS.find((item) => item.key === fieldKey);
            const options = getFilterOptionsForField(listagens, field, filters[fieldKey], clientsForOptions);
            return (
              <DropdownFilterSelect
                key={fieldKey}
                label={field?.label ?? fieldKey}
                value={filters[fieldKey]}
                options={options}
                onChange={(value) => updateFilter({ [fieldKey]: value })}
                labelClassName="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400"
                buttonClassName="select-shell mt-2 normal-case"
              />
            );
          })}
        </div>
      </div>

    </SurfacePanel>
  );
}

function ClientsTable({
  clients,
  sort,
  setSort,
  onView,
  onEdit,
  onInactivate,
  onRestore,
  canEditRow,
  canInactivateRow,
  canRestoreRow,
  renderClientCell,
  selectedClientIds = [],
  onToggleSelect,
  onToggleSelectVisible,
  onOpenBatchResponsavel,
  canSelectRow,
}) {
  function sortColumn(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  const selectedIdsSet = new Set(selectedClientIds);
  const selectableClients = clients.filter((client) => canSelectRow?.(client));
  const selectedVisibleCount = selectableClients.filter((client) => selectedIdsSet.has(client.id)).length;
  const allVisibleSelected = selectableClients.length > 0 && selectedVisibleCount === selectableClients.length;
  const hasSelection = selectedClientIds.length > 0;

  return (
    <section className="min-w-0 overflow-hidden surface-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-white/85 via-white/70 to-slate-50/55 px-4 py-3 dark:border-gray-800 dark:from-gray-950/60 dark:via-gray-950/35 dark:to-gray-900/35 sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">Carteira listada</p>
          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-gray-200">
            {formatNumber(clients.length)} cliente(s) visível(is) nesta consulta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasSelection ? (
            <>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                {formatNumber(selectedClientIds.length)} selecionado(s)
              </span>
              <button
                type="button"
                onClick={onOpenBatchResponsavel}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-500/70 bg-brand-blue px-3 py-2 text-xs font-medium text-white shadow-[0_10px_26px_rgba(37,99,235,0.18)] transition hover:-translate-y-px hover:bg-[#0056d6]"
              >
                <UserCog size={14} aria-hidden="true" />
                Alterar responsável
              </button>
            </>
          ) : null}
        </div>
      </div>
      <TableScrollArea className="border-x-0 border-b-0 rounded-none shadow-none" topClassName="mx-4 mt-3 sm:mx-5">
        <table className="table-base base-clients-table min-w-[1760px] 2xl:min-w-[1840px]">
          <thead className="table-head sticky top-0 z-10">
            <tr>
              <th className="table-head-cell table-sticky-left w-72 px-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    disabled={!selectableClients.length}
                    aria-label="Selecionar clientes visíveis"
                    aria-checked={selectedVisibleCount > 0 && !allVisibleSelected ? 'mixed' : allVisibleSelected}
                    onChange={(event) => onToggleSelectVisible?.(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue/20 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span>Cliente</span>
                </div>
              </th>
              {BASE_CLIENTS_TABLE_COLUMNS.map((field) => (
                <th key={field.key} className="table-head-cell">
                  <button
                    type="button"
                    onClick={() => sortColumn(field.key)}
                    className="inline-flex items-center gap-1.5 rounded-md transition hover:text-brand-blue"
                  >
                    {field.label}
                    <ArrowDownUp size={13} aria-hidden="true" />
                  </button>
                </th>
              ))}
              <th className="table-head-cell table-sticky-right w-28">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => onView(client.id)}
                  className={`table-row cursor-pointer ${selectedIdsSet.has(client.id) ? 'table-row-selected' : ''}`}
                >
                  <td className="table-cell table-sticky-left px-4">
                    <div className="flex max-w-72 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIdsSet.has(client.id)}
                        disabled={!canSelectRow?.(client)}
                        aria-label={`Selecionar ${client.nome_identificacao || client.razao_social || 'cliente'}`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onToggleSelect?.(client.id, event.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-blue focus:ring-brand-blue/20 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 text-xs font-semibold text-slate-700 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-900 dark:text-gray-200">
                        {getDashboardInitials(client.nome_identificacao || client.razao_social || 'CL')}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug text-slate-950 dark:text-gray-100">{client.nome_identificacao || client.razao_social}</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-300">{client.cnpj}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-gray-400">{client.razao_social}</p>
                      </div>
                    </div>
                  </td>
                {BASE_CLIENTS_TABLE_COLUMNS.map((field) => (
                  <td key={field.key} className="table-cell">
                    {renderClientCell?.(client, field.key) ?? (field.key === 'situacao' || field.key === 'competencia_em_dia' ? (
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${chipClass(statusTone(getResolvedFieldValue(client, field.key), client))}`}>
                        {valueOrDash(getResolvedFieldValue(client, field.key))}
                      </span>
                    ) : (
                      <span>{renderResolvedFieldValue(client, field.key, field.type)}</span>
                    ))}
                  </td>
                  ))}
                  <td className="table-cell table-sticky-right">
                    <div className="table-actions">
                      {canEditRow(client) ? (
                        <button
                          type="button"
                          aria-label="Editar cliente"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(client);
                        }}
                        className="table-icon-action"
                      >
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                    {canInactivateRow(client) ? (
                      <button
                        type="button"
                        aria-label="Arquivar cliente"
                        title="Arquivar cliente"
                        onClick={(event) => {
                          event.stopPropagation();
                          onInactivate(client);
                        }}
                        className="table-icon-action"
                      >
                        <Archive size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                    {canRestoreRow?.(client) ? (
                      <button
                        type="button"
                        aria-label="Restaurar cliente"
                        title="Restaurar cliente"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRestore?.(client);
                        }}
                        className="table-icon-action"
                      >
                        <RefreshCcw size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </td>
                </tr>
            ))}
          </tbody>
        </table>
      </TableScrollArea>

      {!clients.length ? (
        <div className="empty-state min-h-64">
          <Search className="text-slate-300 dark:text-gray-600" size={42} aria-hidden="true" />
          <p className="text-lg font-black text-slate-800 dark:text-gray-100">Nenhum cliente encontrado para os filtros selecionados.</p>
          <p className="text-sm font-semibold text-slate-500 dark:text-gray-300">Revise os filtros aplicados ou limpe a busca para voltar a ver a carteira.</p>
        </div>
      ) : null}
    </section>
  );
}

function BaseClientesPage(props) {
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [batchResponsavelOpen, setBatchResponsavelOpen] = useState(false);
  const [batchResponsavelValue, setBatchResponsavelValue] = useState('');
  const [batchResponsavelBusy, setBatchResponsavelBusy] = useState(false);

  const canSelectClientForBatch = (client) => Boolean(props.canBatchUpdateResponsavel?.(client));
  const selectedClientIdSet = useMemo(() => new Set(selectedClientIds), [selectedClientIds]);
  const selectedClients = useMemo(
    () => (props.allClients ?? props.clients).filter((client) => selectedClientIdSet.has(client.id)),
    [props.allClients, props.clients, selectedClientIdSet],
  );
  const activeResponsavelOptions = props.responsavelOptions ?? [];

  useEffect(() => {
    setSelectedClientIds((current) => current.filter((id) => props.clients.some((client) => client.id === id && canSelectClientForBatch(client))));
  }, [props.clients]);

  function toggleClientSelection(clientId, checked) {
    setSelectedClientIds((current) => {
      if (checked) return current.includes(clientId) ? current : [...current, clientId];
      return current.filter((id) => id !== clientId);
    });
  }

  function toggleVisibleSelection(checked) {
    const visibleSelectableIds = props.clients.filter(canSelectClientForBatch).map((client) => client.id);
    setSelectedClientIds((current) => {
      if (!checked) return current.filter((id) => !visibleSelectableIds.includes(id));
      return [...new Set([...current, ...visibleSelectableIds])];
    });
  }

  function openBatchResponsavelModal() {
    setBatchResponsavelValue('');
    setBatchResponsavelOpen(true);
  }

  async function confirmBatchResponsavel() {
    if (!props.onBatchUpdateResponsavel || !selectedClientIds.length || !batchResponsavelValue) return;
    setBatchResponsavelBusy(true);
    try {
      const ok = await props.onBatchUpdateResponsavel(selectedClientIds, batchResponsavelValue);
      if (ok) {
        setSelectedClientIds([]);
        setBatchResponsavelOpen(false);
        setBatchResponsavelValue('');
      }
    } finally {
      setBatchResponsavelBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Carteira exibida"
          value={props.clients.length}
          detail={`${formatNumber(props.allClients?.length ?? props.clients.length)} cliente(s) disponível(is) na base`}
          icon={Users}
          tone="success"
        />
      </section>
      <SearchAndFilters {...props} clientsForOptions={props.allClients ?? props.clients} />
      <ClientsTable
        clients={props.clients}
        sort={props.sort}
        setSort={props.setSort}
        onView={props.onView}
        onEdit={props.onEdit}
        onInactivate={props.onInactivate}
        onRestore={props.onRestore}
        canEditRow={props.canEditRow}
        canInactivateRow={props.canInactivateRow}
        canRestoreRow={props.canRestoreRow}
        renderClientCell={props.renderClientCell}
        selectedClientIds={selectedClientIds}
        onToggleSelect={toggleClientSelection}
        onToggleSelectVisible={toggleVisibleSelection}
        onOpenBatchResponsavel={openBatchResponsavelModal}
        canSelectRow={canSelectClientForBatch}
      />
      {batchResponsavelOpen ? (
        <div className="modal-backdrop z-[70] flex items-center justify-center">
          <section className="modal-panel modal-panel-sm p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="modal-eyebrow">Alteração em lote</p>
                <h2 className="modal-title">Alterar responsável</h2>
                <p className="modal-subtitle">
                  {formatNumber(selectedClients.length)} cliente(s) selecionado(s). Escolha um responsável ativo para receber essa carteira.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBatchResponsavelOpen(false)}
                disabled={batchResponsavelBusy}
                className="modal-close-button disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <DropdownFilterSelect
              label="Novo responsável"
              value={batchResponsavelValue}
              options={activeResponsavelOptions}
              onChange={setBatchResponsavelValue}
              includeBlank
              emptyLabel="Selecione um responsável ativo"
              disabled={batchResponsavelBusy}
              labelClassName="mt-5 block text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400"
              buttonClassName="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-800 outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />

            <div className="modal-warning mt-5">
              A alteração atualiza somente o campo responsável dos clientes selecionados e registra histórico para auditoria.
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchResponsavelOpen(false)}
                disabled={batchResponsavelBusy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBatchResponsavel}
                disabled={batchResponsavelBusy || !batchResponsavelValue || !selectedClients.length}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-black text-white transition hover:bg-[#0056d6] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {batchResponsavelBusy ? <RefreshCcw size={16} className="animate-spin" aria-hidden="true" /> : <UserCog size={16} aria-hidden="true" />}
                {batchResponsavelBusy ? 'Alterando...' : 'Confirmar alteração'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DetailPage({
  client,
  onBack,
  onEdit,
  canEditCurrent,
  canManageAttachments,
  canManageContratosSociais,
  onAnexoSuccess,
  onAnexoRemove,
  onAnexoError,
  onContratoSocialSuccess,
  historicoRows = [],
  historicoLoading = false,
  reinfRelatorios = [],
}) {
  if (!client) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="font-black text-slate-900 dark:text-gray-100">Cliente não encontrado.</p>
        <button type="button" onClick={onBack} className="mt-4 rounded-lg bg-brand-blue px-4 py-2 text-sm font-black text-white">
          Voltar
        </button>
      </div>
    );
  }

  const visibleDetailSections = DETAIL_SECTIONS.filter(
    (section) => !['Documentação', 'Responsáveis e Revisão', 'Alertas e Pendências'].includes(section.title),
  );
  const distribuicaoLucroSummary = buildClientDistribuicaoLucroSummary(client, reinfRelatorios);

  return (
    <div className="min-w-0 space-y-5">
      <section className="surface-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-brand-blue">
              <ChevronRight className="rotate-180" size={16} aria-hidden="true" />
              Base de clientes
            </button>
            <h2 className="text-3xl font-black text-slate-950 dark:text-gray-100">{client.nome_identificacao || client.razao_social}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-gray-300">{client.razao_social}</p>
            <p className="mt-1 text-sm font-bold text-slate-700 dark:text-gray-200">{client.cnpj}</p>
          </div>
          {canEditCurrent ? (
            <button
              type="button"
              onClick={() => onEdit(client)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-navy-700"
            >
              <Edit3 size={16} aria-hidden="true" />
              Editar cliente
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {visibleDetailSections.map((section) => (
          <article key={section.title} className="surface-card p-5">
            <h3 className="text-lg font-black text-slate-950 dark:text-gray-100">{section.title}</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.fields.map((fieldKey) => {
                const field = FIELD_DEFINITIONS.find((item) => item.key === fieldKey);
                return (
                  <div key={fieldKey} className="rounded-lg bg-slate-50 p-3 dark:bg-gray-800">
                    <dt className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">{field?.label ?? fieldKey}</dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900 dark:text-gray-100">{renderResolvedFieldValue(client, fieldKey, field?.type)}</dd>
                  </div>
                );
              })}
            </dl>
          </article>
        ))}
        <article className="surface-card p-5">
          <h3 className="text-lg font-black text-slate-950 dark:text-gray-100">Distribuição de Lucro</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {distribuicaoLucroSummary.fields.map((field) => (
              <div key={field.label} className="rounded-lg bg-slate-50 p-3 dark:bg-gray-800">
                <dt className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">{field.label}</dt>
                <dd className="mt-1 text-sm font-bold text-slate-900 dark:text-gray-100">
                  {field.label === 'Status' ? (
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${distribuicaoLucroSummary.relatorio ? chipClass('success') : chipClass('muted')}`}>
                      {field.value}
                    </span>
                  ) : field.value}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <AnexosClienteSection
        cliente={client}
        disabled={!canManageAttachments}
        onSuccess={(tipoAnexo, anexo) => onAnexoSuccess?.(client.id, tipoAnexo, anexo)}
        onRemove={(tipoAnexo, anexo) => onAnexoRemove?.(client.id, tipoAnexo, anexo)}
        onError={onAnexoError}
      />

      <ContratosSociaisClienteSection
        cliente={client}
        disabled={!canManageContratosSociais}
        onSuccess={(contrato) => onContratoSocialSuccess?.(contrato?.cliente_id || client.id, contrato, client.id)}
        onError={onAnexoError}
      />
    </div>
  );
}

function useFloatingDropdown(open, containerRef) {
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    function updatePosition() {
      if (typeof window === 'undefined') return;
      const trigger = containerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;
      const menuWidth = Math.max(rect.width, 220);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const availableSpace = openUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(256, Math.max(144, availableSpace - gap));
      const top = openUp
        ? Math.max(viewportPadding, rect.top - maxHeight - gap)
        : Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - maxHeight);

      setMenuStyle({
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${menuWidth}px`,
        maxHeight: `${maxHeight}px`,
        zIndex: 9999,
      });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, containerRef]);

  return { menuRef, menuStyle };
}

function DropdownFilterSelect({
  label,
  value,
  options,
  onChange,
  includeBlank = true,
  emptyLabel,
  disabled = false,
  disabledReason,
  labelClassName = 'text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-gray-400',
  buttonClassName = 'select-shell mt-1 normal-case',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const { menuRef, menuStyle } = useFloatingDropdown(open, containerRef);
  const blankLabel = emptyLabel ?? (includeBlank ? 'Todos' : 'Não informado');
  const normalizedOptions = [
    ...(includeBlank ? [{ value: '', label: blankLabel }] : []),
    ...options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option)),
  ];
  const selectedOption = normalizedOptions.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? blankLabel;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleSelect(nextValue) {
    if (disabled) return;
    onChange(nextValue);
    setOpen(false);
  }

  const dropdownMenu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        style={menuStyle ?? { visibility: 'hidden' }}
        className="dropdown-menu-shell overflow-soft normal-case ring-1 ring-slate-900/5 dark:ring-white/5"
      >
        {normalizedOptions.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={(event) => {
                event.stopPropagation();
                handleSelect(option.value);
              }}
              className={`dropdown-option ${selected ? 'dropdown-option-selected' : ''}`}
            >
              <span className="truncate">{option.label}</span>
              {selected ? <Check size={15} className="shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={containerRef} className={`relative ${labelClassName}`}>
      <span>{label}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) setOpen((current) => !current);
        }}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        className={`${buttonClassName} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {dropdownMenu}
    </div>
  );
}

function DropdownMultiSelect({
  label,
  values = [],
  options,
  onChange,
  emptyLabel = 'Selecione',
  disabled = false,
  disabledReason,
  labelClassName = 'text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-gray-400',
  buttonClassName = 'select-shell mt-1 normal-case',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const { menuRef, menuStyle } = useFloatingDropdown(open, containerRef);
  const normalizedOptions = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option));
  const selectedValues = Array.isArray(values) ? values : [];
  const selectedLabels = normalizedOptions
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const selectedLabel = selectedLabels.length
    ? selectedLabels.join(', ')
    : emptyLabel;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function toggleValue(nextValue) {
    if (disabled) return;
    const alreadySelected = selectedValues.includes(nextValue);
    const nextValues = alreadySelected
      ? selectedValues.filter((value) => value !== nextValue)
      : [...selectedValues, nextValue];
    const orderedValues = normalizedOptions
      .map((option) => option.value)
      .filter((value) => nextValues.includes(value));
    onChange(orderedValues);
  }

  const dropdownMenu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-multiselectable="true"
        style={menuStyle ?? { visibility: 'hidden' }}
        className="dropdown-menu-shell overflow-soft normal-case ring-1 ring-slate-900/5 dark:ring-white/5"
      >
        {normalizedOptions.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={(event) => {
                event.stopPropagation();
                toggleValue(option.value);
              }}
              className={`dropdown-option ${selected ? 'dropdown-option-selected' : ''}`}
            >
              <span className="truncate">{option.label}</span>
              {selected ? <Check size={15} className="shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={containerRef} className={`relative ${labelClassName}`}>
      <span>{label}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) setOpen((current) => !current);
        }}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        className={`${buttonClassName} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {dropdownMenu}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange, includeBlank = true }) {
  return (
    <DropdownFilterSelect
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      includeBlank={includeBlank}
    />
  );
}

function ReinfFiscalModal({ client, selectedSocioByClientId = {}, responsavelOptions = [], reinfRelatorios = [], onSelectSocio, onSaveReport, onSendEmail, onClose }) {
  const socios = getReinfSocios(client);
  const clientKey = String(client?.id ?? client?.cnpj ?? '').trim();
  const responsavelAssinatura = useMemo(() => {
    const responsavelNome = getResponsavelOperacional(client) || client?.responsavel || '';
    return responsavelOptions.find((item) => normalizeText(item.valor) === normalizeText(responsavelNome)) ?? null;
  }, [client?.responsavel, responsavelOptions]);
  const assinaturaResponsavelUrl = responsavelAssinatura?.assinatura_email_path
    ? gerarUrlPublicaAssinaturaResponsavel(responsavelAssinatura.assinatura_email_path)
    : '';
  const assinaturaResponsavelNome = responsavelAssinatura?.valor || getResponsavelOperacional(client) || client?.responsavel || '';
  const currentSocio = getSelectedReinfSocio(client, selectedSocioByClientId);
  const currentSocioIndex = currentSocio ? socios.indexOf(currentSocio) : 0;
  const currentSocioKey = currentSocio ? getReinfSocioOptionKey(currentSocio, currentSocioIndex) : '';
  const getSocioByKey = (socioKey) => socios.find((socio, index) => getReinfSocioOptionKey(socio, index) === socioKey) ?? null;
  const createInitialReportSocios = () => {
    const initialKey = currentSocioKey || (socios[0] ? getReinfSocioOptionKey(socios[0], 0) : '');
    return initialKey ? [{ socioKey: initialKey, meses: [], valoresPorMes: {}, valoresTotais: createEmptyReinfTotalValues(), valoresTotaisPorMes: {}, valoresHistorico: createEmptyReinfHistoryMarks() }] : [];
  };
  const [reportSocios, setReportSocios] = useState(createInitialReportSocios);
  const [socioToAdd, setSocioToAdd] = useState('');
  const [modeloTabela, setModeloTabela] = useState(REINF_TABLE_MODEL_MONTHLY);
  const [mesesReferenciaTotal, setMesesReferenciaTotal] = useState([]);
  const [periodicidade, setPeriodicidade] = useState('Trimestral');
  const [anoReferencia, setAnoReferencia] = useState(String(new Date().getFullYear()));
  const [assuntoEditado, setAssuntoEditado] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [mensagemEditada, setMensagemEditada] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [savedReportKey, setSavedReportKey] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [retificacaoAtiva, setRetificacaoAtiva] = useState(false);
  const reportSociosHydrated = useMemo(() => reportSocios
    .map((reportSocio) => ({
      ...reportSocio,
      socio: getSocioByKey(reportSocio.socioKey),
    }))
    .filter((reportSocio) => reportSocio.socio), [reportSocios, client?._socios]);
  const selectedReportSocioKeys = new Set(reportSocios.map((reportSocio) => reportSocio.socioKey));
  const availableSociosToAdd = socios
    .map((socio, index) => ({ socio, socioKey: getReinfSocioOptionKey(socio, index) }))
    .filter((item) => !selectedReportSocioKeys.has(item.socioKey));
  const suggestedPeriodicity = getReinfPeriodicitySuggestionFromReportSocios(reportSociosHydrated);
  const isTotalsModel = isReinfTotalsTableModel(modeloTabela);
  const reportMonths = useMemo(() => (
    isTotalsModel
      ? REINF_MONTH_OPTIONS.map((month) => month.value).filter((month) => mesesReferenciaTotal.includes(month))
      : getReinfReportMonths(reportSociosHydrated)
  ), [isTotalsModel, mesesReferenciaTotal, reportSociosHydrated]);
  const reinfHistoryValueIndex = useMemo(() => createReinfHistoryValueIndex({
    relatorios: reinfRelatorios,
    client,
  }), [reinfRelatorios, client?.id, client?.cnpj]);
  const hasValoresHistoricos = useMemo(() => hasReinfHistoryValues(
    reportSociosHydrated,
    reportMonths,
    isTotalsModel,
  ), [reportSociosHydrated, reportMonths, isTotalsModel]);

  function hydrateReportSocioFromHistory(reportSocio, months = []) {
    if (!reinfHistoryValueIndex.size || !months.length) return reportSocio;

    const socio = getSocioByKey(reportSocio.socioKey);
    if (!socio) return reportSocio;

    const socioIndex = socios.indexOf(socio);
    let changed = false;

    if (isTotalsModel) {
      const nextValoresPorMes = { ...(reportSocio.valoresPorMes ?? {}) };
      const nextValoresTotaisPorMes = {
        ...(reportSocio.valoresTotaisPorMes ?? {}),
      };
      let nextValoresHistorico = reportSocio.valoresHistorico ?? createEmptyReinfHistoryMarks();

      REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
        nextValoresTotaisPorMes[field.key] = {
          ...(nextValoresTotaisPorMes[field.key] ?? {}),
        };
      });

      months.forEach((month) => {
        REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
          const currentValue = getReinfTotalMonthlyValue({
            ...reportSocio,
            valoresPorMes: nextValoresPorMes,
            valoresTotaisPorMes: nextValoresTotaisPorMes,
          }, field.key, month);
          if (String(currentValue ?? '').trim()) return;

          const historyValue = findReinfHistoryValue(reinfHistoryValueIndex, {
            client,
            socio,
            socioIndex,
            anoReferencia,
            month,
            modeloTabela,
            fieldKey: field.key,
          });
          if (!String(historyValue ?? '').trim()) return;

          nextValoresTotaisPorMes[field.key][month] = historyValue;
          nextValoresHistorico = markReinfHistoryTotalValue(nextValoresHistorico, field.key, month);
          if (field.key === 'totalDistribuidoTributavel') {
            nextValoresPorMes[month] = historyValue;
            nextValoresHistorico = markReinfHistoryMonthlyValue(nextValoresHistorico, month);
          }
          changed = true;
        });
      });

      return changed
        ? {
          ...reportSocio,
          valoresPorMes: nextValoresPorMes,
          valoresTotaisPorMes: nextValoresTotaisPorMes,
          valoresHistorico: nextValoresHistorico,
        }
        : reportSocio;
    }

    const nextValoresPorMes = { ...(reportSocio.valoresPorMes ?? {}) };
    const nextValoresTotaisPorMes = {
      ...(reportSocio.valoresTotaisPorMes ?? {}),
      totalDistribuidoTributavel: {
        ...(reportSocio.valoresTotaisPorMes?.totalDistribuidoTributavel ?? {}),
      },
    };
    let nextValoresHistorico = reportSocio.valoresHistorico ?? createEmptyReinfHistoryMarks();

    months.forEach((month) => {
      if (String(nextValoresPorMes[month] ?? '').trim()) return;
      const historyValue = findReinfHistoryValue(reinfHistoryValueIndex, {
        client,
        socio,
        socioIndex,
        anoReferencia,
        month,
        modeloTabela,
      });
      if (!String(historyValue ?? '').trim()) return;

      nextValoresPorMes[month] = historyValue;
      nextValoresTotaisPorMes.totalDistribuidoTributavel[month] = historyValue;
      nextValoresHistorico = markReinfHistoryMonthlyValue(nextValoresHistorico, month);
      nextValoresHistorico = markReinfHistoryTotalValue(nextValoresHistorico, 'totalDistribuidoTributavel', month);
      changed = true;
    });

    return changed
      ? {
        ...reportSocio,
        valoresPorMes: nextValoresPorMes,
        valoresTotaisPorMes: nextValoresTotaisPorMes,
        valoresHistorico: nextValoresHistorico,
      }
      : reportSocio;
  }

  useEffect(() => {
    if (!reinfHistoryValueIndex.size) return;
    setReportSocios((current) => {
      let changed = false;
      const next = current.map((reportSocio) => {
        const months = isTotalsModel ? reportMonths : (reportSocio.meses ?? []);
        const hydrated = hydrateReportSocioFromHistory(reportSocio, months);
        if (hydrated !== reportSocio) changed = true;
        return hydrated;
      });
      return changed ? next : current;
    });
  }, [reinfHistoryValueIndex, anoReferencia, modeloTabela, reportMonths.join('|'), isTotalsModel]);

  useEffect(() => {
    setReportSocios(createInitialReportSocios());
    setSocioToAdd('');
    setModeloTabela(REINF_TABLE_MODEL_MONTHLY);
    setMesesReferenciaTotal([]);
    setPeriodicidade('Trimestral');
    setAnoReferencia(String(new Date().getFullYear()));
    setAssuntoEditado(false);
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
    setSaveStatus('');
    setSavingReport(false);
    setSavedReportKey('');
    setSendStatus('');
    setSendingEmail(false);
    setRetificacaoAtiva(false);
  }, [client?.id]);

  useEffect(() => {
    setSocioToAdd((current) => {
      if (current && availableSociosToAdd.some((item) => item.socioKey === current)) return current;
      return availableSociosToAdd[0]?.socioKey ?? '';
    });
  }, [availableSociosToAdd.map((item) => item.socioKey).join('|')]);

  useEffect(() => {
    setPeriodicidade(isTotalsModel ? 'Mensal' : suggestedPeriodicity);
  }, [isTotalsModel, suggestedPeriodicity]);

  useEffect(() => {
    if (!client || typeof document === 'undefined') return undefined;
    document.body.classList.add('reinf-modal-open');
    return () => {
      document.body.classList.remove('reinf-modal-open');
    };
  }, [client]);

  const generatedSubject = useMemo(() => buildReinfFiscalSubject({
    client,
    months: reportMonths,
    anoReferencia,
  }), [client, reportMonths, anoReferencia]);

  const generatedMessage = useMemo(() => buildReinfFiscalBodyText({
    client,
    months: reportMonths,
    anoReferencia,
    periodicidade,
  }), [client, reportMonths, anoReferencia, periodicidade]);
  const previewBodyParts = useMemo(() => splitReinfFiscalBodyText(mensagem), [mensagem]);

  useEffect(() => {
    if (!assuntoEditado) {
      setAssunto(generatedSubject);
    }
  }, [generatedSubject, assuntoEditado]);

  useEffect(() => {
    if (!mensagemEditada) {
      setMensagem(generatedMessage);
    }
  }, [generatedMessage, mensagemEditada]);

  function addReportSocio() {
    if (!socioToAdd || selectedReportSocioKeys.has(socioToAdd)) return;
    setReportSocios((current) => [...current, { socioKey: socioToAdd, meses: [], valoresPorMes: {}, valoresTotais: createEmptyReinfTotalValues(), valoresTotaisPorMes: {}, valoresHistorico: createEmptyReinfHistoryMarks() }]);
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
    setRetificacaoAtiva(false);
  }

  function enableRetificacao() {
    const confirmed = window.confirm(
      'Esses valores já foram enviados anteriormente. Deseja habilitar a edição para fazer uma retificação?',
    );
    if (!confirmed) return;
    setRetificacaoAtiva(true);
    setSaveStatus('');
    setSendStatus('Retificação habilitada');
  }

  function removeReportSocio(socioKey) {
    setReportSocios((current) => current.filter((reportSocio) => reportSocio.socioKey !== socioKey));
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
    setRetificacaoAtiva(false);
  }

  function toggleMes(socioKey, month) {
    setReportSocios((current) => current.map((reportSocio) => {
      if (reportSocio.socioKey !== socioKey) return reportSocio;
      const currentMeses = reportSocio.meses ?? [];
      if (currentMeses.includes(month)) {
        const nextValues = { ...(reportSocio.valoresPorMes ?? {}) };
        const nextTotalMonthlyValues = { ...(reportSocio.valoresTotaisPorMes ?? {}) };
        delete nextValues[month];
        REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
          nextTotalMonthlyValues[field.key] = { ...(nextTotalMonthlyValues[field.key] ?? {}) };
          delete nextTotalMonthlyValues[field.key][month];
        });
        return {
          ...reportSocio,
          meses: currentMeses.filter((item) => item !== month),
          valoresPorMes: nextValues,
          valoresTotaisPorMes: nextTotalMonthlyValues,
          valoresHistorico: clearReinfHistoryMarksForMonth(reportSocio.valoresHistorico, month),
        };
      }
      return {
        ...reportSocio,
        meses: [...currentMeses, month],
      };
    }));
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
    setRetificacaoAtiva(false);
  }

  function clearMeses(socioKey) {
    setReportSocios((current) => current.map((reportSocio) => (
      reportSocio.socioKey === socioKey
        ? { ...reportSocio, meses: [], valoresPorMes: {}, valoresTotaisPorMes: {}, valoresHistorico: createEmptyReinfHistoryMarks() }
        : reportSocio
    )));
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
    setRetificacaoAtiva(false);
  }

  function updateValorMes(socioKey, month, value) {
    setReportSocios((current) => current.map((reportSocio) => (
      reportSocio.socioKey === socioKey
        ? {
          ...reportSocio,
          valoresPorMes: {
            ...(reportSocio.valoresPorMes ?? {}),
            [month]: value,
          },
          valoresTotaisPorMes: {
            ...(reportSocio.valoresTotaisPorMes ?? {}),
            totalDistribuidoTributavel: {
              ...(reportSocio.valoresTotaisPorMes?.totalDistribuidoTributavel ?? {}),
              [month]: value,
            },
          },
          valoresHistorico: clearReinfHistoryTotalValue(
            clearReinfHistoryMonthlyValue(reportSocio.valoresHistorico, month),
            'totalDistribuidoTributavel',
            month,
          ),
        }
        : reportSocio
    )));
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
  }

  function formatValorMes(socioKey, month) {
    setReportSocios((current) => current.map((reportSocio) => {
      if (reportSocio.socioKey !== socioKey) return reportSocio;
      const formatted = formatCurrencyInput(reportSocio.valoresPorMes?.[month]);
      if (!formatted) return reportSocio;
      return {
        ...reportSocio,
        valoresPorMes: {
          ...(reportSocio.valoresPorMes ?? {}),
          [month]: formatted,
        },
        valoresTotaisPorMes: {
          ...(reportSocio.valoresTotaisPorMes ?? {}),
          totalDistribuidoTributavel: {
            ...(reportSocio.valoresTotaisPorMes?.totalDistribuidoTributavel ?? {}),
            [month]: formatted,
          },
        },
      };
    }));
  }

  function updateValorTotalMes(socioKey, fieldKey, month, value) {
    setReportSocios((current) => current.map((reportSocio) => {
      if (reportSocio.socioKey !== socioKey) return reportSocio;
      const nextReportSocio = {
        ...reportSocio,
        valoresTotaisPorMes: {
          ...(reportSocio.valoresTotaisPorMes ?? {}),
          [fieldKey]: {
            ...(reportSocio.valoresTotaisPorMes?.[fieldKey] ?? {}),
            [month]: value,
          },
        },
      };
      if (fieldKey === 'totalDistribuidoTributavel') {
        nextReportSocio.valoresPorMes = {
          ...(reportSocio.valoresPorMes ?? {}),
          [month]: value,
        };
        nextReportSocio.valoresHistorico = clearReinfHistoryMonthlyValue(nextReportSocio.valoresHistorico, month);
      }
      nextReportSocio.valoresHistorico = clearReinfHistoryTotalValue(nextReportSocio.valoresHistorico, fieldKey, month);
      return nextReportSocio;
    }));
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
  }

  function formatValorTotalMes(socioKey, fieldKey, month) {
    setReportSocios((current) => current.map((reportSocio) => {
      if (reportSocio.socioKey !== socioKey) return reportSocio;
      const formatted = formatCurrencyInput(getReinfTotalMonthlyValue(reportSocio, fieldKey, month));
      if (!formatted) return reportSocio;
      const nextReportSocio = {
        ...reportSocio,
        valoresTotaisPorMes: {
          ...(reportSocio.valoresTotaisPorMes ?? {}),
          [fieldKey]: {
            ...(reportSocio.valoresTotaisPorMes?.[fieldKey] ?? {}),
            [month]: formatted,
          },
        },
      };
      if (fieldKey === 'totalDistribuidoTributavel') {
        nextReportSocio.valoresPorMes = {
          ...(reportSocio.valoresPorMes ?? {}),
          [month]: formatted,
        };
      }
      return nextReportSocio;
    }));
  }

  function updateValorTotal(socioKey, fieldKey, value) {
    setReportSocios((current) => current.map((reportSocio) => (
      reportSocio.socioKey === socioKey
        ? {
          ...reportSocio,
          valoresTotais: {
            ...createEmptyReinfTotalValues(),
            ...(reportSocio.valoresTotais ?? {}),
            [fieldKey]: value,
          },
        }
        : reportSocio
    )));
    setMensagemEditada(false);
    setCopied(false);
    setCopyStatus('');
  }

  function formatValorTotal(socioKey, fieldKey) {
    setReportSocios((current) => current.map((reportSocio) => {
      if (reportSocio.socioKey !== socioKey) return reportSocio;
      const formatted = formatCurrencyInput(reportSocio.valoresTotais?.[fieldKey]);
      if (!formatted) return reportSocio;
      return {
        ...reportSocio,
        valoresTotais: {
          ...createEmptyReinfTotalValues(),
          ...(reportSocio.valoresTotais ?? {}),
          [fieldKey]: formatted,
        },
      };
    }));
  }

  async function copyMessage() {
    setSendStatus('');
    const plainText = buildReinfFiscalPlainMessage({
      assunto,
      bodyText: mensagem,
      reportSocios: reportSociosHydrated,
      months: reportMonths,
      modeloTabela,
      assinaturaNome: assinaturaResponsavelUrl ? assinaturaResponsavelNome : '',
      retificacao: retificacaoAtiva,
    });
    const htmlText = buildReinfFiscalHtmlMessage({
      assunto,
      bodyText: mensagem,
      reportSocios: reportSociosHydrated,
      months: reportMonths,
      modeloTabela,
      assinaturaUrl: assinaturaResponsavelUrl,
      assinaturaNome: assinaturaResponsavelNome,
      retificacao: retificacaoAtiva,
    });
    try {
      await copyRichTextToClipboard({ htmlText, plainText });
      setCopied(true);
      setCopyStatus('E-mail copiado');
    } catch {
      setCopied(false);
      setCopyStatus('Falha ao copiar');
    }
  }

  function getReportSaveKey(payload) {
    return JSON.stringify({
      cliente_id: payload?.cliente_id ?? '',
      modelo_tabela: payload?.modelo_tabela ?? '',
      periodicidade: payload?.periodicidade ?? '',
      ano_referencia: payload?.ano_referencia ?? '',
      meses: payload?.meses ?? [],
      assunto: payload?.assunto ?? '',
      socios: payload?.socios ?? [],
    });
  }

  async function saveReport() {
    setSaveStatus('');
    setSendStatus('');
    if (!client?.id) {
      setSaveStatus('Cliente inválido para salvar');
      return;
    }
    if (!reportSociosHydrated.length) {
      setSaveStatus('Inclua pelo menos um sócio');
      return;
    }
    if (!reportMonths.length) {
      setSaveStatus(isTotalsModel ? 'Selecione ao menos um mês de referência' : 'Selecione ao menos um mês');
      return;
    }
    if (isTotalsModel && !hasReinfTotalsValues(reportSociosHydrated, reportMonths)) {
      setSaveStatus('Informe ao menos um valor na tabela de totais');
      return;
    }
    if (!onSaveReport) {
      setSaveStatus('Salvamento indisponível');
      return;
    }

    const payload = buildReinfReportPayload({
      client,
      modeloTabela,
      periodicidade,
      anoReferencia,
      months: reportMonths,
      assunto,
      mensagem,
      reportSocios: reportSociosHydrated,
    });

    setSavingReport(true);
    try {
      const saved = await onSaveReport(payload);
      if (saved) setSavedReportKey(getReportSaveKey(payload));
      setSaveStatus(saved ? 'Relatório salvo' : 'Não foi possível salvar');
    } catch (error) {
      setSaveStatus(error?.message || 'Não foi possível salvar');
    } finally {
      setSavingReport(false);
    }
  }

  async function sendEmail() {
    setSendStatus('');
    if (!client?.id) {
      setSendStatus('Cliente inválido para envio');
      return;
    }
    if (!reportSociosHydrated.length) {
      setSendStatus('Inclua pelo menos um sócio');
      return;
    }
    if (!reportMonths.length) {
      setSendStatus(isTotalsModel ? 'Selecione ao menos um mês de referência' : 'Selecione ao menos um mês');
      return;
    }
    if (isTotalsModel && !hasReinfTotalsValues(reportSociosHydrated, reportMonths)) {
      setSendStatus('Informe ao menos um valor na tabela de totais');
      return;
    }
    if (!onSendEmail) {
      setSendStatus('Envio indisponível');
      return;
    }

    const relatorio = buildReinfReportPayload({
      client,
      modeloTabela,
      periodicidade,
      anoReferencia,
      months: reportMonths,
      assunto,
      mensagem,
      reportSocios: reportSociosHydrated,
    });
    const wasRetificacao = retificacaoAtiva;
    const plainText = buildReinfFiscalPlainMessage({
      assunto,
      bodyText: mensagem,
      reportSocios: reportSociosHydrated,
      months: reportMonths,
      modeloTabela,
      assinaturaNome: assinaturaResponsavelUrl ? assinaturaResponsavelNome : '',
      retificacao: retificacaoAtiva,
    });
    const htmlText = buildReinfFiscalHtmlMessage({
      assunto,
      bodyText: mensagem,
      reportSocios: reportSociosHydrated,
      months: reportMonths,
      modeloTabela,
      assinaturaUrl: assinaturaResponsavelUrl,
      assinaturaNome: assinaturaResponsavelNome,
      retificacao: retificacaoAtiva,
    });

    setSendingEmail(true);
    try {
      const sent = await onSendEmail({
        assunto,
        corpo_mensagem: plainText,
        html_mensagem: htmlText,
        relatorio,
      });
      if (sent) {
        if (!onSaveReport) {
          setSendStatus('E-mail enviado, salvamento indisponível');
          return;
        }

        const reportKey = getReportSaveKey(relatorio);
        if (savedReportKey === reportKey) {
          setReportSocios((current) => markReinfReportSociosAsHistory(current, reportMonths, isTotalsModel));
          setRetificacaoAtiva(false);
          setSendStatus(wasRetificacao ? 'Retificação enviada' : 'E-mail enviado');
          return;
        }

        setSavingReport(true);
        try {
          const saved = await onSaveReport(relatorio);
          if (saved) {
            setSavedReportKey(reportKey);
            setReportSocios((current) => markReinfReportSociosAsHistory(current, reportMonths, isTotalsModel));
            setRetificacaoAtiva(false);
            setSaveStatus(wasRetificacao ? 'Retificação salva' : 'Relatório salvo');
            setSendStatus(wasRetificacao ? 'Retificação enviada e relatório salvo' : 'E-mail enviado e relatório salvo');
          } else {
            setSendStatus('E-mail enviado, mas relatório não foi salvo');
          }
        } catch (saveError) {
          setSaveStatus(saveError?.message || 'Não foi possível salvar');
          setSendStatus('E-mail enviado, mas relatório não foi salvo');
        }
        return;
      }
      setSendStatus(sent ? 'E-mail enviado' : 'Não foi possível enviar');
    } catch (error) {
      setSendStatus(error?.message || 'Não foi possível enviar');
    } finally {
      setSavingReport(false);
      setSendingEmail(false);
    }
  }

  if (!client) return null;

  const modalContent = (
    <div className="modal-backdrop reinf-modal-backdrop z-[70]">
      <div className="modal-panel modal-panel-xl reinf-modal-panel">
        <div className="modal-header flex items-start justify-between gap-3">
          <div>
            <p className="modal-eyebrow">Preparação da Distribuição de Lucro</p>
            <h2 className="modal-title">{getClientDisplayName(client)}</h2>
            <p className="modal-subtitle">{formatCnpj(client.cnpj)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="modal-close-button"
            aria-label="Fechar modal de distribuição de lucro"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body reinf-modal-body space-y-4">
          <section className="modal-section">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950 dark:text-gray-100">Sócios no relatório</h3>
              </div>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-black text-slate-500 dark:border-gray-700 dark:text-gray-300">
                {reportSociosHydrated.length} sócio(s)
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <DropdownFilterSelect
                label="Adicionar sócio"
                value={socioToAdd}
                options={availableSociosToAdd.map(({ socio, socioKey }) => ({
                  value: socioKey,
                  label: `${socio.nome || 'Sócio sem nome'}${socio.cpf ? ` - ${formatCpfInput(socio.cpf)}` : ''}`,
                }))}
                onChange={setSocioToAdd}
                includeBlank={!availableSociosToAdd.length}
                emptyLabel="Todos os sócios já foram incluídos"
                disabled={!availableSociosToAdd.length}
                labelClassName="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400"
                buttonClassName="form-control-shell mt-1 disabled:cursor-not-allowed disabled:opacity-70"
              />
              <button
                type="button"
                onClick={addReportSocio}
                disabled={!socioToAdd}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
              >
                <Plus size={16} aria-hidden="true" />
                Adicionar
              </button>
            </div>
          </section>

          <section className="modal-section">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950 dark:text-gray-100">Valor e período</h3>
                {retificacaoAtiva ? (
                  <p className="mt-1 text-xs font-black uppercase tracking-normal text-amber-700 dark:text-amber-300">
                    Retificação habilitada
                  </p>
                ) : null}
              </div>
              {hasValoresHistoricos ? (
                <button
                  type="button"
                  onClick={enableRetificacao}
                  disabled={retificacaoAtiva}
                  className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                    retificacaoAtiva
                      ? 'cursor-default border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10'
                  }`}
                >
                  {retificacaoAtiva ? 'Edição liberada' : 'Retificar valores enviados'}
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[220px_180px_minmax(180px,220px)_minmax(0,1fr)]">
              <DropdownFilterSelect
                label="Modelo da tabela"
                value={modeloTabela}
                options={REINF_TABLE_MODEL_OPTIONS}
                onChange={(value) => {
                  setModeloTabela(value || REINF_TABLE_MODEL_MONTHLY);
                  setMesesReferenciaTotal([]);
                  setReportSocios((current) => current.map(clearReinfReportSocioValues));
                  setMensagemEditada(false);
                  setCopied(false);
                  setCopyStatus('');
                  setSaveStatus('');
                  setSendStatus('');
                  setRetificacaoAtiva(false);
                }}
                includeBlank={false}
                labelClassName="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400"
                buttonClassName="form-control-shell mt-1"
              />
              <label className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
                Ano de referência
                <input
                  value={anoReferencia}
                  onChange={(event) => {
                    setAnoReferencia(event.target.value.replace(/\D/g, '').slice(0, 4));
                    setReportSocios((current) => current.map((reportSocio) => ({
                      ...reportSocio,
                      valoresPorMes: {},
                      valoresTotais: createEmptyReinfTotalValues(),
                      valoresTotaisPorMes: {},
                      valoresHistorico: createEmptyReinfHistoryMarks(),
                    })));
                    setCopied(false);
                    setCopyStatus('');
                    setRetificacaoAtiva(false);
                  }}
                  inputMode="numeric"
                  placeholder="2026"
                  className="form-control-shell mt-1"
                />
              </label>
              {isTotalsModel ? (
                <DropdownMultiSelect
                  label="Meses de referência"
                  values={mesesReferenciaTotal}
                  options={REINF_MONTH_OPTIONS}
                  onChange={(values) => {
                    setMesesReferenciaTotal(values);
                    setMensagemEditada(false);
                    setCopied(false);
                    setCopyStatus('');
                    setSaveStatus('');
                    setSendStatus('');
                    setRetificacaoAtiva(false);
                  }}
                  emptyLabel="Selecione o mês"
                  labelClassName="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400"
                  buttonClassName="form-control-shell mt-1"
                />
              ) : null}
              <div className={`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 ${isTotalsModel ? '' : 'lg:col-span-2'}`}>
                <span className="block text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">Regra sugerida</span>
                <span>
                  Mês com R$ 50.000,00 ou acima: mensal. Mês abaixo de R$ 50.000,00: trimestral.
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {reportSociosHydrated.length ? reportSociosHydrated.map((reportSocio) => (
                <div key={reportSocio.socioKey} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950 dark:text-gray-100">{reportSocio.socio?.nome || 'Sócio sem nome'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
                        CPF/CNPJ: {reportSocio.socio?.cpf ? formatCpfInput(reportSocio.socio.cpf) : 'CPF/CNPJ não informado'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeReportSocio(reportSocio.socioKey)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-500 transition hover:border-red-300 hover:text-red-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-red-500/40 dark:hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>

                  {isTotalsModel ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">Valores por mês selecionado</p>
                        {reportMonths.length ? (
                          <div className="mt-2 grid gap-3 lg:grid-cols-2">
                            {reportMonths.map((month) => (
                              <div key={month} className="rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-950/30">
                                <p className="text-sm font-black text-slate-700 dark:text-gray-200">{getReinfMonthLabel(month)}</p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  {REINF_TOTAL_FIELD_OPTIONS.map((field) => {
                                    const isHistoryValue = isReinfHistoryTotalValue(reportSocio, field.key, month);
                                    return (
                                      <label key={field.key} className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
                                        {field.label}
                                        <input
                                          value={getReinfTotalMonthlyValue(reportSocio, field.key, month)}
                                          onChange={(event) => updateValorTotalMes(reportSocio.socioKey, field.key, month, event.target.value)}
                                          onBlur={() => formatValorTotalMes(reportSocio.socioKey, field.key, month)}
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          readOnly={isHistoryValue && !retificacaoAtiva}
                                          title={isHistoryValue && !retificacaoAtiva ? 'Valor já enviado. Use a retificação para editar.' : undefined}
                                          className={getReinfHistoryInputClassName(isHistoryValue, retificacaoAtiva)}
                                        />
                                        {isHistoryValue ? (
                                          <span className="mt-1 block text-[11px] font-black uppercase tracking-normal text-amber-700 dark:text-amber-300">
                                            {retificacaoAtiva ? 'Em retificação' : 'Valor já enviado'}
                                          </span>
                                        ) : null}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                            Selecione um ou mais meses de referência para informar os valores deste sócio.
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">Totais consolidados</p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {REINF_TOTAL_FIELD_OPTIONS.map((field) => {
                            const isComputedTotal = reportMonths.length > 0;
                            return (
                              <label key={field.key} className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
                                {field.label}
                                <input
                                  value={isComputedTotal ? getReinfTotalsDisplayValue(reportSocio, field.key, reportMonths) : (reportSocio.valoresTotais?.[field.key] ?? '')}
                                  onChange={(event) => updateValorTotal(reportSocio.socioKey, field.key, event.target.value)}
                                  onBlur={() => formatValorTotal(reportSocio.socioKey, field.key)}
                                  inputMode="decimal"
                                  placeholder="0,00"
                                  readOnly={isComputedTotal}
                                  className={`form-control-shell mt-1 ${isComputedTotal ? 'cursor-not-allowed opacity-80' : ''}`}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">Meses de referência</p>
                          <button
                            type="button"
                            onClick={() => clearMeses(reportSocio.socioKey)}
                            className="text-xs font-black text-slate-500 transition hover:text-brand-blue dark:text-gray-400 dark:hover:text-blue-300"
                          >
                            Limpar meses
                          </button>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          {REINF_MONTH_OPTIONS.map((month) => (
                            <label
                              key={month.value}
                              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-black transition ${
                                reportSocio.meses.includes(month.value)
                                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200'
                                  : 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={reportSocio.meses.includes(month.value)}
                                onChange={() => toggleMes(reportSocio.socioKey, month.value)}
                                className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                              />
                              {month.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">Valores por mês selecionado</p>
                        {reportSocio.meses.length ? (
                          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {REINF_MONTH_OPTIONS.filter((month) => reportSocio.meses.includes(month.value)).map((month) => {
                              const isHistoryValue = isReinfHistoryMonthlyValue(reportSocio, month.value);
                              return (
                                <label key={month.value} className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
                                  {month.label}
                                  <input
                                    value={reportSocio.valoresPorMes?.[month.value] ?? ''}
                                    onChange={(event) => updateValorMes(reportSocio.socioKey, month.value, event.target.value)}
                                    onBlur={() => formatValorMes(reportSocio.socioKey, month.value)}
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    readOnly={isHistoryValue && !retificacaoAtiva}
                                    title={isHistoryValue && !retificacaoAtiva ? 'Valor já enviado. Use a retificação para editar.' : undefined}
                                    className={getReinfHistoryInputClassName(isHistoryValue, retificacaoAtiva)}
                                  />
                                  {isHistoryValue ? (
                                    <span className="mt-1 block text-[11px] font-black uppercase tracking-normal text-amber-700 dark:text-amber-300">
                                      {retificacaoAtiva ? 'Em retificação' : 'Valor já enviado'}
                                    </span>
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                            Selecione um ou mais meses para informar os valores deste sócio.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-400">
                  Nenhum sócio incluído no relatório. Cadastre sócios no cliente ou adicione um sócio acima.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 p-4 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950 dark:text-gray-100">Mensagem para o setor fiscal</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAssuntoEditado(false);
                  setAssunto(generatedSubject);
                  setMensagemEditada(false);
                  setMensagem(generatedMessage);
                  setCopied(false);
                  setCopyStatus('');
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:border-brand-blue hover:text-brand-blue dark:border-gray-700 dark:text-gray-300 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
              >
                Restaurar padrão
              </button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
                  Assunto sugerido
                  <input
                    value={assunto}
                    onChange={(event) => {
                      setAssunto(event.target.value);
                      setAssuntoEditado(true);
                      setCopied(false);
                      setCopyStatus('');
                    }}
                    className="form-control-shell mt-1"
                  />
                </label>
                <label className="block text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
                  Texto do e-mail
                  <textarea
                    value={mensagem}
                    onChange={(event) => {
                      setMensagem(event.target.value);
                      setMensagemEditada(true);
                      setCopied(false);
                      setCopyStatus('');
                    }}
                    rows={9}
                    className="form-control-shell mt-1 min-h-56 resize-y leading-6"
                  />
                </label>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">Prévia formatada</p>
                <div className="mt-1 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-950 shadow-sm dark:border-gray-700 dark:bg-white dark:text-slate-950">
                  {retificacaoAtiva ? (
                    <p className="mb-2 text-sm font-semibold text-slate-950">
                      {REINF_RETIFICATION_NOTICE}
                    </p>
                  ) : null}
                  <p className="text-lg font-semibold leading-snug">{assunto || 'Assunto não informado'}</p>
                  <div className="mt-4 space-y-3">
                    {previewBodyParts.introLines.map((line, index) => (
                      line.trim()
                        ? <p key={`intro-${line}-${index}`}>{line}</p>
                        : <div key={`intro-blank-${index}`} className="h-2" />
                    ))}
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    {isTotalsModel ? (
                      <table className="min-w-[760px] border-collapse border border-slate-950 bg-white text-left text-[13px] leading-5 text-slate-950">
                        <thead>
                          <tr>
                            <th className="w-[26%] border border-slate-950 bg-slate-50 px-2 py-1 font-semibold">SÓCIO</th>
                            <th className="w-[16%] border border-slate-950 bg-slate-50 px-2 py-1 font-semibold">CPF/CNPJ</th>
                            <th className="w-[12%] border border-slate-950 bg-slate-50 px-2 py-1 font-semibold">MÊS</th>
                            {REINF_TOTAL_FIELD_OPTIONS.map((field) => (
                              <th key={field.key} className="border border-slate-950 bg-slate-50 px-2 py-1 font-semibold">
                                {field.label.toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {getReinfTotalsTableRows(reportSociosHydrated, reportMonths).map((row, index) => {
                            const cellClassName = row.isTotal
                              ? 'border border-slate-950 bg-slate-50 px-2 py-1 align-top font-semibold'
                              : 'border border-slate-950 bg-white px-2 py-1 align-top';
                            const nowrapCellClassName = row.isTotal
                              ? 'whitespace-nowrap border border-slate-950 bg-slate-50 px-2 py-1 align-top font-semibold'
                              : 'whitespace-nowrap border border-slate-950 bg-white px-2 py-1 align-top';
                            return (
                              <tr key={`${row.reportSocio.socioKey ?? 'empty'}-${row.month || index}`}>
                                <td className={cellClassName}>{row.isTotal ? 'TOTAL DO SÓCIO' : (row.monthIndex === 0 ? row.socioNome : '')}</td>
                                <td className={nowrapCellClassName}>{row.isTotal ? '' : (row.monthIndex === 0 ? row.socioCpf : '')}</td>
                                <td className={nowrapCellClassName}>{row.monthLabel}</td>
                                <td className={nowrapCellClassName}>{row.isentoAta}</td>
                                <td className={nowrapCellClassName}>{row.tributavel}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="min-w-[520px] border-collapse border border-slate-950 bg-white text-left text-[13px] leading-5 text-slate-950">
                        <thead>
                          <tr>
                            <th className="w-[42%] border border-slate-950 bg-slate-50 px-2 py-1 font-semibold">SÓCIO</th>
                            <th className="w-[22%] border border-slate-950 bg-slate-50 px-2 py-1 font-semibold">CPF/CNPJ</th>
                            {reportMonths.map((month) => (
                              <th key={month} className="border border-slate-950 bg-slate-50 px-2 py-1 font-semibold">
                                {getReinfMonthShortLabel(month)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(reportSociosHydrated.length ? reportSociosHydrated : [{ socio: { nome: 'Sem sócio', cpf: '' }, valoresPorMes: {} }]).map((reportSocio, index) => (
                            <tr key={reportSocio.socioKey ?? `empty-${index}`}>
                              <td className="border border-slate-950 bg-white px-2 py-1 align-top">{reportSocio.socio?.nome || 'Sócio não informado'}</td>
                              <td className="whitespace-nowrap border border-slate-950 bg-white px-2 py-1 align-top">{reportSocio.socio?.cpf ? formatCpfInput(reportSocio.socio.cpf) : ''}</td>
                              {reportMonths.map((month) => (
                                <td key={month} className="whitespace-nowrap border border-slate-950 bg-white px-2 py-1 align-top">
                                  {formatCurrencyDisplay(reportSocio.valoresPorMes?.[month])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {previewBodyParts.closingLines.length ? (
                    <div className="mt-4 space-y-3">
                      {previewBodyParts.closingLines.map((line, index) => (
                        line.trim()
                          ? <p key={`closing-${line}-${index}`}>{line}</p>
                          : <div key={`closing-blank-${index}`} className="h-2" />
                      ))}
                    </div>
                  ) : null}
                  {assinaturaResponsavelUrl ? (
                    <div className="mt-5">
                      <img
                        src={assinaturaResponsavelUrl}
                        alt={`Assinatura digital de ${assinaturaResponsavelNome || 'responsável'}`}
                        className="max-h-40 max-w-full object-contain"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="modal-footer flex flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="min-h-4 text-left sm:min-w-[150px] sm:text-right">
              {sendStatus ? (
                <span className={`text-xs font-black ${sendStatus === 'E-mail enviado' ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
                  {sendStatus}
                </span>
              ) : null}
              {!sendStatus && copyStatus ? (
                <span className={`text-xs font-black ${copied ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                  {copyStatus}
                </span>
              ) : null}
              {!sendStatus && !copyStatus && saveStatus ? (
                <span className={`text-xs font-black ${saveStatus === 'Relatório salvo' ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
                  {saveStatus}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={saveReport}
                disabled={savingReport}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
              >
                <Save size={16} aria-hidden="true" />
                {savingReport ? 'Salvando...' : 'Salvar relatório'}
              </button>
              <button
                type="button"
                onClick={sendEmail}
                disabled={sendingEmail}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Mail size={16} aria-hidden="true" />
                {sendingEmail ? 'Enviando...' : 'Enviar e-mail'}
              </button>
              <button
                type="button"
                onClick={copyMessage}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700"
              >
                <Mail size={16} aria-hidden="true" />
                Copiar e-mail
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}

function ReinfPage({
  clients,
  responsavelOptions = [],
  reinfRelatorios = [],
  onView,
  onSaveReport,
  onSendEmail,
  supabaseStatus,
  metadata,
  onRefresh,
  loading = false,
  searchContext,
  onClearSearchContext,
  statusLabel,
  statusTone = 'neutral',
}) {
  const emptyFilters = {
    search: '',
    cnpj: '',
    responsavel: '',
    revisor: '',
    sociosStatus: '',
  };
  const [filters, setFilters] = useState(emptyFilters);
  const [focusedClientId, setFocusedClientId] = useState('');
  const [focusedClientLabel, setFocusedClientLabel] = useState('');
  const [selectedSocioByClientId, setSelectedSocioByClientId] = useState({});
  const [reinfModalClientId, setReinfModalClientId] = useState('');
  const updateFilter = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const updateSelectedSocio = (clientId, socioKey) => {
    if (!clientId) return;
    setSelectedSocioByClientId((current) => ({
      ...current,
      [clientId]: socioKey,
    }));
  };

  useEffect(() => {
    const nextClientId = String(searchContext?.clientId ?? '');
    if (!nextClientId) return;
    setFilters(emptyFilters);
    setFocusedClientId(nextClientId);
    setFocusedClientLabel(searchContext?.query || 'cliente selecionado');
    onClearSearchContext?.();
  }, [searchContext?.clientId, searchContext?.query]);

  const rows = clients.filter((client) => {
    if (focusedClientId && String(client.id ?? '') !== focusedClientId) return false;
    const search = normalizeText(filters.search);
    if (search && !normalizeText(`${client.nome_identificacao} ${client.razao_social}`).includes(search)) return false;
    if (filters.cnpj && !normalizeText(client.cnpj).includes(normalizeText(filters.cnpj))) return false;
    if (filters.responsavel && normalizeText(client.responsavel) !== normalizeText(filters.responsavel)) return false;
    if (filters.revisor && normalizeText(client.revisor) !== normalizeText(filters.revisor)) return false;
    const sociosCount = getReinfSocios(client).length;
    if (filters.sociosStatus === 'com_socios' && sociosCount === 0) return false;
    if (filters.sociosStatus === 'sem_socios' && sociosCount > 0) return false;
    return true;
  });
  const reinfModalClient = clients.find((client) => String(client.id ?? '') === String(reinfModalClientId)) ?? null;
  const openReinfModal = (clientOrId) => {
    const clientId = typeof clientOrId === 'object' && clientOrId !== null ? clientOrId.id : clientOrId;
    const client = typeof clientOrId === 'object' && clientOrId !== null
      ? clientOrId
      : clients.find((item) => String(item.id ?? '') === String(clientId));
    if (!client?.id) return;
    setReinfModalClientId(String(client.id));
  };

  return (
    <div className="min-w-0 space-y-5">
      {focusedClientId ? (
        <section className="rounded-lg border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">
              Distribuição de Lucro aberta a partir da triagem operacional:
              {' '}
              <span className="font-black text-slate-900 dark:text-gray-100">{focusedClientLabel || 'cliente selecionado'}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setFocusedClientId('');
                setFocusedClientLabel('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
            >
              Ver todos novamente
            </button>
          </div>
        </section>
      ) : null}

      <section className="surface-card p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-gray-100">Controle de Distribuição de Lucro</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-gray-300">{formatNumber(rows.length)} cliente(s) conforme os filtros aplicados.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilters(emptyFilters);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
          >
            <RefreshCcw size={15} aria-hidden="true" />
            Limpar filtros
          </button>
        </div>
        <div className="mt-4 grid max-w-6xl gap-3 md:grid-cols-[minmax(240px,360px)_minmax(180px,240px)_minmax(160px,220px)_minmax(160px,220px)_minmax(160px,220px)]">
          <label className="text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-gray-400">
            Cliente / Razão Social
            <input value={filters.search} onChange={(event) => updateFilter({ search: event.target.value })} className="input-shell mt-1 h-10 normal-case" />
          </label>
          <label className="text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-gray-400">
            CNPJ
            <input value={filters.cnpj} onChange={(event) => updateFilter({ cnpj: event.target.value })} className="input-shell mt-1 h-10 normal-case" />
          </label>
          <FilterSelect
            label="Responsável"
            value={filters.responsavel}
            options={uniqueValues(clients.map((client) => client.responsavel))}
            onChange={(value) => updateFilter({ responsavel: value })}
          />
          <FilterSelect
            label="Revisor"
            value={filters.revisor}
            options={uniqueValues(clients.map((client) => client.revisor))}
            onChange={(value) => updateFilter({ revisor: value })}
          />
          <FilterSelect
            label="Sócios"
            value={filters.sociosStatus}
            options={[
              { value: 'com_socios', label: 'Com sócios' },
              { value: 'sem_socios', label: 'Sem sócios' },
            ]}
            onChange={(value) => updateFilter({ sociosStatus: value })}
          />
        </div>
      </section>

      <section className="min-w-0 surface-card">
        <DataTable
          rows={rows}
          tableClassName="table-reinf-compact"
          columns={[
             'nome_identificacao',
             'cnpj',
             'reinf_socio',
             'reinf_socio_cpf',
             'data_envio_recibo_reinf',
           ]}
            columnLabels={{
              reinf_socio: 'Sócio',
              reinf_socio_cpf: 'CPF/CNPJ',
              data_envio_recibo_reinf: 'Data enviada',
            }}
            renderCell={(client, column) => {
              if (column === 'nome_identificacao') {
                return (
                  <button
                    type="button"
                    onClick={() => openReinfModal(client)}
                    className="text-left font-black text-slate-950 hover:text-brand-blue dark:text-gray-100 dark:hover:text-blue-300"
                  >
                    {client.nome_identificacao || client.razao_social}
                  </button>
                );
              }
              if (column === 'reinf_socio') {
                return (
                  <ReinfSocioDropdownCell
                    client={client}
                    selectedSocioByClientId={selectedSocioByClientId}
                    onSelect={updateSelectedSocio}
                  />
                );
              }
              if (column === 'reinf_socio_cpf') {
                return <ReinfSocioCpfCell client={client} selectedSocioByClientId={selectedSocioByClientId} />;
              }
              if (column === 'data_envio_recibo_reinf') {
                return <ReinfAttachmentSentDateCell client={client} />;
              }
             return undefined;
           }}
           onView={openReinfModal}
         />
      </section>
      {reinfModalClient ? (
        <ReinfFiscalModal
          client={reinfModalClient}
          selectedSocioByClientId={selectedSocioByClientId}
          responsavelOptions={responsavelOptions}
          reinfRelatorios={reinfRelatorios}
          onSelectSocio={updateSelectedSocio}
          onSaveReport={onSaveReport}
          onSendEmail={onSendEmail}
          onClose={() => setReinfModalClientId('')}
        />
      ) : null}
    </div>
  );
}

function EcdEcfPage({ clients, onView, canManageAttachments, canEditDeliveryDate, onQuickUpdate, onAnexoSuccess, onAnexoRemove, onAnexoError, supabaseStatus, metadata, statusLabel, statusTone = 'neutral', onRefresh, loading = false, searchContext, onClearSearchContext }) {
  const emptyFilters = {
    search: '',
    cnpj: '',
    regime_tributario: '',
    responsavel_ecd: '',
    anexo_recibo_ecd: 'all',
    anexo_recibo_ecf: 'all',
  };
  const [mode, setMode] = useState('todos');
  const [dateView, setDateView] = useState('ecd');
  const [filters, setFilters] = useState(emptyFilters);
  const [focusedClientId, setFocusedClientId] = useState('');
  const [focusedClientLabel, setFocusedClientLabel] = useState('');
  const updateFilter = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const allowedRegimes = ['lucro presumido', 'lucro real'];
  const statusTipo = dateView === 'ecf' ? 'ecf' : 'ecd';
  const modeOptions = useMemo(() => (
    statusTipo === 'ecf'
      ? [
          { value: 'todos', label: 'Todos' },
          { value: 'em-dia', label: 'Em dia' },
          { value: 'comprovante-pendente', label: 'Recibo ECF pendente' },
        ]
      : [
          { value: 'todos', label: 'Todos' },
          { value: 'em-dia', label: 'Em dia' },
          { value: 'comprovante-pendente', label: 'Recibo ECD pendente' },
        ]
  ), [statusTipo]);
  const dateViewOptions = [
    { value: 'ecd', label: 'Datas e anexo da ECD' },
    { value: 'ecf', label: 'Datas e anexo da ECF' },
  ];
  const attachmentOptions = Object.entries(ATTACHMENT_FILTERS).map(([value, label]) => ({ value, label }));
  const scopedClients = clients.filter((client) => allowedRegimes.includes(normalizeText(client.regime_tributario)));
  const dateColumns = dateView === 'ecf'
    ? ['ultima_ecf_entregue', 'data_entrega_ecf', 'data_envio_ecf', 'anexo_recibo_ecf']
    : ['ultima_ecd_entregue', 'data_entrega_ecd', 'data_envio_ecd', 'anexo_recibo_ecd'];
  const activeAttachmentFilterKey = statusTipo === 'ecf' ? 'anexo_recibo_ecf' : 'anexo_recibo_ecd';
  const activeAttachmentFlagKey = statusTipo === 'ecf' ? 'ecf_comprovante_anexado' : 'ecd_comprovante_anexado';
  const activeAttachmentFilterLabel = statusTipo === 'ecf' ? 'Anexo recibo ECF' : 'Anexo recibo ECD';

  useEffect(() => {
    const validModes = new Set(modeOptions.map((option) => option.value));
    if (!validModes.has(mode)) setMode('todos');
  }, [mode, modeOptions]);

  useEffect(() => {
    const nextClientId = String(searchContext?.clientId ?? '');
    if (!nextClientId) return;
    setMode('todos');
    setFilters(emptyFilters);
    setFocusedClientId(nextClientId);
    setFocusedClientLabel(searchContext?.query || 'cliente selecionado');
    onClearSearchContext?.();
  }, [searchContext?.clientId, searchContext?.query]);

  const rows = scopedClients.filter((client) => {
    if (focusedClientId && String(client.id ?? '') !== focusedClientId) return false;
    const search = normalizeText(filters.search);
    const responsavelAtual = getObrigacaoResponsavel(client);
    const attachmentFilter = filters[activeAttachmentFilterKey];
    const reciboAnexado = hasObrigacaoComprovante(client, activeAttachmentFlagKey, activeAttachmentFilterKey);
    const modeMatches = matchesEcdEcfStatusMode(client, mode, statusTipo);
    if (!modeMatches) return false;
    if (search && !normalizeText(`${client.nome_identificacao} ${client.razao_social}`).includes(search)) return false;
    if (filters.cnpj && !normalizeText(client.cnpj).includes(normalizeText(filters.cnpj))) return false;
    if (filters.regime_tributario && normalizeText(client.regime_tributario) !== normalizeText(filters.regime_tributario)) return false;
    if (filters.responsavel_ecd && normalizeText(responsavelAtual) !== normalizeText(filters.responsavel_ecd)) return false;
    if (attachmentFilter === 'attached' && !reciboAnexado) return false;
    if (attachmentFilter === 'missing' && reciboAnexado) return false;
    return true;
  });

  return (
    <div className="min-w-0 space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="ECD obrigatoria" value={countWhere(scopedClients, (client) => isYes(client.ecd))} icon={BookOpenCheck} tone="info" />
        <MetricCard title="Pendências ECD" value={countWhere(scopedClients, (client) => hasPendenciaObrigacaoEcd(client))} icon={AlertTriangle} tone="warning" />
        <MetricCard title="Pendências ECF" value={countWhere(scopedClients, (client) => hasPendenciaObrigacaoEcf(client))} icon={FolderClock} tone="warning" />
        <MetricCard title="Comprovantes pendentes" value={countWhere(scopedClients, (client) => hasComprovanteObrigacaoPendente(client))} icon={Paperclip} tone="warning" />
      </section>

      <section className="surface-card p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-gray-100">Controle de ECD / ECF</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-gray-300">{formatNumber(rows.length)} cliente(s) conforme os filtros aplicados.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode('todos');
              setFilters(emptyFilters);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
          >
            <RefreshCcw size={15} aria-hidden="true" />
            Limpar filtros
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-gray-400">
            Cliente / Razão Social
            <input value={filters.search} onChange={(event) => updateFilter({ search: event.target.value })} className="input-shell mt-1 h-10 normal-case" />
          </label>
          <label className="text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-gray-400">
            CNPJ
            <input value={filters.cnpj} onChange={(event) => updateFilter({ cnpj: event.target.value })} className="input-shell mt-1 h-10 normal-case" />
          </label>
          <FilterSelect label="Responsável" value={filters.responsavel_ecd} options={uniqueValues(scopedClients.map((client) => getObrigacaoResponsavel(client)))} onChange={(value) => updateFilter({ responsavel_ecd: value })} />
          <FilterSelect label="Visualização" value={dateView} options={dateViewOptions} onChange={setDateView} includeBlank={false} />
          <FilterSelect label="Regime Tributário" value={filters.regime_tributario} options={uniqueValues(scopedClients.map((client) => client.regime_tributario))} onChange={(value) => updateFilter({ regime_tributario: value })} />
          <FilterSelect label={activeAttachmentFilterLabel} value={filters[activeAttachmentFilterKey]} options={attachmentOptions} onChange={(value) => updateFilter({ [activeAttachmentFilterKey]: value })} includeBlank={false} />
          <FilterSelect label="Situação rápida" value={mode} options={modeOptions} onChange={setMode} includeBlank={false} />
        </div>
      </section>

      <section className="min-w-0 surface-card">
        <DataTable
          rows={rows}
          columns={[
            'nome_identificacao',
            'cnpj',
            'regime_tributario',
            'responsavel_ecd',
            ...dateColumns,
          ]}
          columnLabels={{
            nome_identificacao: 'Nome / Identificação',
            regime_tributario: 'Regime tributário',
            responsavel_ecd: 'Responsável',
            ultima_ecd_entregue: 'Última ECD entregue',
            ultima_ecf_entregue: 'Última ECF entregue',
            data_entrega_ecd: 'Data de entrega ECD',
            data_envio_ecd: 'Data enviada ECD',
            data_entrega_ecf: 'Data de entrega ECF',
            data_envio_ecf: 'Data enviada ECF',
            anexo_recibo_ecd: 'Recibo ECD',
            anexo_recibo_ecf: 'Recibo ECF',
          }}
          onView={onView}
          renderCell={(client, column) => {
            if (column === 'responsavel_ecd') {
              return renderFieldValue(getObrigacaoResponsavel(client));
            }
            if (column === 'data_entrega_ecd' || column === 'data_entrega_ecf') {
              const tipo = column === 'data_entrega_ecf' ? 'ecf' : 'ecd';
              return (
                <EcdEcfDeliveryDateCell
                  client={client}
                  tipo={tipo}
                  fieldKey={column}
                  disabled={!canEditDeliveryDate?.(client, column)}
                  onSave={onQuickUpdate}
                />
              );
            }
            if (column === 'data_envio_ecd' || column === 'data_envio_ecf') {
              return <EcdEcfSentDateCell client={client} tipo={column === 'data_envio_ecf' ? 'ecf' : 'ecd'} />;
            }
            if (column === 'anexo_recibo_ecd') {
              return (
                <AttachmentCell
                  client={client}
                  fieldKey="anexo_recibo_ecd"
                  tipoAnexo={TIPOS_ANEXO.RECIBO_ECD}
                  disabled={!canManageAttachments?.(client, 'anexo_recibo_ecd')}
                  onSuccess={onAnexoSuccess}
                  onRemove={onAnexoRemove}
                  onError={onAnexoError}
                />
              );
            }
            if (column === 'anexo_recibo_ecf') {
              return (
                <AttachmentCell
                  client={client}
                  fieldKey="anexo_recibo_ecf"
                  tipoAnexo={TIPOS_ANEXO.RECIBO_ECF}
                  disabled={!canManageAttachments?.(client, 'anexo_recibo_ecf')}
                  onSuccess={onAnexoSuccess}
                  onRemove={onAnexoRemove}
                  onError={onAnexoError}
                />
              );
            }
            return undefined;
          }}
          trailing={(client) => <EcdEcfObrigacaoStatusCell client={client} tipo={statusTipo} />}
        />
      </section>
    </div>
  );
}

function isInteractiveTableClick(target) {
  return Boolean(target?.closest?.('button, a, input, select, textarea, label, [role="button"], [data-row-click-ignore="true"]'));
}

function DataTable({ rows, columns, onView, trailing, renderCell, columnLabels = {}, tableClassName = 'min-w-[920px] xl:min-w-[1080px]' }) {
  const hasTrailingColumn = typeof trailing === 'function';
  const canOpenRow = typeof onView === 'function';

  return (
    <>
      <TableScrollArea>
        <table className={`table-base ${tableClassName}`}>
          <thead className="table-head">
            <tr>
              {columns.map((column) => (
                <th key={column} className="table-head-cell">
                  {columnLabels[column] ?? getFieldLabel(FIELD_DEFINITIONS, column)}
                </th>
              ))}
              {hasTrailingColumn ? (
                <th className="table-head-cell">
                  Status da obrigação
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((client) => (
              <tr
                key={client.id}
                onClick={(event) => {
                  if (!canOpenRow || isInteractiveTableClick(event.target)) return;
                  onView(client.id);
                }}
                className={`table-row ${canOpenRow ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td key={column} className="table-cell">
                    {renderCell?.(client, column) ?? (column === 'nome_identificacao' ? (
                      <button type="button" onClick={() => onView(client.id)} className="text-left font-black text-slate-950 hover:text-brand-blue dark:text-gray-100 dark:hover:text-blue-300">
                        {client[column] || client.razao_social}
                      </button>
                    ) : (
                      renderResolvedFieldValue(client, column, FIELD_DEFINITIONS.find((field) => field.key === column)?.type)
                    ))}
                  </td>
                ))}
                {hasTrailingColumn ? <td className="table-cell">{trailing(client)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollArea>
      {!rows.length ? (
        <div className="empty-state">
          <Search className="text-slate-300 dark:text-gray-600" size={40} aria-hidden="true" />
          <p className="text-base font-black text-slate-800 dark:text-gray-100">Nenhum cliente encontrado para os filtros selecionados.</p>
        </div>
      ) : null}
    </>
  );
}

function StaticBreakdownPanel({ title, rows, total, icon: Icon = BarChart3 }) {
  const visibleRows = rows.slice(0, 9);
  const max = Math.max(...visibleRows.map((row) => row.value), 1);

  return (
    <section className="surface-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
            Leitura complementar
          </p>
          <h2 className="mt-1 text-base font-black text-slate-950 dark:text-gray-100">{title}</h2>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-gray-400">
            Distribuição resumida para apoiar a leitura operacional da base.
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-brand-blue shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-blue-300">
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>
      {visibleRows.length ? (
        <div className="mt-5 space-y-3">
          {visibleRows.map((row) => (
            <div
              key={row.label}
              className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/45"
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-bold text-slate-700 dark:text-gray-200">{row.label}</span>
                <span className="font-black text-slate-950 dark:text-gray-100">{formatNumber(row.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-brand-blue transition-all duration-200"
                  style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }}
                />
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-gray-500">
                {total ? `${((row.value / total) * 100).toFixed(1)}% da base` : '0% da base'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm font-medium text-slate-500 dark:border-gray-800 dark:bg-gray-900/35 dark:text-gray-400">
          Nenhum dado disponível neste recorte no momento.
        </div>
      )}
    </section>
  );
}

function hasPendenciasObservacoes(client) {
  return !isBlank(client?.pendencias_observacoes);
}

function buildPendenciasObservacoesRows(clients) {
  return (clients ?? [])
    .filter(hasPendenciasObservacoes)
    .map((client) => ({
      Cliente: client.nome_identificacao || client.razao_social || '',
      'Razão Social': client.razao_social || '',
      CNPJ: client.cnpj || '',
      'Responsável': client.responsavel || '',
      Revisor: client.revisor || '',
      'Pendências/Observações': client.pendencias_observacoes || '',
    }));
}

function buildBaseCompletaClientesRows(clients) {
  return (clients ?? []).map((client) => ({
    CNPJ: client.cnpj || '',
    'Razão Social': client.razao_social || '',
    'Nome/Identificação': client.nome_identificacao || '',
    'Responsável': client.responsavel || '',
    Revisor: client.revisor || '',
    'Tipo de Cliente': client.tipo_cliente || '',
    'Regime Tributário': client.regime_tributario || '',
    Atividade: client.atividades || '',
  }));
}

function isEcdEcfTipoAplicavel(client, tipo) {
  if (tipo === 'ECD') {
    return (
      isYes(client?.ecd)
      || !isBlank(client?.ultima_ecd_entregue)
      || !isBlank(client?.data_entrega_ecd)
      || !isBlank(client?.data_envio_ecd)
      || hasAttachment(client?.anexo_recibo_ecd)
      || hasPendenciaObrigacaoEcd(client)
    );
  }

  return (
    isYes(client?.ecf)
    || !isBlank(client?.ultima_ecf_entregue)
    || !isBlank(client?.data_entrega_ecf)
    || !isBlank(client?.data_envio_ecf)
    || hasAttachment(client?.anexo_recibo_ecf)
    || hasPendenciaObrigacaoEcf(client)
  );
}

function getEcdEcfReportInfo(client, tipo) {
  const isEcd = tipo === 'ECD';
  const tipoKey = isEcd ? 'ecd' : 'ecf';
  const attachmentKey = isEcd ? 'anexo_recibo_ecd' : 'anexo_recibo_ecf';
  const statusKey = isEcd ? 'ecd_comprovante_anexado' : 'ecf_comprovante_anexado';
  const pending = isEcd ? hasPendenciaObrigacaoEcd(client) : hasPendenciaObrigacaoEcf(client);
  const attached = hasObrigacaoComprovante(client, statusKey, attachmentKey);
  const attachment = parseAttachment(client?.[attachmentKey]);
  const sentDate = getEcdEcfSentDateValue(client, tipoKey);
  const deliveryDate = getEcdEcfDeliveryDateValue(client, tipoKey);
  const latestDelivered = isEcd ? client?.ultima_ecd_entregue : client?.ultima_ecf_entregue;
  const concluded = !pending && (attached || !isBlank(sentDate));

  return {
    obrigacao: tipo,
    ultima_entregue: valueOrDash(latestDelivered),
    data_entrega: formatDateDisplay(deliveryDate),
    data_enviada: formatDateDisplay(sentDate),
    recibo: attached ? attachment.name || 'Anexado' : 'Sem anexo',
    situacao: concluded ? 'Entregue/Concluído' : 'Pendente/Sem anexo',
    situacao_codigo: concluded ? 'concluido' : 'pendente',
  };
}

function buildEcdEcfReportRows(clients, filters = {}) {
  const selectedTypes = filters.obrigacao ? [filters.obrigacao] : ['ECD', 'ECF'];
  const selectedSituation = normalizeText(filters.situacao || '');

  return (clients ?? []).flatMap((client) => {
    const responsavel = getObrigacaoResponsavel(client) || client?.responsavel || '';
    const responsavelOk = !filters.responsavel || normalizeText(responsavel) === normalizeText(filters.responsavel);
    const regimeOk = !filters.regime || normalizeText(client?.regime_tributario) === normalizeText(filters.regime);
    if (!responsavelOk || !regimeOk) return [];

    return selectedTypes
      .filter((tipo) => isEcdEcfTipoAplicavel(client, tipo))
      .map((tipo) => {
        const info = getEcdEcfReportInfo(client, tipo);
        return {
          id: `${client?.id ?? client?.cnpj ?? 'cliente'}-${tipo}`,
          cliente: client?.nome_identificacao || client?.razao_social || 'Não informado',
          razao_social: client?.razao_social || '',
          cnpj: client?.cnpj || '',
          responsavel,
          regime: client?.regime_tributario || '',
          ...info,
        };
      })
      .filter((row) => {
        if (!selectedSituation) return true;
        if (selectedSituation.includes('entregues') || selectedSituation.includes('concluidos')) {
          return row.situacao_codigo === 'concluido';
        }
        if (selectedSituation.includes('pendentes') || selectedSituation.includes('sem anexo')) {
          return row.situacao_codigo === 'pendente';
        }
        return true;
      });
  });
}

function ReportsPage({
  clients,
  filteredClients,
  reinfRelatorios = [],
  onExportXlsx,
  onExportCsv,
  onExportPdf,
  onDeleteReinfReport,
  canExport,
  canDeleteReinfReports = false,
  supabaseStatus,
  metadata,
  statusLabel,
  statusTone = 'neutral',
  onRefresh,
  loading = false,
}) {
  const [selectedReportType, setSelectedReportType] = useState('clientes');
  const [reportFilters, setReportFilters] = useState({
    responsavel: '',
    regime: '',
    atividade: '',
    empresa: '',
    socio: '',
    obrigacao: '',
    situacao: '',
    meses: [],
  });
  const reportScope = Array.isArray(filteredClients) ? filteredClients : clients;
  const clientesComAtraso = reportScope.filter((client) => hasPendenciaAtrasada(client));
  const clientesComPendencias = reportScope.filter((client) => hasPendenciaAtiva(client));
  const clientesAguardandoRetorno = reportScope.filter((client) => isAguardandoRetorno(client));
  const clientesAcompanhamentoPendente = reportScope.filter((client) => hasAcompanhamentoPendente(client));
  const clientesSemRetorno = reportScope.filter((client) => isSemRetorno(client));
  const clientesSemNotificacao = reportScope.filter((client) => !isClienteNotificado(client));
  const clientesRetornoRecebido = reportScope.filter((client) => hasRetornoConcluido(client));
  const clientesEcdEcfObrigatoria = reportScope.filter((client) => hasObrigacaoAnual(client));
  const clientesComObservacoes = reportScope.filter((client) => hasPendenciasObservacoes(client));
  const pendenciasObservacoesRows = buildPendenciasObservacoesRows(reportScope);
  const baseCompletaClientesRows = buildBaseCompletaClientesRows(clients);
  const clientsById = new Map((Array.isArray(clients) ? clients : []).map((client) => [client.id, client]));
  const reinfRelatoriosEnriquecidos = reinfRelatorios.map((relatorio) => {
    const client = clientsById.get(relatorio.cliente_id);
    if (!client) return relatorio;

    return {
      ...relatorio,
      cnpj: relatorio.cnpj || client.cnpj,
      razao_social: relatorio.razao_social || client.razao_social,
      nome_identificacao: relatorio.nome_identificacao || client.nome_identificacao,
      responsavel: relatorio.responsavel || client.responsavel,
      revisor: relatorio.revisor || client.revisor,
    };
  });
  const clientesRetornoSeteDias = clientesAguardandoRetorno.filter((client) => (getDiasSemRetorno(client) ?? 0) >= 7);
  const acompanhamentoStatusRows = [
    { label: 'Acompanhamento pendente', value: clientesAcompanhamentoPendente.length },
    { label: 'Aguardando retorno', value: clientesAguardandoRetorno.length },
    { label: 'Sem retorno', value: clientesSemRetorno.length },
    { label: 'Sem notificação', value: clientesSemNotificacao.length },
    { label: 'Retorno recebido', value: clientesRetornoRecebido.length },
  ].filter((row) => row.value > 0);
  const retornoRows = [
    { label: 'Aguardando retorno', value: clientesAguardandoRetorno.length },
    { label: 'Sem retorno', value: clientesSemRetorno.length },
    { label: 'Retorno recebido', value: clientesRetornoRecebido.length },
    { label: '7+ dias sem retorno', value: clientesRetornoSeteDias.length },
  ].filter((row) => row.value > 0);
  const pendenciasEAtrasosRows = [
    { label: 'Clientes com pendências', value: clientesComPendencias.length },
    { label: 'Clientes com atraso', value: clientesComAtraso.length },
    { label: 'ECD/ECF obrigatória', value: clientesEcdEcfObrigatoria.length },
  ].filter((row) => row.value > 0);
  const reports = [
    {
      title: 'Base completa de clientes',
      rows: clients,
      exportRows: baseCompletaClientesRows,
      icon: Users,
      tone: 'info',
      pdf: true,
    },
    { title: 'Clientes com atraso', rows: clientesComAtraso, icon: FolderClock, tone: 'danger' },
    { title: 'Clientes com pendências', rows: clientesComPendencias, icon: ShieldAlert, tone: 'warning' },
    { title: 'ECD/ECF obrigatória', rows: clientesEcdEcfObrigatoria, icon: BookOpenCheck, tone: 'info' },
    { title: 'Aguardando retorno', rows: clientesAguardandoRetorno, icon: Mail, tone: 'warning' },
    { title: 'Sem retorno', rows: clientesSemRetorno, icon: AlertTriangle, tone: 'danger' },
    {
      title: 'Pendências/Observações',
      rows: clientesComObservacoes,
      exportRows: pendenciasObservacoesRows,
      icon: ClipboardList,
      tone: 'info',
      pdf: true,
    },
  ];
  const reportCount = (rows) =>
    rows.reduce((acc, row) => acc + (typeof row?.value === 'number' ? row.value : 1), 0);
  const reportCards = reports.map(({ title, rows, exportRows, icon: Icon, tone = 'neutral', pdf = false }) => ({
    title,
    rows,
    exportRows: exportRows ?? rows,
    Icon,
    tone,
    pdf,
    count: Array.isArray(rows) ? reportCount(rows) : 0,
  }));
  const reinfRelatorioCards = reinfRelatoriosEnriquecidos.map((relatorio) => ({
    relatorio,
    exportRows: buildReinfRelatoriosExportRows([relatorio]),
  }));
  const [showAllReinfReports, setShowAllReinfReports] = useState(false);
  const visibleReinfRelatorioCards = showAllReinfReports
    ? reinfRelatorioCards
    : reinfRelatorioCards.slice(0, 5);
  const hasHiddenReinfRelatorios = reinfRelatorioCards.length > visibleReinfRelatorioCards.length;
  const [selectedReinfReportIds, setSelectedReinfReportIds] = useState([]);
  const [reinfReportDeleteStatus, setReinfReportDeleteStatus] = useState('');
  const reinfRelatorioIds = reinfRelatorioCards.map(({ relatorio }) => relatorio?.id).filter(Boolean);
  const reinfRelatorioIdsKey = reinfRelatorioIds.join('|');
  const selectedReinfReportIdSet = new Set(selectedReinfReportIds);
  const selectedReinfReportCards = reinfRelatorioCards.filter(({ relatorio }) => selectedReinfReportIdSet.has(relatorio?.id));
  const visibleReinfReportIds = visibleReinfRelatorioCards.map(({ relatorio }) => relatorio?.id).filter(Boolean);
  const allVisibleReinfReportsSelected = visibleReinfReportIds.length > 0
    && visibleReinfReportIds.every((id) => selectedReinfReportIdSet.has(id));
  useEffect(() => {
    const validIds = new Set(reinfRelatorioIds);
    setSelectedReinfReportIds((current) => current.filter((id) => validIds.has(id)));
  }, [reinfRelatorioIdsKey]);
  const reportTypes = [
    { value: 'clientes', label: 'Base de Clientes', eyebrow: 'Carteira', description: 'Clientes, CNPJ, responsável e regime tributário.' },
    { value: 'lucros', label: 'Distribuição de Lucro', eyebrow: 'Valores', description: 'Sócios, CPF/CNPJ, empresa e valores por mês.' },
    { value: 'ecd_ecf', label: 'ECD / ECF', eyebrow: 'Obrigações', description: 'Entrega, anexos, pendências e conclusões.' },
    { value: 'observacoes', label: 'Pendências/Observações', eyebrow: 'Registros', description: 'Observações registradas nos clientes.' },
  ];
  const selectedReport = reportTypes.find((item) => item.value === selectedReportType) ?? reportTypes[0];
  const responsavelOptions = uniqueValues(
    reportScope
      .map((client) => (selectedReportType === 'ecd_ecf' ? getObrigacaoResponsavel(client) : client.responsavel))
      .filter(Boolean)
  );
  const regimeOptions = selectedReportType === 'ecd_ecf'
    ? ['Lucro Real', 'Lucro Presumido']
    : uniqueValues(reportScope.map((client) => client.regime_tributario).filter(Boolean));
  const atividadeOptions = uniqueValues(reportScope.map((client) => client.atividades).filter(Boolean));
  const empresaOptions = uniqueValues(
    (selectedReportType === 'lucros' ? reinfRelatoriosEnriquecidos : reportScope)
      .map((item) => item.nome_identificacao || item.razao_social)
      .filter(Boolean)
  );
  const socioOptions = uniqueValues(
    reportScope
      .flatMap((client) => getReinfSocios(client).map((socio) => socio.nome))
      .filter(Boolean)
  );
  const obrigacaoOptions = ['ECD', 'ECF'];
  const situacaoOptions = ['Entregues/Concluídos', 'Pendentes/Sem anexo'];
  const baseClientesReportRows = reportScope.filter((client) => {
    const responsavelOk = !reportFilters.responsavel || normalizeText(client.responsavel) === normalizeText(reportFilters.responsavel);
    const regimeOk = !reportFilters.regime || normalizeText(client.regime_tributario) === normalizeText(reportFilters.regime);
    const atividadeOk = !reportFilters.atividade || normalizeText(client.atividades) === normalizeText(reportFilters.atividade);
    return responsavelOk && regimeOk && atividadeOk;
  });
  const observacoesReportRows = reportScope.filter((client) => {
    if (!hasPendenciasObservacoes(client)) return false;
    const responsavelOk = !reportFilters.responsavel || normalizeText(client.responsavel) === normalizeText(reportFilters.responsavel);
    const regimeOk = !reportFilters.regime || normalizeText(client.regime_tributario) === normalizeText(reportFilters.regime);
    return responsavelOk && regimeOk;
  });
  const lucrosReportRows = reinfRelatoriosEnriquecidos.flatMap((relatorio) => {
    const relatorioIsTotalsModel = isReinfTotalsTableModel(relatorio.modelo_tabela);
    const relatorioMeses = Array.isArray(relatorio.meses) ? relatorio.meses : [];
    const mesesSelecionados = reportFilters.meses.length
      ? relatorioMeses.filter((month) => reportFilters.meses.includes(month))
      : relatorioMeses;
    const socios = Array.isArray(relatorio.socios) && relatorio.socios.length
      ? relatorio.socios
      : [{ nome: 'Sem sócio', cpf: '', valores_por_mes: {}, total: '' }];
    const empresaNome = relatorio.nome_identificacao || relatorio.razao_social || '';
    const responsavelOk = !reportFilters.responsavel || normalizeText(relatorio.responsavel) === normalizeText(reportFilters.responsavel);
    const empresaOk = !reportFilters.empresa || normalizeText(empresaNome) === normalizeText(reportFilters.empresa);
    const mesesOk = !reportFilters.meses.length || mesesSelecionados.length > 0;

    if (!responsavelOk || !empresaOk || !mesesOk) return [];

    return socios
      .filter((socio) => !reportFilters.socio || normalizeText(socio.nome) === normalizeText(reportFilters.socio))
      .map((socio) => {
        const valoresPorMes = socio.valores_por_mes ?? socio.valoresPorMes ?? {};
        const valoresTotais = socio.valores_totais ?? socio.valoresTotais ?? {};
        const valoresSelecionados = {};
        let total = 0;
        mesesSelecionados.forEach((month) => {
          const valor = valoresPorMes[month] ?? '';
          valoresSelecionados[month] = valor;
          total += parseCurrencyNumber(valor);
        });
        if (relatorioIsTotalsModel && !total) {
          total = parseCurrencyNumber(socio.total);
        }

        return {
          id: `${relatorio.id ?? relatorio.cliente_id}-${socio.socio_id ?? socio.nome ?? 'socio'}-${mesesSelecionados.join('-')}`,
          criado_em: relatorio.criado_em,
          modelo_tabela: relatorio.modelo_tabela || REINF_TABLE_MODEL_MONTHLY,
          modelo_tabela_label: relatorio.modelo_tabela_label || getReinfTableModelLabel(relatorio.modelo_tabela),
          cliente: empresaNome || 'Não informado',
          razao_social: relatorio.razao_social || '',
          cnpj: relatorio.cnpj || '',
          responsavel: relatorio.responsavel || '',
          revisor: relatorio.revisor || '',
          periodicidade: getReinfPeriodicityLabelFromMonths(mesesSelecionados, relatorio.periodicidade || ''),
          ano_referencia: relatorio.ano_referencia || '',
          meses: mesesSelecionados,
          socio: socio.nome || 'Sem sócio',
          cpf: socio.cpf || '',
          valores_por_mes: valoresSelecionados,
          valores_totais: valoresTotais,
          total: total ? formatCurrencyDisplay(total) : (socio.total || ''),
        };
      });
  });
  const lucrosHasTotalsModel = lucrosReportRows.some((row) => isReinfTotalsTableModel(row.modelo_tabela));
  const lucrosSelectedMonths = reportFilters.meses.length
    ? reportFilters.meses
    : REINF_MONTH_OPTIONS
      .map((month) => month.value)
      .filter((month) => lucrosReportRows.some((row) => row.meses.includes(month)));
  const lucrosExportRows = lucrosReportRows.map((row) => {
    const exportRow = {
      'Gerado em': formatDateTime(row.criado_em),
      Empresa: row.cliente,
      'Razão social': row.razao_social,
      CNPJ: formatCnpj(row.cnpj),
      Responsável: row.responsavel,
      Revisor: row.revisor,
      'Modelo da tabela': row.modelo_tabela_label || getReinfTableModelLabel(row.modelo_tabela),
      Periodicidade: getReinfPeriodicityLabelFromMonths(row.meses, row.periodicidade),
      Ano: row.ano_referencia,
      Meses: row.meses.map(getReinfMonthLabel).join(', '),
      Período: row.meses.length ? `${row.meses.map(getReinfMonthShortLabel).join(', ')} ${row.ano_referencia || ''}`.trim() : 'Não informado',
      Sócio: row.socio,
      'CPF/CNPJ': row.cpf ? formatCpfInput(row.cpf) : '',
    };

    lucrosSelectedMonths.forEach((month) => {
      exportRow[getReinfMonthShortLabel(month)] = row.valores_por_mes[month] ?? '';
    });
    if (isReinfTotalsTableModel(row.modelo_tabela)) {
      REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
        exportRow[field.label] = row.valores_totais?.[field.key] ?? '';
      });
    } else if (lucrosHasTotalsModel) {
      REINF_TOTAL_FIELD_OPTIONS.forEach((field) => {
        exportRow[field.label] = '';
      });
    }

    return {
      ...exportRow,
      Total: row.total,
    };
  });
  const ecdEcfReportRows = buildEcdEcfReportRows(reportScope, reportFilters);
  const ecdEcfExportRows = ecdEcfReportRows.map((row) => ({
    Cliente: row.cliente,
    'Razão social': row.razao_social,
    CNPJ: formatCnpj(row.cnpj),
    Responsável: row.responsavel,
    Regime: row.regime,
    Obrigação: row.obrigacao,
    'Última entregue': row.ultima_entregue,
    'Data de entrega': row.data_entrega,
    'Data enviada': row.data_enviada,
    Recibo: row.recibo,
    Situação: row.situacao,
  }));
  const observacoesExportRows = buildPendenciasObservacoesRows(observacoesReportRows);
  const currentReportRows = selectedReportType === 'clientes'
    ? baseClientesReportRows
    : selectedReportType === 'lucros'
      ? lucrosReportRows
      : selectedReportType === 'ecd_ecf'
        ? ecdEcfReportRows
        : selectedReportType === 'observacoes'
          ? observacoesReportRows
          : [];
  const currentReportExportRows = selectedReportType === 'clientes'
    ? buildBaseCompletaClientesRows(currentReportRows)
    : selectedReportType === 'lucros'
      ? lucrosExportRows
      : selectedReportType === 'ecd_ecf'
        ? ecdEcfExportRows
        : selectedReportType === 'observacoes'
          ? observacoesExportRows
          : [];
  const previewRows = currentReportRows.slice(0, 10);
  const canGenerateReportPreview = selectedReportType === 'clientes'
    || selectedReportType === 'lucros'
    || selectedReportType === 'ecd_ecf'
    || selectedReportType === 'observacoes';
  const canDownloadCurrentReport = canGenerateReportPreview && canExport && currentReportExportRows.length > 0;
  const [previewGeneratedAt, setPreviewGeneratedAt] = useState(null);
  const previewResultRef = useRef(null);
  const hasGeneratedPreview = Boolean(previewGeneratedAt) && canGenerateReportPreview;

  function updateReportFilter(key, value) {
    setReportFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleReportMonth(month) {
    setReportFilters((current) => {
      const meses = current.meses.includes(month)
        ? current.meses.filter((item) => item !== month)
        : [...current.meses, month];
      return { ...current, meses };
    });
  }

  function clearReportFilters() {
    setReportFilters({
      responsavel: '',
      regime: '',
      atividade: '',
      empresa: '',
      socio: '',
      obrigacao: '',
      situacao: '',
      meses: [],
    });
  }

  function toggleReinfReportSelection(reportId) {
    if (!reportId) return;
    setReinfReportDeleteStatus('');
    setSelectedReinfReportIds((current) =>
      current.includes(reportId)
        ? current.filter((id) => id !== reportId)
        : [...current, reportId]
    );
  }

  function toggleVisibleReinfReportsSelection() {
    setReinfReportDeleteStatus('');
    setSelectedReinfReportIds((current) => {
      if (allVisibleReinfReportsSelected) {
        return current.filter((id) => !visibleReinfReportIds.includes(id));
      }

      return uniqueValues([...current, ...visibleReinfReportIds]);
    });
  }

  function selectAllReinfReports() {
    setReinfReportDeleteStatus('');
    setSelectedReinfReportIds(reinfRelatorioIds);
  }

  function clearSelectedReinfReports() {
    setReinfReportDeleteStatus('');
    setSelectedReinfReportIds([]);
  }

  async function deleteSelectedReinfReports() {
    if (!canDeleteReinfReports || !selectedReinfReportCards.length) return;
    const count = selectedReinfReportCards.length;
    const confirmed = window.confirm(`Excluir ${count} relatório(s) de distribuição de lucro selecionado(s)? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setReinfReportDeleteStatus('Excluindo relatórios selecionados...');
    let deletedCount = 0;
    let failedCount = 0;

    for (const { relatorio } of selectedReinfReportCards) {
      const deleted = await onDeleteReinfReport?.(relatorio, { skipConfirm: true, silent: true });
      if (deleted) {
        deletedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    setSelectedReinfReportIds((current) =>
      current.filter((id) => !selectedReinfReportCards.some(({ relatorio }) => relatorio?.id === id))
    );
    setReinfReportDeleteStatus(
      failedCount
        ? `${deletedCount} relatório(s) excluído(s), ${failedCount} com falha.`
        : `${deletedCount} relatório(s) excluído(s).`
    );
  }

  function handleGeneratePreview() {
    if (!canGenerateReportPreview) return;
    setPreviewGeneratedAt(new Date());
    window.setTimeout(() => {
      previewResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  function exportCurrentReport(format) {
    if (!canDownloadCurrentReport) return;
    const filenameBase = selectedReportType === 'lucros'
      ? 'relatorio-distribuicao-lucro'
      : selectedReportType === 'ecd_ecf'
        ? 'relatorio-ecd-ecf'
        : selectedReportType === 'observacoes'
          ? 'relatorio-pendencias-observacoes'
          : 'relatorio-base-clientes';
    const pdfTitle = selectedReportType === 'lucros'
      ? 'Relatório - Distribuição de Lucro'
      : selectedReportType === 'ecd_ecf'
        ? 'Relatório - ECD ECF'
        : selectedReportType === 'observacoes'
          ? 'Relatório - Pendências e Observações'
          : 'Relatório - Base de Clientes';
    if (format === 'xlsx') {
      onExportXlsx(currentReportExportRows, `${filenameBase}.xlsx`);
      return;
    }
    if (format === 'csv') {
      onExportCsv(currentReportExportRows, `${filenameBase}.csv`);
      return;
    }
    onExportPdf(currentReportExportRows, `${filenameBase}.pdf`, pdfTitle);
  }

  function renderPreviewTable() {
    if (!hasGeneratedPreview) {
      return (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500 dark:border-gray-700 dark:bg-gray-950/50 dark:text-gray-400">
          Selecione os filtros desejados e clique em Gerar prévia para visualizar os dados do relatório nesta área.
        </div>
      );
    }

    if (selectedReportType === 'lucros') {
      return (
        <div ref={previewResultRef} className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-2 dark:border-gray-800 dark:bg-gray-950/50">
          <TableScrollArea>
            <table className="min-w-[1180px] table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[150px]" />
                <col className="w-[120px]" />
                <col className="w-[95px]" />
                <col className="w-[110px]" />
                <col className="w-[145px]" />
                <col className="w-[120px]" />
                <col className="w-[105px]" />
                {lucrosSelectedMonths.map((month) => (
                  <col key={month} className="w-[82px]" />
                ))}
                {lucrosHasTotalsModel ? REINF_TOTAL_FIELD_OPTIONS.map((field) => (
                  <col key={field.key} className="w-[120px]" />
                )) : null}
                <col className="w-[95px]" />
              </colgroup>
              <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:bg-gray-950 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">CNPJ</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Modelo</th>
                  <th className="px-3 py-2">Sócio</th>
                  <th className="px-3 py-2">CPF/CNPJ</th>
                  <th className="px-3 py-2">Período</th>
                  {lucrosSelectedMonths.map((month) => (
                    <th key={month} className="px-3 py-2 text-right">{getReinfMonthShortLabel(month)}</th>
                  ))}
                  {lucrosHasTotalsModel ? REINF_TOTAL_FIELD_OPTIONS.map((field) => (
                    <th key={field.key} className="px-3 py-2 text-right">{field.label}</th>
                  )) : null}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {previewRows.length ? (
                  previewRows.map((row) => (
                    <tr key={row.id} className="text-slate-700 dark:text-gray-200">
                      <td className="break-words px-3 py-2 font-black leading-snug">{row.cliente || 'Não informado'}</td>
                      <td className="break-words px-3 py-2 font-semibold leading-snug">{formatCnpj(row.cnpj)}</td>
                      <td className="break-words px-3 py-2 font-semibold leading-snug">{row.responsavel || '-'}</td>
                      <td className="break-words px-3 py-2 font-semibold leading-snug">{row.modelo_tabela_label || '-'}</td>
                      <td className="break-words px-3 py-2 font-semibold leading-snug">{row.socio || '-'}</td>
                      <td className="break-words px-3 py-2 font-semibold leading-snug">{row.cpf ? formatCpfInput(row.cpf) : '-'}</td>
                      <td className="break-words px-3 py-2 font-semibold leading-snug">
                        {row.meses.length ? `${row.meses.map(getReinfMonthShortLabel).join(', ')} ${row.ano_referencia || ''}`.trim() : 'Não informado'}
                      </td>
                      {lucrosSelectedMonths.map((month) => (
                        <td key={month} className="px-3 py-2 text-right font-semibold tabular-nums">{row.valores_por_mes[month] || '-'}</td>
                      ))}
                      {lucrosHasTotalsModel ? REINF_TOTAL_FIELD_OPTIONS.map((field) => (
                        <td key={field.key} className="px-3 py-2 text-right font-semibold tabular-nums">{row.valores_totais?.[field.key] || '-'}</td>
                      )) : null}
                      <td className="px-3 py-2 text-right font-black tabular-nums">{row.total || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8 + lucrosSelectedMonths.length + (lucrosHasTotalsModel ? REINF_TOTAL_FIELD_OPTIONS.length : 0)} className="px-4 py-8 text-center text-sm font-bold text-slate-500 dark:text-gray-400">
                      Nenhum registro encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScrollArea>
        </div>
      );
    }

    if (selectedReportType === 'ecd_ecf') {
      return (
        <div ref={previewResultRef} className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-950/50">
          <TableScrollArea>
            <table className="min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:bg-gray-950 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">CNPJ</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Regime</th>
                  <th className="px-4 py-3">Obrigação</th>
                  <th className="px-4 py-3">Última entregue</th>
                  <th className="px-4 py-3">Data de entrega</th>
                  <th className="px-4 py-3">Data enviada</th>
                  <th className="px-4 py-3">Recibo</th>
                  <th className="px-4 py-3">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {previewRows.length ? (
                  previewRows.map((row) => (
                    <tr key={row.id} className="text-slate-700 dark:text-gray-200">
                      <td className="px-4 py-3 font-black">{row.cliente || 'Não informado'}</td>
                      <td className="px-4 py-3 font-semibold">{formatCnpj(row.cnpj)}</td>
                      <td className="px-4 py-3 font-semibold">{row.responsavel || '-'}</td>
                      <td className="px-4 py-3 font-semibold">{row.regime || '-'}</td>
                      <td className="px-4 py-3 font-black">{row.obrigacao || '-'}</td>
                      <td className="px-4 py-3 font-semibold">{row.ultima_entregue || '-'}</td>
                      <td className="px-4 py-3 font-semibold">{row.data_entrega || '-'}</td>
                      <td className="px-4 py-3 font-semibold">{row.data_enviada || '-'}</td>
                      <td className="px-4 py-3 font-semibold">{row.recibo || '-'}</td>
                      <td className="px-4 py-3 font-black">{row.situacao || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-sm font-bold text-slate-500 dark:text-gray-400">
                      Nenhum registro encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScrollArea>
        </div>
      );
    }

    if (selectedReportType === 'observacoes') {
      return (
        <div ref={previewResultRef} className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-950/50">
          <TableScrollArea>
            <table className="min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:bg-gray-950 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">CNPJ</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Regime</th>
                  <th className="px-4 py-3">Pendências/Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {previewRows.length ? (
                  previewRows.map((client) => (
                    <tr key={client.id ?? client.cnpj} className="text-slate-700 dark:text-gray-200">
                      <td className="px-4 py-3 font-black">{client.nome_identificacao || client.razao_social || 'Não informado'}</td>
                      <td className="px-4 py-3 font-semibold">{formatCnpj(client.cnpj)}</td>
                      <td className="px-4 py-3 font-semibold">{client.responsavel || '-'}</td>
                      <td className="px-4 py-3 font-semibold">{client.regime_tributario || '-'}</td>
                      <td className="max-w-[460px] whitespace-pre-wrap px-4 py-3 font-semibold leading-6">
                        {client.pendencias_observacoes || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-slate-500 dark:text-gray-400">
                      Nenhum registro encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScrollArea>
        </div>
      );
    }

    return (
      <div ref={previewResultRef} className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-950/50">
        <TableScrollArea>
          <table className="min-w-[980px] text-left text-sm">
            <thead className="bg-slate-100 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:bg-gray-950 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Razão social</th>
                <th className="px-4 py-3">CNPJ</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Revisor</th>
                <th className="px-4 py-3">Regime</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Atividade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {previewRows.length ? (
                previewRows.map((client) => (
                  <tr key={client.id ?? client.cnpj} className="text-slate-700 dark:text-gray-200">
                    <td className="px-4 py-3 font-black">{client.nome_identificacao || client.razao_social || 'Não informado'}</td>
                    <td className="px-4 py-3 font-semibold">{client.razao_social || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{formatCnpj(client.cnpj)}</td>
                    <td className="px-4 py-3 font-semibold">{client.responsavel || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{client.revisor || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{client.regime_tributario || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{client.tipo_cliente || '-'}</td>
                    <td className="px-4 py-3 font-semibold">{client.atividades || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm font-bold text-slate-500 dark:text-gray-400">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScrollArea>
      </div>
    );
  }

  function renderReportFilters() {
    if (selectedReportType === 'lucros') {
      return (
        <>
          <DropdownFilterSelect label="Responsável" value={reportFilters.responsavel} options={responsavelOptions} onChange={(value) => updateReportFilter('responsavel', value)} />
          <DropdownFilterSelect label="Empresa" value={reportFilters.empresa} options={empresaOptions} onChange={(value) => updateReportFilter('empresa', value)} />
          <DropdownFilterSelect label="Sócio" value={reportFilters.socio} options={socioOptions} onChange={(value) => updateReportFilter('socio', value)} />
          <div className="sm:col-span-2 xl:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-normal text-slate-500 dark:text-gray-400">Período</span>
              <button
                type="button"
                onClick={() => updateReportFilter('meses', [])}
                className="text-xs font-black text-brand-blue hover:text-blue-300"
              >
                Todos
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {REINF_MONTH_OPTIONS.map((month) => {
                const selected = reportFilters.meses.includes(month.value);
                return (
                  <button
                    key={month.value}
                    type="button"
                    onClick={() => toggleReportMonth(month.value)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-black transition ${
                      selected
                        ? 'border-brand-blue bg-brand-blue text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-brand-blue dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                    }`}
                  >
                    {month.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      );
    }

    if (selectedReportType === 'ecd_ecf') {
      return (
        <>
          <DropdownFilterSelect label="Responsável" value={reportFilters.responsavel} options={responsavelOptions} onChange={(value) => updateReportFilter('responsavel', value)} />
          <DropdownFilterSelect label="Regime tributário" value={reportFilters.regime} options={regimeOptions} onChange={(value) => updateReportFilter('regime', value)} />
          <DropdownFilterSelect label="Obrigação" value={reportFilters.obrigacao} options={obrigacaoOptions} onChange={(value) => updateReportFilter('obrigacao', value)} />
          <DropdownFilterSelect label="Situação" value={reportFilters.situacao} options={situacaoOptions} onChange={(value) => updateReportFilter('situacao', value)} />
        </>
      );
    }

    return (
      <>
        <DropdownFilterSelect label="Responsável" value={reportFilters.responsavel} options={responsavelOptions} onChange={(value) => updateReportFilter('responsavel', value)} />
        <DropdownFilterSelect label="Regime tributário" value={reportFilters.regime} options={regimeOptions} onChange={(value) => updateReportFilter('regime', value)} />
        {selectedReportType === 'clientes' ? (
          <DropdownFilterSelect label="Atividade" value={reportFilters.atividade} options={atividadeOptions} onChange={(value) => updateReportFilter('atividade', value)} />
        ) : null}
      </>
    );
  }
  return (
    <div className="min-w-0 space-y-5">
      <section className="surface-card p-6">
        <div className="grid gap-3 lg:grid-cols-4">
          {reportTypes.map((type) => {
            const selected = selectedReportType === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => setSelectedReportType(type.value)}
                className={`rounded-xl border p-4 text-left transition ${
                  selected
                    ? 'border-brand-blue bg-brand-blue text-white shadow-soft'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-blue dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200'
                }`}
              >
                <span className={`text-[10px] font-black uppercase tracking-[0.16em] ${selected ? 'text-blue-100' : 'text-slate-500 dark:text-gray-400'}`}>
                  {type.eyebrow}
                </span>
                <span className="mt-2 block text-base font-black">{type.label}</span>
                <span className={`mt-2 block text-xs font-semibold leading-5 ${selected ? 'text-blue-50' : 'text-slate-500 dark:text-gray-400'}`}>
                  {type.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
              Filtros
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-gray-100">{selectedReport.label}</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={clearReportFilters}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
            >
              <RefreshCcw size={15} aria-hidden="true" />
              Limpar filtros
            </button>
            {canExport ? (
              <>
                <button
                  type="button"
                  onClick={() => onExportXlsx(reportScope, 'clientes-contabeis-filtrados.xlsx')}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-blue px-4 py-2 text-sm font-black text-white transition hover:bg-[#0056d6]"
                >
                  <Download size={15} aria-hidden="true" />
                  Excel filtrado
                </button>
                <button
                  type="button"
                  onClick={() => onExportCsv(reportScope, 'clientes-contabeis-filtrados.csv')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                >
                  <FileDown size={15} aria-hidden="true" />
                  CSV filtrado
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {renderReportFilters()}
        </div>
      </section>

      <section className="surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
              Prévia
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-gray-100">Pré-visualização do relatório</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-gray-400">
              {canGenerateReportPreview
                ? `${formatNumber(currentReportRows.length)} ${selectedReportType === 'ecd_ecf' ? 'linha(s)' : 'cliente(s)'} neste relatório.`
                : 'Este relatório será conectado em uma próxima etapa.'}
            </p>
            {previewGeneratedAt && canGenerateReportPreview ? (
              <p className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                Prévia gerada em {previewGeneratedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={!canGenerateReportPreview}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300 dark:disabled:border-gray-800 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
            >
              <Eye size={15} aria-hidden="true" />
              Gerar prévia
            </button>
            <button
              type="button"
              onClick={() => exportCurrentReport('pdf')}
              disabled={!canDownloadCurrentReport}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-blue px-4 py-2 text-sm font-black text-white transition hover:bg-[#0056d6] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
            >
              <Download size={15} aria-hidden="true" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => exportCurrentReport('xlsx')}
              disabled={!canDownloadCurrentReport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300 dark:disabled:border-gray-800 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
            >
              <FileSpreadsheet size={15} aria-hidden="true" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => exportCurrentReport('csv')}
              disabled={!canDownloadCurrentReport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300 dark:disabled:border-gray-800 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
            >
              <FileDown size={15} aria-hidden="true" />
              CSV
            </button>
          </div>
        </div>

        {renderPreviewTable()}
      </section>

      {selectedReportType === 'lucros' ? (
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
                Histórico salvo
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-gray-100">Relatórios de Distribuição de Lucro</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-gray-400">
                {formatNumber(reinfRelatorioCards.length)} relatório(s) salvo(s).
              </p>
              {reinfReportDeleteStatus ? (
                <p className="mt-1 text-xs font-black text-emerald-600 dark:text-emerald-300">{reinfReportDeleteStatus}</p>
              ) : null}
            </div>
            {canDeleteReinfReports ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleVisibleReinfReportsSelection}
                  disabled={!visibleReinfReportIds.length}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                >
                  {allVisibleReinfReportsSelected ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
                </button>
                <button
                  type="button"
                  onClick={selectAllReinfReports}
                  disabled={!reinfRelatorioIds.length}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                >
                  Selecionar todos
                </button>
                <button
                  type="button"
                  onClick={clearSelectedReinfReports}
                  disabled={!selectedReinfReportIds.length}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
                >
                  Limpar seleção
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedReinfReports}
                  disabled={!selectedReinfReportCards.length}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15"
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Excluir selecionados ({selectedReinfReportCards.length})
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white/70 p-2 dark:border-gray-800 dark:bg-gray-950/50">
            {reinfRelatorioCards.length ? (
              <TableScrollArea>
                <table className="w-full table-fixed text-left text-xs">
                  <colgroup>
                    {canDeleteReinfReports ? <col className="w-[4%]" /> : null}
                    <col className={canDeleteReinfReports ? 'w-[22%]' : 'w-[24%]'} />
                    <col className="w-[14%]" />
                    <col className="w-[11%]" />
                    <col className="w-[10%]" />
                    <col className="w-[18%]" />
                    <col className="w-[7%]" />
                    <col className="w-[12%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-gray-950 dark:text-gray-400">
                    <tr>
                      {canDeleteReinfReports ? (
                        <th className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={allVisibleReinfReportsSelected}
                            onChange={toggleVisibleReinfReportsSelection}
                            aria-label="Selecionar relatórios visíveis"
                            className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue dark:border-gray-700 dark:bg-gray-900"
                          />
                        </th>
                      ) : null}
                      <th className="px-3 py-3">Cliente</th>
                      <th className="px-3 py-3">CNPJ</th>
                      <th className="px-3 py-3">Responsável</th>
                      <th className="px-3 py-3">Revisor</th>
                      <th className="px-3 py-3">Período</th>
                      <th className="px-3 py-3 text-center">Sócios</th>
                      <th className="px-3 py-3">Gerado em</th>
                      <th className="px-3 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {visibleReinfRelatorioCards.map(({ relatorio }) => {
                      const selected = selectedReinfReportIdSet.has(relatorio.id);
                      return (
                        <tr key={relatorio.id} className="text-slate-700 dark:text-gray-200">
                          {canDeleteReinfReports ? (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleReinfReportSelection(relatorio.id)}
                                aria-label={`Selecionar relatório de ${relatorio.razao_social || relatorio.nome_identificacao || 'cliente'}`}
                                className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue dark:border-gray-700 dark:bg-gray-900"
                              />
                            </td>
                          ) : null}
                          <td className="break-words px-3 py-3">
                            <p className="font-black leading-snug">{relatorio.razao_social || relatorio.nome_identificacao || 'Não informado'}</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-gray-400">
                              {relatorio.nome_identificacao || '-'}
                            </p>
                          </td>
                          <td className="break-words px-3 py-3 font-semibold leading-snug">{formatCnpj(relatorio.cnpj)}</td>
                          <td className="break-words px-3 py-3 font-semibold leading-snug">{relatorio.responsavel || '-'}</td>
                          <td className="break-words px-3 py-3 font-semibold leading-snug">{relatorio.revisor || '-'}</td>
                          <td className="break-words px-3 py-3 font-semibold leading-snug">
                            <p className="font-black">{getReinfRelatorioPeriodicityLabel(relatorio)}</p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">
                              {getReinfRelatorioMonthsLabel(relatorio)} {relatorio.ano_referencia || ''}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-center font-black">{getReinfRelatorioSociosCount(relatorio)}</td>
                          <td className="break-words px-3 py-3 font-semibold leading-snug">{formatDateTime(relatorio.criado_em)}</td>
                          <td className="px-3 py-3 text-center">
                            {canDeleteReinfReports ? (
                              <button
                                type="button"
                                onClick={() => onDeleteReinfReport?.(relatorio)}
                                className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-300 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-50 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10"
                              >
                                <Trash2 size={13} aria-hidden="true" />
                                Excluir
                              </button>
                            ) : (
                              <span className="text-xs font-bold text-slate-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScrollArea>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500 dark:border-gray-700 dark:bg-gray-950/50 dark:text-gray-400">
                Nenhum relatório de distribuição de lucro foi salvo ainda.
              </div>
            )}
          </div>

          {hasHiddenReinfRelatorios ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllReinfReports(true)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
              >
                Ver todos
              </button>
            </div>
          ) : showAllReinfReports && reinfRelatorioCards.length > 5 ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllReinfReports(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300"
              >
                Mostrar ultimos 5
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

    </div>
  );
}

function AuthShell({ title, description, children }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 dark:bg-gray-950 dark:text-gray-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-[#0b1427] p-8 text-white sm:p-10">
            <div>
              <img
                src={f12Logo}
                alt="F12 Contabilidade Estratégica"
                className="h-24 w-72 rounded-xl bg-[#080c2b] object-contain object-left"
              />
              <p className="mt-3 text-sm font-semibold text-slate-400">Acesso seguro</p>
            </div>
            <h1 className="mt-12 text-3xl font-black leading-tight sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-300">{description}</p>
            <div className="mt-10 grid gap-3">
              {['Dois logins institucionais', 'Perfis por nível de acesso', 'Sessão autenticada com Supabase Auth', 'Rastreabilidade da base contábil'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg bg-white/6 p-3 text-sm font-bold text-slate-200">
                  <CheckCircle2 className="text-brand-teal" size={18} aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="relative p-6 sm:p-10">
            {/* Atalho visível também na autenticação para o usuário alternar o tema antes do login. */}
            <div className="mb-6 flex justify-end">
              <ThemeToggle />
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

function PasswordRules({ password, userLike }) {
  const errors = validatePassword(password, userLike);
  const passed = password && errors.length === 0;
  return (
    <div className={`rounded-lg border p-3 text-sm font-semibold ${passed ? chipClass('success') : chipClass('neutral')}`}>
      {passed ? 'Senha atende às regras de segurança.' : 'A senha deve ter 8+ caracteres, maiúscula, minúscula, número, caractere especial e não conter nome/e-mail.'}
    </div>
  );
}

function LoginPage({ onLogin, onForgot, onReset, onFirstAccess }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const result = await onLogin(email, senha);
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <AuthShell
      title="Portal de Gestão Contábil"
      description="Acesse sua carteira contábil, pendências e obrigações."
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthTextField label="E-mail" type="email" value={email} onChange={setEmail} icon={Mail} />
        <AuthTextField label="Senha" type="password" value={senha} onChange={setSenha} icon={LockKeyhole} />
        {message ? <div className={`rounded-lg border p-3 text-sm font-bold ${chipClass('danger')}`}>{message}</div> : null}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-blue px-4 py-3 text-sm font-black text-white transition hover:bg-navy-700 disabled:opacity-60">
          {busy ? 'Validando...' : 'Entrar'}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
          <button type="button" onClick={onForgot} className="text-brand-blue hover:text-navy-700">
            Esqueci minha senha
          </button>
          <button type="button" onClick={onFirstAccess} className="text-brand-blue hover:text-navy-700">
            Primeiro acesso
          </button>
          <button type="button" onClick={onReset} className="text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-100">
            Tenho token de redefinição
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

function FirstAccessPage({ onBack, onCreatePassword }) {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState([]);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const result = await onCreatePassword(email);
    setBusy(false);
    if (result.ok) {
      setSuccess('Se o e-mail estiver habilitado, enviaremos o link para criação de senha.');
      setErrors([]);
      setEmail('');
    } else {
      setSuccess('');
      setErrors(result.errors);
    }
  }

  return (
    <AuthShell title="Primeiro acesso" description="Informe o e-mail institucional para receber o link de criação de senha.">
      <form onSubmit={submit} className="space-y-4">
        <AuthTextField label="E-mail institucional" type="email" value={email} onChange={setEmail} icon={Mail} />
        <ErrorList errors={errors} />
        {success ? <div className={`rounded-lg border p-3 text-sm font-bold ${chipClass('success')}`}>{success}</div> : null}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-blue px-4 py-3 text-sm font-black text-white transition hover:bg-navy-700 disabled:opacity-60">
          {busy ? 'Enviando link...' : 'Enviar link'}
        </button>
        <button type="button" onClick={onBack} className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 dark:border-gray-700 dark:text-gray-100">
          Voltar ao login
        </button>
      </form>
    </AuthShell>
  );
}

function ForgotPasswordPage({ onBack, onRequestReset }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    await onRequestReset(email);
    setMessage('Se o e-mail estiver cadastrado, enviaremos as instruções para redefinição de senha.');
  }

  return (
    <AuthShell title="Recuperar senha" description="O token gerado tem validade limitada e é invalidado após o uso.">
      <form onSubmit={submit} className="space-y-4">
        <AuthTextField label="E-mail profissional" type="email" value={email} onChange={setEmail} icon={Mail} />
        {message ? <div className={`rounded-lg border p-3 text-sm font-bold ${chipClass('info')}`}>{message}</div> : null}
        <button type="submit" className="w-full rounded-lg bg-brand-blue px-4 py-3 text-sm font-black text-white">
          Solicitar redefinição
        </button>
        <button type="button" onClick={onBack} className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 dark:border-gray-700 dark:text-gray-100">
          Voltar ao login
        </button>
      </form>
    </AuthShell>
  );
}

function ResetPasswordPage({ onBack, onResetPassword }) {
  const [form, setForm] = useState({ senha: '', confirmar: '' });
  const [errors, setErrors] = useState([]);
  const [success, setSuccess] = useState('');

  async function submit(event) {
    event.preventDefault();
    const result = await onResetPassword(form.senha, form.confirmar);
    if (result.ok) {
      setSuccess('Senha redefinida. Você já pode acessar com a nova senha.');
      setErrors([]);
    } else {
      setErrors(result.errors);
    }
  }

  return (
    <AuthShell title="Redefinir senha" description="Crie uma nova senha segura. A senha antiga não será exibida.">
      <form onSubmit={submit} className="space-y-4">
        <AuthTextField label="Nova senha" type="password" value={form.senha} onChange={(value) => setForm((current) => ({ ...current, senha: value }))} allowReveal />
        <AuthTextField label="Confirmar nova senha" type="password" value={form.confirmar} onChange={(value) => setForm((current) => ({ ...current, confirmar: value }))} allowReveal />
        <PasswordRules password={form.senha} userLike={{}} />
        <ErrorList errors={errors} />
        {success ? <div className={`rounded-lg border p-3 text-sm font-bold ${chipClass('success')}`}>{success}</div> : null}
        <button type="submit" className="w-full rounded-lg bg-brand-blue px-4 py-3 text-sm font-black text-white">
          Redefinir senha
        </button>
        <button type="button" onClick={onBack} className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 dark:border-gray-700 dark:text-gray-100">
          Voltar ao login
        </button>
      </form>
    </AuthShell>
  );
}

function AuthTextField({ label, value, onChange, type = 'text', icon: Icon, disabled = false, allowReveal = false }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const canReveal = allowReveal && type === 'password' && !disabled;
  const inputType = canReveal && isRevealed ? 'text' : type;
  const RevealIcon = isRevealed ? EyeOff : Eye;

  return (
    <label className="block text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
      {label}
      <div className="relative mt-1">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={17} aria-hidden="true" /> : null}
        <input
          type={inputType}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-500 ${Icon ? 'pl-10' : ''} ${canReveal ? 'pr-11' : ''}`}
        />
        {canReveal ? (
          <button
            type="button"
            onClick={() => setIsRevealed((current) => !current)}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-brand-blue focus:outline-none focus:ring-4 focus:ring-brand-blue/10 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-blue-300"
            aria-label={isRevealed ? `Ocultar ${label.toLowerCase()}` : `Exibir ${label.toLowerCase()}`}
            title={isRevealed ? 'Ocultar senha' : 'Exibir senha'}
          >
            <RevealIcon size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </label>
  );
}

function ErrorList({ errors }) {
  if (!errors?.length) return null;
  return (
    <div className={`rounded-lg border p-3 text-sm font-bold ${chipClass('danger')}`}>
      {errors.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
  );
}

function UserModal({ user, users, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    nome: user?.nome ?? '',
    email: user?.email ?? '',
    cargo: user?.cargo ?? '',
    setor: user?.setor ?? '',
    perfil_acesso: user?.perfil_acesso ?? ACCESS_PROFILE_OPTIONS[0]?.value ?? '',
    status: user?.status ?? 'Ativo',
  }));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const nextErrors = [];
    const email = form.email.trim().toLowerCase();
    const duplicate = users.some((item) => item.id !== user?.id && normalizeText(item.email) === normalizeText(email));
    if (isBlank(form.nome)) nextErrors.push('Nome completo é obrigatório.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.push('Informe um e-mail profissional válido.');
    if (duplicate) nextErrors.push('Já existe um usuário cadastrado com este e-mail.');
    if (!form.perfil_acesso) nextErrors.push('Selecione o perfil de acesso.');

    const sociosValidos = normalizeSociosClienteInput(form._socios ?? []);
    if (sociosValidos.some((socio) => !socio.nome && socio.cpf)) {
      nextErrors.push('Informe o nome do sócio.');
    }
    if (sociosValidos.some((socio) => socio.nome && !socio.cpf)) {
      nextErrors.push('Informe o CPF/CNPJ do sócio.');
    }
    if (sociosValidos.some((socio) => socio.cpf && !isCpfCnpjDigitsValid(socio.cpf))) {
      nextErrors.push('CPF/CNPJ do sócio deve ter 11 ou 14 dígitos.');
    }

    if (nextErrors.length) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    await onSave({
      ...user,
      nome: form.nome,
      email,
      cargo: form.cargo,
      setor: form.setor,
      perfil_acesso: form.perfil_acesso,
      status: form.status,
    });
    setBusy(false);
  }

  return (
    <div className="modal-backdrop z-50 overflow-y-auto">
      <form onSubmit={submit} className="modal-panel modal-panel-md mx-auto my-6">
        <div className="modal-header flex items-center justify-between gap-3">
          <div>
            <h2 className="modal-title">Editar usuário institucional</h2>
            <p className="modal-subtitle">Edição de status e dados complementares do perfil.</p>
          </div>
          <button type="button" onClick={onClose} className="modal-close-button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <AuthTextField label="Nome completo" value={form.nome} onChange={(value) => setForm((current) => ({ ...current, nome: value }))} />
            <AuthTextField label="E-mail profissional" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} disabled />
            <AuthTextField label="Cargo / função" value={form.cargo} onChange={(value) => setForm((current) => ({ ...current, cargo: value }))} />
            <AuthTextField label="Setor" value={form.setor} onChange={(value) => setForm((current) => ({ ...current, setor: value }))} />
            <DropdownFilterSelect
              label="Perfil de acesso"
              value={form.perfil_acesso}
              options={ACCESS_PROFILE_OPTIONS}
              onChange={(nextValue) => setForm((current) => ({ ...current, perfil_acesso: nextValue }))}
              includeBlank={false}
              labelClassName="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400"
              buttonClassName="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <DropdownFilterSelect
              label="Status"
              value={form.status}
              options={USER_STATUS}
              onChange={(nextValue) => setForm((current) => ({ ...current, status: nextValue }))}
              includeBlank={false}
              labelClassName="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400"
              buttonClassName="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            O e-mail institucional e a senha continuam protegidos pelo Supabase Auth. Aqui gerimos nome, cargo, setor, perfil e status do acesso.
          </div>

          <ErrorList errors={errors} />
        </div>

        <div className="modal-footer flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 dark:border-gray-700 dark:text-gray-100">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
            <Save size={16} aria-hidden="true" />
            {busy ? 'Salvando...' : 'Salvar usuário'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AccessDeniedPage({ title = 'Acesso negado', message = 'Seu perfil não possui permissão para acessar esta área.' }) {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-800">
      <ShieldAlert className="mx-auto" size={42} aria-hidden="true" />
      <h2 className="mt-4 text-xl font-black">{title}</h2>
      <p className="mt-2 text-sm font-bold">{message}</p>
    </section>
  );
}

function PageLoadingFallback({ label = 'Carregando módulo...' }) {
  return (
    <section className="surface-card p-8 text-center">
      <p className="text-sm font-bold text-slate-600 dark:text-gray-300">{label}</p>
    </section>
  );
}

function FullscreenStatusState({ label }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 text-slate-600 dark:bg-gray-950 dark:text-gray-300">
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
}

function ClientModal({
  client,
  listagens,
  onClose,
  onSave,
  canEditFieldForClient,
  canManageContratosSociais,
  onAnexoSuccess,
  onAnexoRemove,
  onAnexoError,
  onContratoSocialSuccess,
}) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_CLIENT,
    ...client,
    status: normalizeClientStatus(client?.status),
    _socios: normalizeSociosClienteInput(client?._socios ?? []),
    _sociosDirty: false,
    cnpj: client?.cnpj ? formatCnpj(client.cnpj) : '',
  }));
  const [errors, setErrors] = useState([]);
  const modalFields = FIELD_DEFINITIONS.filter((field) =>
    !['criado_em', 'atualizado_em'].includes(field.key)
      && !EDIT_MODAL_HIDDEN_FIELDS.has(field.key)
      && !EDIT_MODAL_HIDDEN_GROUPS.has(field.group),
  );
  const showEcdEcfGroup = isRegimeEcdEcfAplicavel(form.regime_tributario);

  function updateField(key, value) {
    setForm((current) => {
      const nextPatch = applyResponsavelEcdFallback(current, { [key]: value });
      return { ...current, ...nextPatch };
    });
  }

  function updateSocios(nextSocios) {
    setForm((current) => ({
      ...current,
      _socios: normalizeSociosClienteInput(nextSocios),
      _sociosDirty: true,
    }));
  }

  function submit(event) {
    event.preventDefault();
    const nextErrors = [];
    modalFields.forEach((field) => {
      const fieldAllowed = canEditFieldForClient(field.key);
      if (field.required && fieldAllowed && isBlank(form[field.key])) {
        nextErrors.push(`${field.label} é obrigatório.`);
      }
      if (fieldAllowed && (field.type === 'select' || field.type === 'yesno') && !isBlank(form[field.key])) {
        const allowed = uniqueValues([...(getOptions(listagens, field) ?? []), form[field.key]]);
        const isAllowed = allowed.some((option) => normalizeText(option) === normalizeText(form[field.key]));
        if (!isAllowed) nextErrors.push(`${field.label} deve vir da lista cadastrada.`);
      }
    });

    if (normalizeCnpj(form.cnpj).length !== 14) {
      nextErrors.push('CNPJ deve ter 14 dígitos.');
    }

    if (nextErrors.length) {
      setErrors(nextErrors);
      return;
    }

    const digits = normalizeCnpj(form.cnpj);
    const { _analysis, ...cleanForm } = form;
    const protectedForm = { ...cleanForm };
    modalFields.forEach((field) => {
      if (client?.id && !canEditFieldForClient(field.key)) {
        protectedForm[field.key] = client[field.key] ?? '';
      }
    });
    onSave({
      ...protectedForm,
      id: protectedForm.id || stableIdFromCnpj(digits),
      cnpj: formatCnpj(digits),
      cnpj_digitos: digits,
      criado_em: protectedForm.criado_em || new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    });
  }

  return (
    <div className="modal-backdrop z-50 overflow-y-auto">
      <form onSubmit={submit} className="modal-panel modal-panel-xl mx-auto my-6">
        <div className="modal-header sticky top-0 z-10 flex items-center justify-between gap-3">
          <div>
            <h2 className="modal-title">{client?.id ? 'Editar cliente' : 'Novo cliente'}</h2>
            <p className="modal-subtitle">{form.nome_identificacao || form.razao_social || 'Cadastro contábil'}</p>
          </div>
          <button type="button" onClick={onClose} className="modal-close-button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body space-y-5">
          {errors.length ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          {FIELD_GROUPS.map((group) => {
            if (group === 'ECD / ECF' && !showEcdEcfGroup) return null;

            const visibleFields = modalFields.filter((field) => field.group === group);

            if (!visibleFields.length) return null;

            return (
              <Fragment key={group}>
                <section className="modal-section">
                  <h3 className="text-base font-black text-slate-950 dark:text-gray-100">{group}</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visibleFields.map((field) => (
                      <FormField
                        key={field.key}
                        field={{ ...field, label: EDIT_MODAL_FIELD_LABEL_OVERRIDES[field.key] ?? field.label }}
                        value={form[field.key] ?? ''}
                        cliente={form}
                        listagens={listagens}
                        disabled={!canEditFieldForClient(field.key)}
                        disabledReason={deniedReasonForField(null, field.key)}
                        onChange={(value) => updateField(field.key, value)}
                        onAttachmentSuccess={(tipoAnexo, anexo) => {
                          const fieldKey = ATTACHMENT_FIELD_BY_TYPE[tipoAnexo];
                          if (fieldKey) updateField(fieldKey, anexoToFieldValue(anexo));
                          onAnexoSuccess?.(form.id, tipoAnexo, anexo);
                        }}
                        onAttachmentRemove={(tipoAnexo, anexo) => {
                          const fieldKey = ATTACHMENT_FIELD_BY_TYPE[tipoAnexo];
                          if (fieldKey) updateField(fieldKey, '');
                          onAnexoRemove?.(form.id, tipoAnexo, anexo);
                        }}
                        onAttachmentError={onAnexoError}
                      />
                    ))}
                  </div>
                </section>
                {group === FIELD_GROUPS[0] ? (
                  <>
                    <SociosEmpresaSection
                      socios={form._socios ?? []}
                      disabled={!canEditFieldForClient('nome_identificacao')}
                      onChange={updateSocios}
                    />
                    {form.id ? (
                      <ContratosSociaisClienteSection
                        cliente={form}
                        compact
                        disabled={!canManageContratosSociais}
                        onSuccess={(contrato) => onContratoSocialSuccess?.(contrato?.cliente_id || form.id, contrato, form.id)}
                        onError={onAnexoError}
                      />
                    ) : null}
                  </>
                ) : null}
              </Fragment>
            );
          })}
        </div>

        <div className="modal-footer sticky bottom-0 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">
            Cancelar
          </button>
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-black text-white">
            <Save size={16} aria-hidden="true" />
            Salvar cliente
          </button>
        </div>
      </form>
    </div>
  );
}

function SociosEmpresaSection({ socios, disabled = false, onChange }) {
  const [draft, setDraft] = useState({ nome: '', cpf: '' });
  const [error, setError] = useState('');
  const normalizedSocios = normalizeSociosClienteInput(socios);
  const [listOpen, setListOpen] = useState(() => normalizedSocios.length > 0);

  useEffect(() => {
    if (normalizedSocios.length > 0) {
      setListOpen(true);
    }
  }, [normalizedSocios.length]);

  function addSocio() {
    const nome = String(draft.nome ?? '').trim();
    const cpf = normalizeCpfDigits(draft.cpf);
    if (!nome || !cpf) {
      setError('Informe nome e CPF/CNPJ para adicionar o sócio.');
      return;
    }
    if (!isCpfCnpjDigitsValid(cpf)) {
      setError('CPF/CNPJ deve ter 11 ou 14 dígitos.');
      return;
    }
    if (normalizedSocios.some((socio) => socio.cpf === cpf)) {
      setError('Este CPF/CNPJ já foi cadastrado para o cliente.');
      return;
    }
    onChange([...normalizedSocios, { nome, cpf }]);
    setDraft({ nome: '', cpf: '' });
    setError('');
  }

  function updateSocio(index, key, value) {
    const next = normalizedSocios.map((socio, socioIndex) => {
      if (socioIndex !== index) return socio;
      return {
        ...socio,
        [key]: key === 'cpf' ? normalizeCpfDigits(value) : value,
      };
    });
    onChange(next);
  }

  function removeSocio(index) {
    onChange(normalizedSocios.filter((_, socioIndex) => socioIndex !== index));
  }

  return (
    <section className="modal-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-black text-slate-950 dark:text-gray-100">Sócios da Empresa</h3>
        </div>
        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-black text-slate-500 dark:border-gray-700 dark:text-gray-300">
          {normalizedSocios.length} sócio(s)
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <label className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
          Nome do sócio
          <input
            value={draft.nome}
            onChange={(event) => {
              setDraft((current) => ({ ...current, nome: event.target.value }));
              setError('');
            }}
            disabled={disabled}
            placeholder="Nome completo"
            className="form-control-shell mt-1 disabled:bg-slate-100 disabled:text-slate-400"
          />
        </label>
        <label className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
          CPF/CNPJ
          <input
            value={formatCpfInput(draft.cpf)}
            onChange={(event) => {
              setDraft((current) => ({ ...current, cpf: event.target.value }));
              setError('');
            }}
            disabled={disabled}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            className="form-control-shell mt-1 disabled:bg-slate-100 disabled:text-slate-400"
          />
        </label>
        <button
          type="button"
          onClick={addSocio}
          disabled={disabled}
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar
        </button>
      </div>
      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}

      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 shadow-inner shadow-black/10 light:border-slate-200 light:bg-slate-50/80 light:shadow-none">
        <button
          type="button"
          onClick={() => setListOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left text-sm font-black text-slate-100 light:text-slate-700"
        >
          <span>Sócios cadastrados</span>
          <ChevronDown size={16} className={`transition ${listOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {listOpen && normalizedSocios.length ? (
          <div className="mt-3 space-y-2">
            {normalizedSocios.map((socio, index) => (
              <div key={`${socio.cpf || socio.nome}-${index}`} className="grid gap-2 rounded-lg border border-white/10 bg-slate-950/20 p-2 light:border-slate-200 light:bg-white md:grid-cols-[minmax(0,1fr)_200px_auto]">
                <input
                  value={socio.nome}
                  onChange={(event) => updateSocio(index, 'nome', event.target.value)}
                  disabled={disabled}
                  aria-label="Nome do sócio"
                  className="form-control-shell disabled:bg-slate-100 disabled:text-slate-400"
                />
                <input
                  value={formatCpfInput(socio.cpf)}
                  onChange={(event) => updateSocio(index, 'cpf', event.target.value)}
                  disabled={disabled}
                  aria-label="CPF/CNPJ do sócio"
                  className="form-control-shell disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => removeSocio(index)}
                  disabled={disabled}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-red-200 px-3 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Remover sócio"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {listOpen && !normalizedSocios.length ? (
          <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-gray-400">Nenhum sócio cadastrado.</p>
        ) : null}
      </div>
    </section>
  );
}

function FormField({
  field,
  value,
  listagens,
  onChange,
  disabled = false,
  disabledReason = 'Sem permissão para alterar este campo.',
  cliente,
  onAttachmentSuccess,
  onAttachmentRemove,
  onAttachmentError,
}) {
  const baseClass =
    'form-control-shell mt-1';
  const computedDisabled = disabled;
  const computedDisabledReason =
    disabled
      ? disabledReason
      : undefined;

  const label = (
    <span>
      {field.label}
      {field.required ? <span className="text-red-500"> *</span> : null}
    </span>
  );

  if (field.type === 'attachment') {
    const attachment = parseAttachment(value);
    const tipoAnexo = ATTACHMENT_TYPE_BY_FIELD[field.key];
    const anexo = tipoAnexo ? fieldValueToAnexo(value, tipoAnexo, cliente) : null;
    const canUpload = Boolean(tipoAnexo && isUuid(cliente?.id));

    return (
      <div className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
        <span>{label}</span>
        <div className={`mt-1 rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 ${disabled ? 'bg-slate-100 text-slate-400 dark:bg-gray-800/60 dark:text-gray-500' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AttachmentBadge value={value} />
            <div className="flex flex-wrap gap-2">
              {canUpload ? (
                <UploadAnexoButton
                  cliente={cliente}
                  tipoAnexo={tipoAnexo}
                  anexo={anexo}
                  disabled={disabled}
                  onSuccess={(novoAnexo) => {
                    onChange(anexoToFieldValue(novoAnexo));
                    onAttachmentSuccess?.(tipoAnexo, novoAnexo);
                  }}
                  onRemove={(anexoRemovido) => {
                    onChange('');
                    onAttachmentRemove?.(tipoAnexo, anexoRemovido ?? anexo);
                  }}
                  onError={onAttachmentError}
                  labelAnexar={field.key === 'anexo_recibo_reinf' ? 'Anexar recibo REINF' : 'Anexar'}
                  labelSubstituir={field.key === 'anexo_recibo_reinf' ? 'Substituir recibo REINF' : 'Substituir'}
                />
              ) : null}
              {attachment.has && !attachment.path && attachment.href ? (
                <button
                  type="button"
                  onClick={() => window.open(attachment.href, '_blank', 'noopener,noreferrer')}
                  disabled={disabled}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip size={14} aria-hidden="true" />
                  Visualizar link
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <input
          value={attachment.structured ? attachment.name : value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          readOnly={attachment.structured && Boolean(attachment.path)}
          title={disabled ? disabledReason : 'Informe o nome, link ou identificador do anexo.'}
          placeholder="Cole um link ou identificador do anexo"
          className={`${baseClass} disabled:bg-slate-100 disabled:text-slate-400`}
        />
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400 md:col-span-2 xl:col-span-3">
        {label}
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={`${baseClass} disabled:bg-slate-100 disabled:text-slate-400`}
        />
      </label>
    );
  }

  if (field.type === 'select' || field.type === 'yesno') {
    const options = uniqueValues([...(getOptions(listagens, field) ?? []), value]);
    const isClientStatusField = field.key === 'status';
    return (
      <label className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
        {label}
        <DropdownFilterSelect
          label=""
          value={value}
          options={options}
          onChange={onChange}
          includeBlank={!isClientStatusField}
          emptyLabel={isClientStatusField ? undefined : 'Não informado'}
          disabled={computedDisabled}
          disabledReason={computedDisabledReason}
          labelClassName="block"
          buttonClassName={`${baseClass} disabled:bg-slate-100 disabled:text-slate-400`}
        />
        {computedDisabledReason ? (
          <span className="mt-1 block text-[11px] font-semibold normal-case text-slate-400">{computedDisabledReason}</span>
        ) : null}
      </label>
    );
  }

  return (
    <label className="text-xs font-black uppercase tracking-normal text-slate-500 dark:text-gray-400">
      {label}
      <input
        value={value}
        type={field.type === 'number' ? 'number' : 'text'}
        inputMode={
          field.type === 'cnpj'
            ? 'numeric'
            : field.type === 'currency' || field.type === 'number'
              ? 'decimal'
              : undefined
        }
        maxLength={field.type === 'cnpj' ? 18 : undefined}
        placeholder={field.type === 'date' ? 'dd/mm/aaaa' : undefined}
        onChange={(event) => onChange(field.type === 'cnpj' ? formatCnpjInput(event.target.value) : event.target.value)}
        disabled={computedDisabled}
        title={computedDisabled ? computedDisabledReason : undefined}
        className={`${baseClass} disabled:bg-slate-100 disabled:text-slate-400`}
      />
      {computedDisabledReason ? (
        <span className="mt-1 block text-[11px] font-semibold normal-case text-slate-400">{computedDisabledReason}</span>
      ) : null}
    </label>
  );
}

function Toast({ toast, onClose }) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => {
      onCloseRef.current?.();
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] max-w-md">
      <SurfacePanel className="p-4 shadow-panel">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 text-emerald-600" size={19} aria-hidden="true" />
          <div className="flex-1">
            <p className="font-black text-slate-950">{toast.title}</p>
            {toast.message ? <p className="mt-1 text-sm font-semibold text-slate-600">{toast.message}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </SurfacePanel>
    </div>
  );
}

function ImportPreviewModal({ preview, busy = false, onCancel, onConfirm }) {
  if (!preview) return null;
  const summary = preview.summary ?? {};
  const errors = preview.errors ?? [];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <SurfacePanel className="w-full max-w-2xl shadow-panel">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-lg font-black text-slate-950">Pré-visualização da importação</p>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Arquivo: {preview.fileName} | Linhas lidas: {formatNumber(summary.totalLinhasLidas ?? 0)}
          </p>
        </div>

        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-normal text-slate-500">Clientes criados</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">{formatNumber(summary.criados ?? 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-normal text-slate-500">Clientes atualizados</p>
            <p className="mt-1 text-2xl font-black text-brand-blue">{formatNumber(summary.atualizados ?? 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-normal text-slate-500">Ignorados</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{formatNumber(summary.ignorados ?? 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-normal text-slate-500">Erros</p>
            <p className="mt-1 text-2xl font-black text-red-700">{formatNumber(summary.erros ?? 0)}</p>
          </div>
        </div>

        {errors.length ? (
          <div className="px-5 pb-2">
            <AlertBanner tone="danger">{errors[0]}</AlertBanner>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !!errors.length}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-black text-white disabled:opacity-60"
          >
            <Upload size={15} aria-hidden="true" />
            {busy ? 'Importando...' : 'Confirmar importação'}
          </button>
        </div>
      </SurfacePanel>
    </div>
  );
}

export default function App() {
  const initialState = useMemo(loadInitialState, []);
  const initialSecurityState = useMemo(loadSecurityState, []);
  const initialSessionState = useMemo(loadInitialSessionState, []);
  const [clients, setClients] = useState(initialState.clientes);
  const [listagens, setListagens] = useState(initialState.listagens);
  const [responsavelCatalogo, setResponsavelCatalogo] = useState([]);
  const [responsavelCatalogoBusy, setResponsavelCatalogoBusy] = useState(false);
  const [metadata, setMetadata] = useState(initialState.metadata ?? { ...INITIAL_METADATA });
  const [security, setSecurity] = useState(initialSecurityState);
  const [session, setSession] = useState(initialSessionState.session);
  const [authView, setAuthView] = useState(() => (shouldOpenResetViewFromUrl() ? 'reset' : 'login'));
  const [page, setPage] = useState('dashboard');
  const [reinfSearchContext, setReinfSearchContext] = useState(null);
  const [ecdSearchContext, setEcdSearchContext] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [quickFilterLabel, setQuickFilterLabel] = useState('');
  const [sort, setSort] = useState({ key: 'nome_identificacao', direction: 'asc' });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [supabaseStatus, setSupabaseStatus] = useState(() => (
    initialState.hasBootstrapCache
      ? { connected: false, message: 'Sincronizando dados...' }
      : { connected: false, message: 'Aguardando carga do Supabase' }
  ));
  const [supabaseRefreshing, setSupabaseRefreshing] = useState(false);
  const [supabaseBootstrapping, setSupabaseBootstrapping] = useState(
    () => Boolean(initialSessionState.session?.auth_user_id),
  );
  const [initialPortalReady, setInitialPortalReady] = useState(
    () => initialState.hasBootstrapCache || !initialSessionState.session?.auth_user_id,
  );
  const [historicoCliente, setHistoricoCliente] = useState([]);
  const [historicoClienteLoading, setHistoricoClienteLoading] = useState(false);
  const [reinfRelatorios, setReinfRelatorios] = useState([]);
  const [sessionProfile, setSessionProfile] = useState(initialSessionState.sessionProfile);
  const [authReady, setAuthReady] = useState(initialSessionState.authReady);
  const [authRestoring, setAuthRestoring] = useState(
    () => Boolean(initialSessionState.session?.auth_user_id),
  );
  const importInputRef = useRef(null);
  const currentUserFullRef = useRef(null);
  const logoutIntentRef = useRef(false);
  const hasStoredSession = Boolean(session?.usuario_id && session?.auth_user_id);
  const hasCachedSessionProfile = Boolean(
    session?.usuario_id
    && session?.auth_user_id
    && sessionProfile?.id === session.usuario_id
    && sessionProfile?.auth_user_id === session.auth_user_id,
  );
  const canReuseBootstrapCache = Boolean(initialState.hasBootstrapCache && hasCachedSessionProfile);

  const currentUserFull = useMemo(() => {
    if (!session?.usuario_id) return null;
    const user = security.usuarios.find((item) => item.id === session.usuario_id)
      || (sessionProfile?.id === session.usuario_id ? sessionProfile : null);
    if (!user || user.status !== 'Ativo') return null;
    if (session?.auth_user_id && user?.auth_user_id && session.auth_user_id !== user.auth_user_id) return null;
    return user;
  }, [security.usuarios, session, sessionProfile]);
  const shouldHoldAuthenticatedEntry = hasStoredSession && !currentUserFull;

  function canReuseCachedAuthenticatedSession(authSession = null) {
    if (!hasStoredSession || !canReuseBootstrapCache || !session?.auth_user_id) return false;
    const incomingAuthUserId = authSession?.user?.id ?? null;
    if (incomingAuthUserId && incomingAuthUserId !== session.auth_user_id) return false;
    return true;
  }

  const currentUser = useMemo(() => sanitizeUser(currentUserFull), [currentUserFull]);
  const showRestoreUi = useDelayedFlag(
    Boolean(hasStoredSession && authRestoring),
    AUTH_RESTORE_VISUAL_DELAY_MS,
  );
  const isSupabaseChecking = authRestoring || supabaseBootstrapping || supabaseRefreshing;
  const showConnectionWarningUi = useDelayedFlag(
    !supabaseStatus.connected && !isSupabaseChecking,
    CONNECTION_WARNING_VISUAL_DELAY_MS,
  );
  const canWritePortalData = supabaseStatus.connected && !authRestoring;
  const writeBlockedReason = authRestoring
    ? 'Sessão em restauração. As consultas continuam disponíveis, mas gravações ficam bloqueadas até a reconexão completa.'
    : !supabaseStatus.connected
      ? 'Supabase indisponível no momento. O portal está em modo protegido com leitura da última sincronização e gravações bloqueadas até a reconexão.'
      : '';
  const authGateLabel = showRestoreUi ? 'Restaurando sessão...' : 'Validando sessão...';
  const portalGateLabel = !supabaseBootstrapping && !supabaseStatus.connected
    ? 'Não foi possível carregar os dados do portal. Verifique a conexão e tente entrar novamente.'
    : 'Carregando dados do portal...';
  const supabaseStatusLabel = authRestoring && currentUserFull
    ? 'Sessão em restauração...'
    : !supabaseStatus.connected && (isSupabaseChecking || !showConnectionWarningUi)
      ? 'Verificando conexão com o Supabase...'
      : getSupabaseStatusDisplay(supabaseStatus, metadata);
  const supabaseStatusTone = authRestoring && currentUserFull
    ? 'info'
    : !supabaseStatus.connected && (isSupabaseChecking || !showConnectionWarningUi)
      ? 'info'
      : supabaseStatus.connected
        ? 'success'
        : 'warning';
  const writeBlockedMessage = !isSupabaseChecking && showConnectionWarningUi ? writeBlockedReason : '';

  const enrichedClients = useMemo(() => {
    const allClients = enrichClients(clients);
    if (!currentUserFull) return [];
    return allClients.filter((client) => canViewClient(currentUserFull, client));
  }, [clients, currentUserFull]);

  const activeClients = useMemo(() => getActiveClients(enrichedClients), [enrichedClients]);

  const filteredClients = useMemo(() => {
    const filtered = filterClients(enrichedClients, filters);
    return sortByLocale(filtered, sort.key, sort.direction);
  }, [enrichedClients, filters, sort]);

  const filteredActiveClients = useMemo(() => {
    const filtered = filterClients(activeClients, { ...filters, arquivamento: 'todos' });
    return sortByLocale(filtered, sort.key, sort.direction);
  }, [activeClients, filters, sort]);

  const selectedClient = useMemo(
    () => enrichedClients.find((client) => client.id === selectedClientId),
    [enrichedClients, selectedClientId],
  );

  useEffect(() => {
    if (page !== 'detalhe') return;
    carregarHistoricoCliente(selectedClientId);
  }, [page, selectedClientId]);

  useEffect(() => {
    currentUserFullRef.current = currentUserFull;
  }, [currentUserFull]);

  useEffect(() => {
    let cancelled = false;

    if (!currentUserFull || currentUserFull.precisa_trocar_senha || !authReady || authRestoring) {
      if (!currentUserFull && !hasStoredSession) {
        setSupabaseBootstrapping(false);
        setInitialPortalReady(true);
      }
      return undefined;
    }

    if (!clients.length && !metadata?.importedAt && !metadata?.generatedAt) {
      setInitialPortalReady(false);
    }
    setSupabaseBootstrapping(true);
    void carregarDadosSupabase({ silent: true })
      .then((ok) => {
        if (cancelled) return;
        setSupabaseBootstrapping(false);
        setInitialPortalReady(Boolean(ok || clients.length));
      })
      .catch(() => {
        if (cancelled) return;
        setSupabaseBootstrapping(false);
        setInitialPortalReady(Boolean(clients.length));
      });

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    authRestoring,
    currentUserFull?.auth_user_id,
    currentUserFull?.id,
    currentUserFull?.precisa_trocar_senha,
    hasStoredSession,
  ]);

  function ensureSupabaseWriteReady(actionLabel = 'realizar esta gravação') {
    if (canWritePortalData) return true;
    setToast({
      title: 'Gravação bloqueada',
      message: writeBlockedReason || `Não foi possível ${actionLabel} porque o portal ainda não está pronto para gravar no Supabase.`,
    });
    return false;
  }

  useEffect(() => {
    if (currentUserFull) {
      setAuthRestoring(false);
      return;
    }
    if (!hasStoredSession) {
      setAuthRestoring(false);
    }
  }, [currentUserFull, hasStoredSession]);

  useEffect(() => {
    let active = true;

    async function bootstrapAuth() {
      if (hasStoredSession) {
        setAuthRestoring(true);
      }
      try {
        const authSession = hasStoredSession
          ? await resolveBootstrapAuthSession(session?.auth_user_id)
          : await getAuthSessionSupabase();
        const perfil = await withTimeout(
          recuperarPerfilSessaoSupabase({
            preferredAuthUserId: session?.auth_user_id,
            authSession,
          }),
          getAuthBootstrapTimeoutMs(hasStoredSession),
          'A validação da sessão demorou mais do que o esperado.',
        );
        if (!active) return;

        if (perfil) {
          startSession(perfil);
          setAuthRestoring(false);
          if (!shouldOpenResetViewFromUrl()) setAuthView('login');
        } else if (canReuseCachedAuthenticatedSession(authSession)) {
          setAuthRestoring(false);
          setAuthReady(true);
        } else {
          setAuthRestoring(false);
          setSessionProfile(null);
          clearSession();
          setSession(null);
          if (!shouldOpenResetViewFromUrl()) {
            setAuthView('login');
          }
        }
      } catch (error) {
        if (!active) return;
        if (isAuthTimeoutError(error) && hasStoredSession) {
          void recuperarPerfilSessaoSupabase({ preferredAuthUserId: session?.auth_user_id })
            .then((perfil) => {
              if (!active) return;
              if (perfil) {
                startSession(perfil);
              } else {
                setAuthRestoring(false);
              }
            })
            .catch(() => {
              if (!active) return;
              setAuthRestoring(false);
            })
            .finally(() => {
              if (active) setAuthRestoring(false);
            });
          return;
        }
        if (hasStoredSession) {
          const authSession = await resolveBootstrapAuthSession(session?.auth_user_id);
          if (canReuseCachedAuthenticatedSession(authSession)) {
            setAuthRestoring(false);
            setAuthReady(true);
            return;
          }
        }
        setAuthRestoring(false);
        setSessionProfile(null);
        clearSession();
        setSession(null);
        setAuthView('login');
        if (!isAuthTimeoutError(error)) {
          setToast({
            title: 'Falha ao validar sessão',
            message: error.message || 'Não foi possível validar a sessão atual no Supabase.',
          });
        }
      } finally {
        if (active) setAuthReady(true);
      }
    }

    bootstrapAuth();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (!active) return;

      const hasKnownPortalSession =
        Boolean(currentUserFullRef.current?.auth_user_id)
        || canReuseCachedAuthenticatedSession(authSession);
      const shouldPreserveSession =
        event !== 'SIGNED_OUT' && (Boolean(currentUserFullRef.current?.auth_user_id) || canReuseCachedAuthenticatedSession(authSession));
      const currentAuthUserId = currentUserFullRef.current?.auth_user_id ?? session?.auth_user_id ?? null;
      const incomingAuthUserId = authSession?.user?.id ?? null;
      const shouldRunVisibleRestore =
        event === 'SIGNED_IN'
        && shouldPreserveSession
        && (!currentUserFullRef.current || !currentAuthUserId || currentAuthUserId !== incomingAuthUserId);

      if (event === 'SIGNED_OUT') {
        if (!logoutIntentRef.current && hasKnownPortalSession) {
          setAuthRestoring(true);
          try {
            await wait(TRANSIENT_SIGNED_OUT_GRACE_MS);
            if (!active) return;
            const recoveredSession = await resolveBootstrapAuthSession(currentAuthUserId);
            if (recoveredSession?.user?.id) {
              const perfil = await recuperarPerfilSessaoSupabase({
                preferredAuthUserId: recoveredSession.user.id,
                authSession: recoveredSession,
              });
              if (!active) return;
              if (perfil) {
                startSession(perfil);
                setAuthRestoring(false);
                setAuthReady(true);
                return;
              }
            }
          } catch {
            // segue para logout definitivo abaixo quando a sessao nao reaparece
          }
        }
        logoutIntentRef.current = false;
        setAuthRestoring(false);
        setSessionProfile(null);
        clearSession();
        setSession(null);
        setAuthView('login');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        logoutIntentRef.current = false;
        if (shouldRunVisibleRestore) {
          setAuthRestoring(true);
        }
        try {
          const perfil = await withTimeout(
            recuperarPerfilSessaoSupabase({
              preferredAuthUserId: authSession?.user?.id ?? session?.auth_user_id,
              authSession,
            }),
            getAuthBootstrapTimeoutMs(hasStoredSession),
            'A atualização da sessão demorou mais do que o esperado.',
          );
          if (!active) return;
          if (perfil) {
            startSession(perfil);
            setAuthRestoring(false);
          } else {
            if (shouldPreserveSession) {
              setAuthRestoring(false);
              setAuthReady(true);
              return;
            }
            setAuthRestoring(false);
            setSessionProfile(null);
            clearSession();
            setSession(null);
            setAuthView('login');
          }
        } catch {
          if (!active) return;
          if (shouldPreserveSession) {
            setAuthRestoring(false);
            setAuthReady(true);
            return;
          }
          setAuthRestoring(false);
          setSessionProfile(null);
          clearSession();
          setSession(null);
          setAuthView('login');
        }
      }
    });

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [hasCachedSessionProfile, hasStoredSession, session?.auth_user_id]);

  useEffect(() => {
    if (authView !== 'reset') return;
    prepararSessaoRecuperacaoSenha()
      .then((session) => {
        if (!session) {
          setToast({
            title: 'Sessão de recuperação ausente',
            message: 'Abra novamente o link recebido por e-mail para redefinir a senha.',
          });
        }
      })
      .catch((error) => {
        setToast({
          title: 'Falha no link de recuperação',
          message: error.message || 'Não foi possível validar o link de redefinição.',
        });
      });
  }, [authView]);

  function persist(nextClients, nextListagens = listagens, nextMetadata = metadata) {
    const normalizedClients = nextClients.map(withClientDefaults);
    const normalizedListagens = mergeListagensFromClients(nextListagens, normalizedClients);
    setClients(normalizedClients);
    setListagens(normalizedListagens);
    setMetadata(nextMetadata);
    saveBootstrapCache({
      clientes: normalizedClients,
      listagens: normalizedListagens,
      metadata: nextMetadata,
    });
  }

  function updateClientsPersisted(updater, nextMetadata = metadata) {
    const nextClients =
      typeof updater === 'function'
        ? updater(clients)
        : updater;
    persist(nextClients, listagens, nextMetadata);
  }

  function persistSecurity(nextSecurityOrUpdater) {
    setSecurity((current) =>
      typeof nextSecurityOrUpdater === 'function'
        ? nextSecurityOrUpdater(current)
        : nextSecurityOrUpdater,
    );
  }

  function atualizarResponsavelCatalogoLocal(item) {
    if (!item?.id) return;
    setResponsavelCatalogo((current) => {
      const exists = current.some((row) => row.id === item.id);
      const nextCatalogo = exists
        ? current.map((row) => (row.id === item.id ? item : row))
        : [...current, item];
      setListagens((currentListagens) => ({
        ...currentListagens,
        responsavel: getResponsaveisAtivosCatalogo(nextCatalogo),
      }));
      return nextCatalogo;
    });
  }

  function sincronizarPerfilUsuario(perfil) {
    if (!perfil?.id) return;
    setSessionProfile((current) => ({
      ...current,
      ...perfil,
    }));
    persistSecurity((current) => {
      const existentes = current.usuarios ?? [];
      const idx = existentes.findIndex((item) => item.id === perfil.id);
      const base = idx >= 0 ? existentes[idx] : {};
      const atualizado = {
        ...base,
        id: perfil.id,
        auth_user_id: perfil.auth_user_id ?? base.auth_user_id ?? null,
        nome: perfil.nome ?? base.nome ?? '',
        email: perfil.email ?? base.email ?? '',
        cargo: perfil.cargo ?? base.cargo ?? '',
        setor: perfil.setor ?? base.setor ?? '',
        perfil_acesso: perfil.perfil_acesso ?? base.perfil_acesso ?? '',
        status: perfil.status ?? base.status ?? 'Ativo',
        ultimo_acesso: perfil.ultimo_acesso ?? base.ultimo_acesso ?? '',
        precisa_trocar_senha: Boolean(perfil.precisa_trocar_senha ?? base.precisa_trocar_senha),
        tentativas_invalidas: Number(perfil.tentativas_invalidas ?? base.tentativas_invalidas ?? 0),
        bloqueado_ate: perfil.bloqueado_ate ?? base.bloqueado_ate ?? '',
        criado_em: perfil.criado_em ?? base.criado_em ?? todayBr(),
        atualizado_em: perfil.atualizado_em ?? base.atualizado_em ?? todayBr(),
        assinatura_email_path: perfil.assinatura_email_path ?? base.assinatura_email_path ?? '',
        assinatura_email_nome_arquivo: perfil.assinatura_email_nome_arquivo ?? base.assinatura_email_nome_arquivo ?? '',
        assinatura_email_atualizada_em: perfil.assinatura_email_atualizada_em ?? base.assinatura_email_atualizada_em ?? '',
      };
      const usuarios =
        idx >= 0
          ? existentes.map((item, index) => (index === idx ? atualizado : item))
          : [atualizado, ...existentes];
      return { ...current, usuarios };
    });
  }

  function sincronizarUsuariosSupabase(usuariosSupabase) {
    if (!Array.isArray(usuariosSupabase) || !usuariosSupabase.length) return;
    const usuarioSessao = usuariosSupabase.find((item) => item.id === session?.usuario_id);
    if (usuarioSessao) {
      setSessionProfile(usuarioSessao);
    }
    persistSecurity((current) => ({
      ...current,
      usuarios: usuariosSupabase,
    }));
  }

  function sincronizarHistoricoSupabase(historicoSupabase) {
    if (!Array.isArray(historicoSupabase)) return;
    persistSecurity((current) => ({
      ...current,
      historico_alteracoes: historicoSupabase,
    }));
  }

  async function recuperarPerfilSessaoSupabase({ preferredAuthUserId, authSession } = {}) {
    const candidateIds = [];
    if (preferredAuthUserId) candidateIds.push(preferredAuthUserId);

    const sessionAtual = authSession ?? await getAuthSessionSupabase();
    const sessionAuthUserId = sessionAtual?.user?.id;
    if (sessionAuthUserId) candidateIds.push(sessionAuthUserId);

    if (!candidateIds.length) {
      const authUser = await getAuthUserSupabase();
      if (authUser?.id) candidateIds.push(authUser.id);
    }

    const uniqueCandidateIds = [...new Set(candidateIds.filter(Boolean))];
    for (const authUserId of uniqueCandidateIds) {
      const perfil = await getPerfilByAuthUserIdWithRetry(authUserId, {
        attempts: 3,
        delayMs: 250,
      });
      if (!perfil) continue;
      if (perfil.status !== 'Ativo') return null;
      if (perfil.bloqueado_ate && new Date(perfil.bloqueado_ate).getTime() > Date.now()) return null;

      sincronizarPerfilUsuario(perfil);
      return perfil;
    }

    return null;
  }

  async function carregarDadosSupabase({ silent = true } = {}) {
    try {
      const cachedAttachmentSnapshot = buildAttachmentFieldSnapshot(clients);
      const shouldLoadUsuariosPortal =
        can(currentUserFull, PERMISSIONS.USERS_MANAGE)
        || can(currentUserFull, PERMISSIONS.HISTORY_VIEW);
      const shouldLoadHistoricoPortal = can(currentUserFull, PERMISSIONS.HISTORY_VIEW);
      const shouldLoadReinfRelatorios = can(currentUserFull, PERMISSIONS.REPORTS_VIEW);

      const [clientesSupabase, listagensSupabase, sociosResult, responsaveisResult, obrigacoesResult, riscoResult, acompanhamentoResult, usuariosResult, historicoResult, reinfRelatoriosResult] = await Promise.all([
        listarClientesSupabase({ incluirArquivados: true }),
        listarListagensAgrupadas(),
        listarSociosClientesSupabase()
          .then((rows) => ({ ok: true, rows }))
          .catch((error) => ({ ok: false, error })),
        listarValoresListagemPorCategoria('responsavel', { incluirInativos: true })
          .then((rows) => ({ ok: true, rows }))
          .catch((error) => ({ ok: false, error })),
        listarStatusObrigacoesClientes()
          .then((rows) => ({ ok: true, rows }))
          .catch((error) => ({ ok: false, error })),
        listarRiscoOperacionalClientes()
          .then((rows) => ({ ok: true, rows }))
          .catch((error) => ({ ok: false, error })),
        listarAcompanhamentoOperacionalClientes()
          .then((rows) => ({ ok: true, rows }))
          .catch((error) => ({ ok: false, error })),
        shouldLoadUsuariosPortal
          ? listarUsuariosPortal()
            .then((rows) => ({ ok: true, rows, skipped: false }))
            .catch((error) => ({ ok: false, error, skipped: false }))
          : Promise.resolve({ ok: true, rows: [], skipped: true }),
        shouldLoadHistoricoPortal
          ? listarHistoricoPortalSupabase()
            .then((rows) => ({ ok: true, rows, skipped: false }))
            .catch((error) => ({ ok: false, error, skipped: false }))
          : Promise.resolve({ ok: true, rows: [], skipped: true }),
        shouldLoadReinfRelatorios
          ? listarReinfRelatoriosSupabase()
            .then((rows) => ({ ok: true, rows, skipped: false }))
            .catch((error) => ({ ok: false, error, skipped: false }))
          : Promise.resolve({ ok: true, rows: [], skipped: true }),
      ]);
      const clientesHydrated = await hydrateClientesComAnexos(clientesSupabase, cachedAttachmentSnapshot);
      const clientesComContratosSociais = await hydrateClientesComContratosSociais(clientesHydrated);
      const obrigacoesIndex = obrigacoesResult.ok ? indexarStatusObrigacoes(obrigacoesResult.rows) : {};
      const clientesComObrigacoes = hydrateClientesComObrigacoes(clientesComContratosSociais, obrigacoesIndex);
      const riscoIndex = riscoResult.ok ? indexarRiscoOperacional(riscoResult.rows) : {};
      const clientesComRisco = hydrateClientesComRiscoOperacional(clientesComObrigacoes, riscoIndex);
      const acompanhamentoIndex = acompanhamentoResult.ok ? indexarAcompanhamentoOperacional(acompanhamentoResult.rows) : {};
      const clientesComAcompanhamento = hydrateClientesComAcompanhamentoOperacional(clientesComRisco, acompanhamentoIndex);
      const sociosIndex = sociosResult.ok ? indexarSociosClientes(sociosResult.rows) : {};
      const clientesComSocios = hydrateClientesComSocios(clientesComAcompanhamento, sociosIndex);
      const latestUpdatedAt = getLatestClienteAtualizadoEm(clientesComSocios);

      const nextListagens = mergeListagensFromClients(
        mergeListagensFromSupabase(createRuntimeListBase(), listagensSupabase),
        clientesComSocios,
      );
      if (responsaveisResult.ok) {
        setResponsavelCatalogo(responsaveisResult.rows);
        const responsaveisAtivos = getResponsaveisAtivosCatalogo(responsaveisResult.rows);
        if (responsaveisResult.rows.length) {
          nextListagens.responsavel = responsaveisAtivos;
        }
      } else {
        console.warn('[listagens] Falha ao carregar responsaveis do Supabase:', responsaveisResult.error);
      }
      persist(clientesComSocios, nextListagens, {
        ...metadata,
        source: 'Supabase',
        importedAt: latestUpdatedAt ? formatDateTime(latestUpdatedAt) : (metadata?.importedAt || todayBr()),
      });
      if (usuariosResult.ok && !usuariosResult.skipped) {
        sincronizarUsuariosSupabase(usuariosResult.rows);
      } else if (!usuariosResult.ok) {
        console.warn('[usuarios] Falha ao carregar usuarios do Supabase:', usuariosResult.error);
      }
      if (historicoResult.ok && !historicoResult.skipped) {
        sincronizarHistoricoSupabase(historicoResult.rows);
      } else if (!historicoResult.ok) {
        console.warn('[historico] Falha ao carregar historico geral do Supabase:', historicoResult.error);
      }
      if (reinfRelatoriosResult.ok && !reinfRelatoriosResult.skipped) {
        setReinfRelatorios(reinfRelatoriosResult.rows);
      } else if (!reinfRelatoriosResult.ok) {
        console.warn('[reinf_relatorios] Falha ao carregar relatorios REINF:', reinfRelatoriosResult.error);
      }
      setSupabaseStatus({
        connected: true,
        message: `Conectado ao Supabase (${formatNumber(clientesComSocios.length)} cliente(s))`,
      });
      if (!sociosResult.ok) {
        console.warn('[clientes_socios] Falha ao carregar socios dos clientes:', sociosResult.error);
      }
      if (!obrigacoesResult.ok) {
        console.warn('[obrigacoes] Falha ao carregar view persistente de obrigacoes:', obrigacoesResult.error);
      }
      if (!riscoResult.ok) {
        console.warn('[risco_operacional] Falha ao carregar view persistente de risco operacional:', riscoResult.error);
      }
      if (!acompanhamentoResult.ok) {
        console.warn('[acompanhamento_operacional] Falha ao carregar view persistente de acompanhamento operacional:', acompanhamentoResult.error);
      }
      if (!silent) {
        setToast({
          title: 'Dados atualizados',
          message: 'Dashboard e Base de Clientes atualizados com dados do Supabase.',
        });
      }
      return true;
    } catch (error) {
      const hasCurrentClients = Array.isArray(clients) && clients.length > 0;
      if (!hasCurrentClients) {
        persist([], createRuntimeListBase(), {
          ...metadata,
          source: 'Supabase indisponível',
          importedAt: metadata?.importedAt || '',
        });
      } else {
        persist(clients, listagens, {
          ...metadata,
          source: 'Cache local da última sincronização',
          importedAt: metadata?.importedAt || metadata?.generatedAt || '',
        });
      }
      setSupabaseStatus({
        connected: false,
        message: hasCurrentClients
          ? 'Modo protegido | leitura local da última sincronização'
          : 'Supabase indisponível | sem leitura local confirmada',
      });
      if (!silent) {
        setToast({
          title: 'Falha na conexão',
          message: 'Não foi possível carregar os clientes do Supabase. Verifique as variáveis de ambiente e a estrutura do banco.',
        });
      }
      return false;
    }
  }

  async function refreshSupabaseData() {
    setSupabaseRefreshing(true);
    try {
      await carregarDadosSupabase({ silent: false });
    } finally {
      setSupabaseRefreshing(false);
    }
  }

  async function resyncSupabaseAfterMutation(context = 'atualização') {
    const ok = await carregarDadosSupabase({ silent: true });
    if (!ok) {
      console.warn(`[supabase] Falha ao reidratar dados após ${context}.`);
    }
    return ok;
  }

  function startSession(perfil) {
    if (!perfil?.id || !perfil?.auth_user_id) return;
    const profileSnapshot = normalizeSessionProfileSnapshot(perfil);
    setInitialPortalReady(Boolean(clients.length));
    setSessionProfile(profileSnapshot);
    const nextSession = {
      usuario_id: perfil.id,
      auth_user_id: perfil.auth_user_id,
      email: perfil.email ?? '',
      profile: profileSnapshot,
      inicio: Date.now(),
      ultima_atividade: Date.now(),
    };
    setSession(nextSession);
    saveSession(nextSession);
  }

  function logout(message) {
    logoutIntentRef.current = true;
    logoutSupabase().catch(() => {});
    setAuthRestoring(false);
    setSessionProfile(null);
    clearSession();
    setSession(null);
    setAuthView('login');
    setPage('dashboard');
    if (message) setToast({ title: 'Sessão encerrada', message });
  }

  async function createFirstAccessPassword(email) {
    try {
      await enviarResetSenhaSupabase(email);
      return { ok: true };
    } catch (error) {
      return { ok: false, errors: [error.message || 'Falha ao enviar link de criação de senha.'] };
    }
  }

  async function login(email, senha) {
    const emailNorm = String(email ?? '').trim().toLowerCase();

    const auth = await loginSupabase(emailNorm, senha);
    if (!auth.ok || !auth.authUser) {
      return { ok: false, message: auth.message ?? 'Falha ao autenticar no Supabase.' };
    }

    let perfil = null;
    try {
      const authSession =
        auth.authSession?.user?.id === auth.authUser.id
          ? auth.authSession
          : await waitForAuthSessionUser(auth.authUser.id, {
            timeoutMs: 3500,
            intervalMs: 150,
          });

      perfil = await recuperarPerfilSessaoSupabase({
        preferredAuthUserId: auth.authUser.id,
        authSession,
      });
    } catch (error) {
      await logoutSupabase().catch(() => {});
      return { ok: false, message: `Falha ao validar perfil no banco: ${error.message}` };
    }

    if (!perfil) {
      await logoutSupabase().catch(() => {});
      return { ok: false, message: 'Usuário autenticado, mas sem perfil vinculado no portal. Verifique o cadastro do usuário e tente novamente.' };
    }

    if (perfil.status !== 'Ativo') {
      await logoutSupabase().catch(() => {});
      return { ok: false, message: 'Usuário inativo. Solicite reativação ao Coordenador.' };
    }

    if (perfil.bloqueado_ate && new Date(perfil.bloqueado_ate).getTime() > Date.now()) {
      await logoutSupabase().catch(() => {});
      return { ok: false, message: `Usuário bloqueado temporariamente até ${formatDateTime(perfil.bloqueado_ate)}.` };
    }

    sincronizarPerfilUsuario(perfil);
    startSession(perfil);
    setPage('dashboard');
    updateUltimoAcessoUsuario(perfil.id).catch(() => {});
    return { ok: true };
  }

  async function requestPasswordReset(email) {
    try {
      await enviarResetSenhaSupabase(email);
    } catch {
      // Mensagem generica por seguranca.
    }
  }

  async function resetPassword(senha, confirmar) {
    const validationErrors = senha === confirmar ? validatePassword(senha, currentUserFull ?? { email: '' }) : ['As senhas não conferem.'];
    if (validationErrors.length) return { ok: false, errors: validationErrors };

    try {
      const recoverySession = await prepararSessaoRecuperacaoSenha();
      if (!recoverySession) {
        return {
          ok: false,
          errors: ['Sessão de autenticação faltando. Abra novamente o link de redefinição recebido por e-mail.'],
        };
      }
      await atualizarSenhaUsuarioLogado(senha);
      if (recoverySession?.user?.id) {
        const perfil = await buscarPerfilPorAuthUserId(recoverySession.user.id);
        if (perfil?.id) {
          const atualizado = await limparTrocaSenhaObrigatoriaUsuario(perfil.id);
          sincronizarPerfilUsuario(atualizado);
        }
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, errors: [error.message || 'Não foi possível redefinir a senha no Supabase.'] };
    }
  }

  async function changeRequiredPassword(senhaAtual, novaSenha, confirmar) {
    if (!currentUserFull) return { ok: false, errors: ['Sessão expirada.'] };
    const auth = await loginSupabase(currentUserFull.email, senhaAtual);
    if (!auth.ok) return { ok: false, errors: ['Senha atual incorreta.'] };
    const errorsSupabase = novaSenha === confirmar ? validatePassword(novaSenha, currentUserFull) : ['As senhas não conferem.'];
    if (errorsSupabase.length) return { ok: false, errors: errorsSupabase };
    try {
      await atualizarSenhaUsuarioLogado(novaSenha);
      const atualizado = await limparTrocaSenhaObrigatoriaUsuario(currentUserFull.id);
      sincronizarPerfilUsuario(atualizado);
      setToast({ title: 'Senha alterada', message: 'Acesso liberado ao portal.' });
      return { ok: true };
    } catch (error) {
      return { ok: false, errors: [error.message || 'Não foi possível alterar a senha.'] };
    }
  }

  function openClient(id) {
    setSelectedClientId(id);
    setPage('detalhe');
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setQuickFilterLabel('');
  }

  function applyPreset(filter, label) {
    setFilters({ ...DEFAULT_FILTERS, ...filter });
    setQuickFilterLabel(label);
    setPage('clientes');
  }

  async function registrarHistoricoPersistente({
    clienteId,
    valoresAntigos,
    valoresNovos,
    tipoAcao,
    origem,
    notifyOnError = false,
  }) {
    if (!currentUserFull?.id || !clienteId) {
      return { ok: false, skipped: true };
    }
    try {
      const result = await registrarHistoricoAlteracoesSupabase(
        clienteId,
        valoresAntigos ?? {},
        valoresNovos ?? {},
        currentUserFull,
        tipoAcao,
        origem,
      );
      return result ?? { ok: true };
    } catch (error) {
      console.warn('[historico] Falha ao registrar alteração persistente:', error);
      if (notifyOnError) {
        setToast({
          title: 'Histórico não confirmado',
          message: 'A alteração principal foi salva, mas o histórico dessa ação não conseguiu ser persistido agora.',
        });
      }
      return { ok: false, error };
    }
  }

  async function carregarHistoricoCliente(clienteId) {
    if (!clienteId || !isUuid(clienteId)) {
      setHistoricoCliente([]);
      return;
    }
    setHistoricoClienteLoading(true);
    try {
      const rows = await listarHistoricoPorClienteSupabase(clienteId);
      setHistoricoCliente(rows);
    } catch (error) {
      console.warn('[historico] Falha ao carregar historico persistente:', error);
      setHistoricoCliente([]);
    } finally {
      setHistoricoClienteLoading(false);
    }
  }

  async function recarregarHistoricoClienteAtivo(clienteId) {
    if (page !== 'detalhe' || selectedClientId !== clienteId) return;
    await carregarHistoricoCliente(clienteId);
  }

  async function saveClient(client) {
    if (!currentUserFull) return;
    if (!ensureSupabaseWriteReady(client?.id ? 'salvar o cliente' : 'criar o cliente')) return;
    const sociosPayload = normalizeSociosClienteInput(client?._socios ?? []);
    const sociosDirty = Boolean(client?._sociosDirty);
    const { _socios, _sociosDirty, ...clientSemSocios } = client;
    client = clientSemSocios;
    client = { ...client, ...applyResponsavelEcdFallback(client, client) };
    const key = normalizeCnpj(client.cnpj) || client.id;
    const nextClients = [...clients];
    const index = nextClients.findIndex((item) => (normalizeCnpj(item.cnpj) || item.id) === key || item.id === client.id);
    const previous = index >= 0 ? nextClients[index] : null;
    const origemEdicao = page === 'detalhe' ? 'Detalhe do Cliente' : 'Base de Clientes';
    let previousForHistory = previous;
    let syncedWithSupabase = false;
    if (previous && !canEditClient(currentUserFull, previous)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode editar este cliente.' });
      return;
    }
    if (!previous && !can(currentUserFull, PERMISSIONS.CLIENTS_CREATE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode cadastrar clientes.' });
      return;
    }

    const mutationTimestamp = new Date().toISOString();
    let nextClient = { ...client, atualizado_em: mutationTimestamp };
    if (previous) {
      EDITABLE_FIELDS.forEach((field) => {
        if (!canEditClientField(currentUserFull, field.key)) {
          nextClient[field.key] = previous[field.key] ?? '';
        }
      });
    } else {
      nextClient = { ...nextClient, criado_em: mutationTimestamp };
    }
    nextClient = sanitizeResponsavelEcdByRegime(nextClient);
    nextClient.status = normalizeClientStatus(nextClient.status);

    if (index >= 0) {
      let mergedClient = { ...previous, ...nextClient };
      if (isUuid(previous.id)) {
        try {
          const previousFromDb = await buscarClientePorIdSupabase(previous.id);
          if (previousFromDb) previousForHistory = previousFromDb;
        } catch (error) {
          console.warn('[historico] Falha ao buscar cliente atual para comparação:', error);
        }
        try {
          const saved = await atualizarClienteSupabase(previous.id, mergedClient);
          const savedId = String(saved?.id ?? previous.id ?? '').trim();
          let sociosAtualizados = previous._socios ?? [];
          if (sociosDirty && isUuid(savedId)) {
            sociosAtualizados = await salvarSociosClienteSupabase(savedId, sociosPayload);
          }
          mergedClient = withClientDefaults({ ...mergedClient, ...saved, _socios: sociosAtualizados });
          setSupabaseStatus({ connected: true, message: 'Alteracao salva no Supabase' });
          syncedWithSupabase = true;
          const historicoResult = await registrarHistoricoPersistente({
            clienteId: previous.id,
            valoresAntigos: previousForHistory ?? previous,
            valoresNovos: mergedClient,
            tipoAcao: 'edicao_manual',
            origem: origemEdicao,
            notifyOnError: true,
          });
          if (historicoResult?.ok) {
            await recarregarHistoricoClienteAtivo(previous.id);
          }
        } catch (error) {
          setSupabaseStatus({ connected: false, message: 'Falha ao salvar no Supabase' });
          setToast({
            title: 'Falha ao salvar no Supabase',
            message: `${error.message}. Nenhuma alteração local paralela foi aplicada.`,
          });
          return;
        }
      }
      nextClients[index] = clearPersistedObrigacoes(mergedClient);
    } else {
      let createdClient = { ...nextClient };
      try {
        const saved = await criarClienteSupabase(createdClient);
        const savedId = String(saved?.id ?? '').trim();
        let sociosAtualizados = [];
        if (sociosDirty && sociosPayload.length && isUuid(savedId)) {
          sociosAtualizados = await salvarSociosClienteSupabase(savedId, sociosPayload);
        }
        createdClient = withClientDefaults({ ...createdClient, ...saved, _socios: sociosAtualizados });
        setSupabaseStatus({ connected: true, message: 'Cliente criado no Supabase' });
        syncedWithSupabase = true;
      } catch (error) {
        setSupabaseStatus({ connected: false, message: 'Falha ao criar no Supabase' });
        setToast({
          title: 'Falha ao criar no Supabase',
          message: `${error.message}. O cliente não foi criado localmente para evitar divergência.`,
        });
        return;
      }
      nextClients.unshift(clearPersistedObrigacoes(createdClient));
    }
    persist(nextClients);
    setEditingClient(null);
    setToast({
      title: 'Cliente salvo',
      message: `${client.nome_identificacao || client.razao_social}.`,
    });
    if (syncedWithSupabase) {
      void resyncSupabaseAfterMutation(previous ? 'salvar cliente' : 'criar cliente');
    }
  }

  async function quickUpdateClient(id, patch) {
    if (!currentUserFull) return;
    if (!ensureSupabaseWriteReady('salvar a atualização rápida')) return;
    const previous = clients.find((client) => client.id === id);
    if (!previous || !canViewClient(currentUserFull, previous)) return;
    patch = applyResponsavelEcdFallback(previous, patch);
    let previousForHistory = previous;
    let syncedWithSupabase = false;
    const deniedField = Object.keys(patch).find((fieldKey) => !canEditClientField(currentUserFull, fieldKey));
    if (deniedField) {
      setToast({ title: 'Acesso negado', message: deniedReasonForField(currentUserFull, deniedField) });
      return;
    }
    let nextClient = { ...previous, ...patch, atualizado_em: new Date().toISOString() };
    if (isUuid(id)) {
      try {
        const previousFromDb = await buscarClientePorIdSupabase(id);
        if (previousFromDb) previousForHistory = previousFromDb;
      } catch (error) {
        console.warn('[historico] Falha ao buscar cliente atual para comparação:', error);
      }
      try {
        const saved = await atualizarClienteSupabase(id, nextClient);
        nextClient = withClientDefaults({ ...nextClient, ...saved });
        setSupabaseStatus({ connected: true, message: 'Atualização rápida salva no Supabase' });
        syncedWithSupabase = true;
        const historicoResult = await registrarHistoricoPersistente({
          clienteId: id,
          valoresAntigos: previousForHistory ?? previous,
          valoresNovos: nextClient,
          tipoAcao: 'edicao_manual',
          origem: page === 'detalhe' ? 'Detalhe do Cliente' : 'Base de Clientes',
          notifyOnError: true,
        });
        if (historicoResult?.ok) {
          await recarregarHistoricoClienteAtivo(id);
        }
      } catch (error) {
        setSupabaseStatus({ connected: false, message: 'Falha na atualização do Supabase' });
        setToast({
          title: 'Falha ao salvar no Supabase',
          message: `${error.message}. Nenhuma alteração local paralela foi aplicada.`,
        });
        return;
      }
    }

    const nextClients = clients.map((client) =>
      client.id === id ? clearPersistedObrigacoes(nextClient) : client,
    );
    persist(nextClients);
    if (syncedWithSupabase) {
      void resyncSupabaseAfterMutation('atualização rápida');
    }
  }

  async function batchUpdateResponsavel(clientIds, novoResponsavelInput) {
    if (!currentUserFull) return false;
    if (!ensureSupabaseWriteReady('alterar responsáveis em lote')) return false;
    if (!canEditClientField(currentUserFull, 'responsavel')) {
      setToast({ title: 'Acesso negado', message: deniedReasonForField(currentUserFull, 'responsavel') });
      return false;
    }

    const novoResponsavel = normalizeTeamMemberDisplayName(novoResponsavelInput);
    const responsaveisAtivos = getResponsaveisAtivosCatalogo(responsavelCatalogo);
    const responsaveisValidos = responsaveisAtivos.length ? responsaveisAtivos : uniqueValues(listagens.responsavel ?? []);
    const responsavelAtivo = responsaveisValidos.some((responsavel) => normalizeText(responsavel) === normalizeText(novoResponsavel));
    if (!novoResponsavel || !responsavelAtivo) {
      setToast({ title: 'Responsável inválido', message: 'Selecione um responsável ativo antes de confirmar.' });
      return false;
    }

    const idsSelecionados = new Set((clientIds ?? []).filter(Boolean));
    const clientesSelecionados = clients.filter((client) => idsSelecionados.has(client.id));
    if (!clientesSelecionados.length) {
      setToast({ title: 'Nenhum cliente selecionado', message: 'Selecione ao menos um cliente antes de alterar o responsável.' });
      return false;
    }

    const clienteSemPermissao = clientesSelecionados.find((client) => !canViewClient(currentUserFull, client) || !canEditClientField(currentUserFull, 'responsavel'));
    if (clienteSemPermissao) {
      setToast({
        title: 'Acesso negado',
        message: `Seu perfil não pode alterar o responsável de ${clienteSemPermissao.nome_identificacao || clienteSemPermissao.razao_social || 'um dos clientes selecionados'}.`,
      });
      return false;
    }

    const clientesParaAtualizar = clientesSelecionados.filter((client) => {
      return normalizeText(normalizeTeamMemberDisplayName(client.responsavel)) !== normalizeText(novoResponsavel);
    });
    if (!clientesParaAtualizar.length) {
      setToast({ title: 'Nenhuma alteração necessária', message: 'Os clientes selecionados já estão com esse responsável.' });
      return true;
    }

    const atualizados = new Map();
    const falhas = [];

    for (const client of clientesParaAtualizar) {
      if (!isUuid(client.id)) {
        falhas.push(client);
        continue;
      }

      let previousForHistory = client;
      try {
        const previousFromDb = await buscarClientePorIdSupabase(client.id);
        if (previousFromDb) previousForHistory = previousFromDb;
      } catch (error) {
        console.warn('[historico] Falha ao buscar cliente atual para alteração em lote:', error);
      }

      try {
        const patch = applyResponsavelEcdFallback(previousForHistory ?? client, { responsavel: novoResponsavel });
        const saved = await atualizarClienteSupabase(client.id, patch);
        const nextClient = withClientDefaults({
          ...client,
          ...patch,
          ...saved,
        });
        const historicoResult = await registrarHistoricoPersistente({
          clienteId: client.id,
          valoresAntigos: previousForHistory ?? client,
          valoresNovos: nextClient,
          tipoAcao: 'alteracao_responsavel_lote',
          origem: 'Base de Clientes - Alteração em lote',
          notifyOnError: true,
        });
        if (historicoResult?.ok) {
          await recarregarHistoricoClienteAtivo(client.id);
        }
        atualizados.set(client.id, clearPersistedObrigacoes(nextClient));
      } catch (error) {
        console.warn('[clientes] Falha ao alterar responsavel em lote:', error);
        falhas.push({ ...client, _batchError: error });
      }
    }

    if (atualizados.size) {
      updateClientsPersisted((current) =>
        current.map((client) => atualizados.get(client.id) ?? client),
      );
      setSupabaseStatus({
        connected: true,
        message: `${formatNumber(atualizados.size)} responsável(is) atualizado(s) no Supabase`,
      });
      void resyncSupabaseAfterMutation('alteração de responsável em lote');
    }

    if (falhas.length) {
      setToast({
        title: atualizados.size ? 'Alteração parcial' : 'Falha ao alterar responsáveis',
        message: atualizados.size
          ? `${formatNumber(atualizados.size)} cliente(s) atualizado(s), ${formatNumber(falhas.length)} não confirmado(s). Revise a carteira antes de tentar novamente.`
          : 'Nenhum cliente foi atualizado. Revise a conexão e tente novamente.',
      });
      return false;
    }

    setToast({
      title: 'Responsável alterado',
      message: `${formatNumber(atualizados.size)} cliente(s) transferido(s) para ${novoResponsavel}.`,
    });
    return true;
  }

  async function handleAnexoSuccess(clientId, tipoAnexo, anexo) {
    const fieldKey = ATTACHMENT_FIELD_BY_TYPE[tipoAnexo];
    const fieldIsTrackedInClientBase = FIELD_DEFINITIONS.some((field) => field.key === fieldKey);
    const clienteAtual = clients.find((client) => client.id === clientId);
    const valorAnteriorBruto = fieldKey ? clienteAtual?.[fieldKey] ?? '' : '';
    const tinhaAnexoAntes = hasAttachment(valorAnteriorBruto);
    const valorNovo = anexoToFieldValue(anexo);

    function getOrigemAnexoByPage() {
      if (page === 'reinf') return 'Distribuição de Lucro';
      if (page === 'ecd') return 'ECD / ECF';
      if (page === 'detalhe') return 'Detalhe do Cliente';
      return 'Base de Clientes';
    }

    if (fieldKey && fieldIsTrackedInClientBase) {
      updateClientsPersisted((current) =>
        current.map((client) =>
          client.id === clientId
            ? clearPersistedObrigacoes({
              ...client,
              [fieldKey]: valorNovo,
              atualizado_em: new Date().toISOString(),
            })
            : client,
        ),
      );
    }

    if (fieldKey && fieldIsTrackedInClientBase && isUuid(clientId) && currentUserFull?.id) {
      try {
        await registrarEventoHistoricoSupabase({
          clienteId: clientId,
          usuarioLogado: currentUserFull,
          campoAlterado: fieldKey,
          valorAnterior: parseAttachment(valorAnteriorBruto).name || valorAnteriorBruto || null,
          valorNovo: anexo?.nome_arquivo || null,
          tipoAcao: tinhaAnexoAntes ? 'anexo_substituido' : 'anexo_criado',
          origem: getOrigemAnexoByPage(),
        });
        if (selectedClient?.id === clientId) {
          await carregarHistoricoCliente(clientId);
        }
      } catch (error) {
        console.warn('[historico] Falha ao registrar evento de anexo:', error);
      }
    }

    const nomeCampo = fieldKey ? getFieldLabel(FIELD_DEFINITIONS, fieldKey) : 'Anexo';
    setToast({
      title: tinhaAnexoAntes ? 'Arquivo substituído com sucesso' : 'Arquivo anexado com sucesso',
      message: `${nomeCampo}: ${anexo?.nome_arquivo ?? 'registro atualizado'}.`,
    });
    if (fieldKey && fieldIsTrackedInClientBase && isUuid(clientId)) {
      void resyncSupabaseAfterMutation('atualização de anexo');
    }
  }

  async function handleAnexoRemove(clientId, tipoAnexo, anexo) {
    const fieldKey = ATTACHMENT_FIELD_BY_TYPE[tipoAnexo];
    const fieldIsTrackedInClientBase = FIELD_DEFINITIONS.some((field) => field.key === fieldKey);
    const clienteAtual = clients.find((client) => client.id === clientId);
    const valorAnteriorBruto = fieldKey ? clienteAtual?.[fieldKey] ?? '' : '';
    const nomeAnterior = anexo?.nome_arquivo || parseAttachment(valorAnteriorBruto).name || valorAnteriorBruto || null;

    function getOrigemAnexoByPage() {
      if (page === 'reinf') return 'Distribuição de Lucro';
      if (page === 'ecd') return 'ECD / ECF';
      if (page === 'detalhe') return 'Detalhe do Cliente';
      return 'Base de Clientes';
    }

    if (fieldKey && fieldIsTrackedInClientBase) {
      updateClientsPersisted((current) =>
        current.map((client) =>
          client.id === clientId
            ? clearPersistedObrigacoes({
              ...client,
              [fieldKey]: '',
              atualizado_em: new Date().toISOString(),
            })
            : client,
        ),
      );
    }

    if (fieldKey && fieldIsTrackedInClientBase && isUuid(clientId)) {
      try {
        await atualizarClienteSupabase(clientId, { [fieldKey]: '' });
      } catch (error) {
        console.warn('[anexos] Falha ao limpar campo legado do cliente após remoção:', error);
      }
    }

    if (fieldKey && fieldIsTrackedInClientBase && isUuid(clientId) && currentUserFull?.id) {
      try {
        await registrarEventoHistoricoSupabase({
          clienteId: clientId,
          usuarioLogado: currentUserFull,
          campoAlterado: fieldKey,
          valorAnterior: nomeAnterior,
          valorNovo: null,
          tipoAcao: 'anexo_removido',
          origem: getOrigemAnexoByPage(),
        });
        if (selectedClient?.id === clientId) {
          await carregarHistoricoCliente(clientId);
        }
      } catch (error) {
        console.warn('[historico] Falha ao registrar remoção de anexo:', error);
      }
    }

    const nomeCampo = fieldKey ? getFieldLabel(FIELD_DEFINITIONS, fieldKey) : 'Anexo';
    setToast({
      title: 'Anexo removido com sucesso',
      message: `${nomeCampo} removido.`,
    });

    if (fieldKey && fieldIsTrackedInClientBase && isUuid(clientId)) {
      void resyncSupabaseAfterMutation('remoção de anexo');
    }
  }

  function handleAnexoError(message) {
    setToast({
      title: 'Erro ao processar anexo',
      message,
    });
  }

  async function handleContratoSocialSuccess(clientId, contrato, fallbackClientId = '') {
    if (isUuid(clientId)) {
      updateClientsPersisted((current) =>
        current.map((client) =>
          client.id === clientId || client.id === fallbackClientId
            ? clearPersistedObrigacoes({
              ...client,
              _contrato_social_atual: contrato,
              atualizado_em: new Date().toISOString(),
            })
            : client,
        ),
      );
    }

    setToast({
      title: 'Contrato social anexado',
      message: `Versão ${contrato?.versao ?? '-'}: ${contrato?.nome_arquivo ?? 'registro atualizado'}.`,
    });

    if (isUuid(clientId) && currentUserFull?.id) {
      try {
        await registrarEventoHistoricoSupabase({
          clienteId,
          usuarioLogado: currentUserFull,
          campoAlterado: 'contrato_social',
          valorAnterior: null,
          valorNovo: contrato?.nome_arquivo || null,
          tipoAcao: 'contrato_social_versionado',
          origem: page === 'detalhe' ? 'Detalhe do Cliente' : 'Base de Clientes',
        });
        if (selectedClient?.id === clientId) {
          await carregarHistoricoCliente(clientId);
        }
      } catch (error) {
        console.warn('[historico] Falha ao registrar contrato social no histórico:', error);
      }
    }
  }

  async function salvarRelatorioReinf(payload) {
    if (!ensureSupabaseWriteReady('salvar o relatório de distribuição de lucro')) return false;
    try {
      const saved = await salvarReinfRelatorioSupabase(payload);
      if (saved?.id) {
        setReinfRelatorios((current) => [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
      }
      setToast({
        title: 'Relatório de distribuição de lucro salvo',
        message: saved?.razao_social || saved?.nome_identificacao || 'Histórico atualizado.',
      });
      return saved || true;
    } catch (error) {
      setToast({
        title: 'Falha ao salvar relatório de distribuição de lucro',
        message: error.message || 'Não foi possível salvar o relatório agora.',
      });
      return false;
    }
  }

  async function excluirRelatorioReinf(relatorio, options = {}) {
    const { skipConfirm = false, silent = false } = options;
    if (!ensureSupabaseWriteReady('excluir o relatório de distribuição de lucro')) return false;
    if (!relatorio?.id) {
      if (!silent) {
        setToast({
          title: 'Relatório de distribuição de lucro inválido',
          message: 'Não foi possível identificar o relatório para exclusão.',
        });
      }
      return false;
    }

    const clienteNome = relatorio.razao_social || relatorio.nome_identificacao || 'este cliente';
    if (!skipConfirm) {
      const confirmed = window.confirm(`Excluir o relatório de distribuição de lucro de ${clienteNome}? Esta ação não pode ser desfeita.`);
      if (!confirmed) return false;
    }

    try {
      const deleted = await excluirReinfRelatorioSupabase(relatorio.id);
      setReinfRelatorios((current) => current.filter((item) => item.id !== relatorio.id));
      if (!silent) {
        setToast({
          title: 'Relatório de distribuição de lucro excluído',
          message: deleted?.razao_social || deleted?.nome_identificacao || 'Histórico atualizado.',
        });
      }
      return true;
    } catch (error) {
      if (!silent) {
        setToast({
          title: 'Falha ao excluir relatório de distribuição de lucro',
          message: error.message || 'Não foi possível excluir o relatório agora.',
        });
      }
      return false;
    }
  }

  async function enviarEmailReinf(payload) {
    if (!ensureSupabaseWriteReady('enviar o e-mail de distribuição de lucro')) return false;
    try {
      const sent = await enviarReinfEmailSupabase(payload);
      setToast({
        title: 'E-mail de distribuição de lucro enviado',
        message: 'Mensagem enviada para o setor fiscal.',
      });
      return sent || true;
    } catch (error) {
      setToast({
        title: 'Falha ao enviar e-mail de distribuição de lucro',
        message: error.message || 'Não foi possível enviar o e-mail agora.',
      });
      return false;
    }
  }

  function canManageAttachment(client, fieldKey) {
    if (!currentUserFull || !client) return false;
    return canViewClient(currentUserFull, client) && canEditClientField(currentUserFull, fieldKey);
  }

  function canManageContratoSocial(client) {
    if (!currentUserFull || !client) return false;
    return (
      canWritePortalData
      && !isClientArchived(client)
      && canViewClient(currentUserFull, client)
      && (
        canEditClientField(currentUserFull, 'anexo_cartao_cnpj')
        || canEditClientField(currentUserFull, 'anexo_cartao_qsa')
      )
    );
  }

  async function inactivateClient(client) {
    if (!can(currentUserFull, PERMISSIONS.CLIENTS_INACTIVATE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode inativar clientes.' });
      return;
    }
    if (!ensureSupabaseWriteReady('inativar o cliente')) return;
    if (!confirm(`Inativar ${client.nome_identificacao || client.razao_social}?`)) return;
    let previousForHistory = client;
    if (isUuid(client.id)) {
      try {
        const previousFromDb = await buscarClientePorIdSupabase(client.id);
        if (previousFromDb) previousForHistory = previousFromDb;
      } catch (error) {
        console.warn('[historico] Falha ao buscar cliente atual para inativação:', error);
      }
      try {
        await inativarClienteSupabase(client.id);
        setSupabaseStatus({ connected: true, message: 'Cliente inativado no Supabase' });
        const archivedAt = new Date().toISOString();
        const retainedStatus = normalizeClientStatus(previousForHistory?.status ?? client.status);
        const historicoResult = await registrarHistoricoPersistente({
          clienteId: client.id,
          valoresAntigos: previousForHistory ?? client,
          valoresNovos: {
            ...(previousForHistory ?? client),
            status: retainedStatus,
            arquivado: true,
            arquivado_em: archivedAt,
            arquivado_por: currentUserFull?.auth_user_id ?? currentUserFull?.id ?? '',
            arquivado_motivo: 'Inativado pelo portal',
          },
          tipoAcao: 'inativacao',
          origem: 'Base de Clientes',
          notifyOnError: true,
        });
        if (historicoResult?.ok) {
          await recarregarHistoricoClienteAtivo(client.id);
        }
      } catch (error) {
        setSupabaseStatus({ connected: false, message: 'Falha ao inativar no Supabase' });
        setToast({
          title: 'Falha ao inativar no Supabase',
          message: `${error.message}. O cliente foi mantido como está para evitar divergência.`,
        });
        return;
      }
    }
    const retainedStatus = normalizeClientStatus(client.status);
    const nextClient = {
      ...client,
      status: retainedStatus,
      arquivado: true,
      arquivado_em: new Date().toISOString(),
      arquivado_por: currentUserFull?.auth_user_id ?? currentUserFull?.id ?? '',
      arquivado_motivo: 'Inativado pelo portal',
      atualizado_em: new Date().toISOString(),
    };
    updateClientsPersisted((current) => current.map((item) => (item.id === client.id ? nextClient : item)));
    setToast({
      title: 'Cliente inativado',
      message: client.nome_identificacao || client.razao_social,
    });
    if (isUuid(client.id)) {
      void resyncSupabaseAfterMutation('inativação de cliente');
    }
  }

  async function restoreClient(client) {
    if (!can(currentUserFull, PERMISSIONS.CLIENTS_INACTIVATE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode restaurar clientes.' });
      return;
    }
    if (!ensureSupabaseWriteReady('restaurar o cliente')) return;

    const clientName = client.nome_identificacao || client.razao_social || 'este cliente';
    if (!confirm(`Restaurar ${clientName} para a carteira ativa?`)) return;

    let previousForHistory = client;
    let restoredFromDb = null;
    const restoredAt = new Date().toISOString();

    if (isUuid(client.id)) {
      try {
        const previousFromDb = await buscarClientePorIdSupabase(client.id);
        if (previousFromDb) previousForHistory = previousFromDb;
      } catch (error) {
        console.warn('[historico] Falha ao buscar cliente atual para restauração:', error);
      }

      try {
        restoredFromDb = await restaurarClienteSupabase(client.id);
        setSupabaseStatus({ connected: true, message: 'Cliente restaurado no Supabase' });
      } catch (error) {
        setSupabaseStatus({ connected: false, message: 'Falha ao restaurar no Supabase' });
        setToast({
          title: 'Falha ao restaurar no Supabase',
          message: `${error.message}. O cliente arquivado foi mantido como está para evitar divergência.`,
        });
        return;
      }
    }

    const nextClient = {
      ...(previousForHistory ?? client),
      ...(restoredFromDb ?? {}),
      arquivado: false,
      arquivado_em: '',
      arquivado_por: '',
      arquivado_motivo: '',
      atualizado_em: restoredFromDb?.atualizado_em ?? restoredAt,
    };

    nextClient.status = normalizeClientStatus(nextClient.status);

    if (normalizeText(nextClient.situacao) === 'inativo') {
      nextClient.situacao = '';
    }

    if (isUuid(client.id)) {
      const historicoResult = await registrarHistoricoPersistente({
        clienteId: client.id,
        valoresAntigos: previousForHistory ?? client,
        valoresNovos: nextClient,
        tipoAcao: 'restauracao',
        origem: 'Base de Clientes',
        notifyOnError: true,
      });
      if (historicoResult?.ok) {
        await recarregarHistoricoClienteAtivo(client.id);
      }
    }

    updateClientsPersisted((current) => current.map((item) => (item.id === client.id ? nextClient : item)));
    setToast({
      title: 'Cliente restaurado',
      message: clientName,
    });
    if (isUuid(client.id)) {
      void resyncSupabaseAfterMutation('restauração de cliente');
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!can(currentUserFull, PERMISSIONS.IMPORT_EXCEL)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode importar planilhas.' });
      return;
    }
    if (!ensureSupabaseWriteReady('importar clientes')) return;

    try {
      const buffer = await file.arrayBuffer();
      const result = await previsualizarImportacaoExcel(buffer, file.name);
      if (!result.ok) {
        setToast({
          title: 'Falha na pré-visualização',
          message: result.errors?.[0] ?? 'Não foi possível importar clientes para o Supabase.',
        });
        return;
      }
      setImportPreview({
        fileName: file.name,
        buffer,
        summary: result.summary,
        errors: result.errors,
      });
    } catch (error) {
      setToast({ title: 'Falha ao validar planilha', message: error.message });
    }
  }

  async function confirmarImportacaoExcel() {
    if (!importPreview?.buffer || !importPreview?.fileName) return;
    if (!ensureSupabaseWriteReady('confirmar a importação')) return;
    setImportBusy(true);
    try {
      const clientesAntesImportacao = [...clients];
      const result = await importarClientesExcel(importPreview.buffer, importPreview.fileName);
      if (!result.ok) {
        setToast({
          title: 'Falha ao importar',
          message: result.errors?.[0] ?? 'Não foi possível importar clientes para o Supabase.',
        });
        return;
      }

      const clientesAntesPorCnpj = new Map(
        clientesAntesImportacao
          .map((cliente) => [normalizeCnpj(cliente.cnpj), cliente])
          .filter(([cnpj]) => cnpj),
      );

      const candidatosHistoricoImportacao = (result.rows ?? []).filter((row) =>
        clientesAntesPorCnpj.has(normalizeCnpj(row.cnpj)),
      );

      for (const rowImportado of candidatosHistoricoImportacao) {
        const cnpjKey = normalizeCnpj(rowImportado.cnpj);
        const clienteAntes = clientesAntesPorCnpj.get(cnpjKey);
        if (!clienteAntes?.id || !isUuid(clienteAntes.id)) continue;
        await registrarHistoricoPersistente({
          clienteId: clienteAntes.id,
          valoresAntigos: clienteAntes,
          valoresNovos: rowImportado,
          tipoAcao: 'importacao_excel',
          origem: 'Importação Excel',
        });
      }

      const recarregado = await carregarDadosSupabase({ silent: true });
      setImportPreview(null);
      setToast({
        title: 'Planilha importada',
        message: recarregado
          ? `Linhas: ${result.summary.totalLinhasLidas} | Criados: ${result.summary.criados} | Atualizados: ${result.summary.atualizados} | Ignorados: ${result.summary.ignorados} | Erros: ${result.summary.erros}`
          : 'Importação concluída no Supabase, mas a interface não conseguiu recarregar automaticamente.',
      });
    } catch (error) {
      setToast({ title: 'Falha ao importar', message: error.message });
    } finally {
      setImportBusy(false);
    }
  }

  async function exportXlsx(rows, filename) {
    if (!can(currentUserFull, PERMISSIONS.REPORTS_EXPORT)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode exportar relatórios.' });
      return;
    }
    const { exportClientsToXlsx, exportRowsToXlsx } = await import('./lib/excel.js');
    if (rows[0]?.cnpj || rows.length === 0) {
      exportClientsToXlsx(rows, filename);
    } else {
      exportRowsToXlsx(rows, filename);
    }
  }

  async function exportCsv(rows, filename) {
    if (!can(currentUserFull, PERMISSIONS.REPORTS_EXPORT)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode exportar relatórios.' });
      return;
    }
    const { exportClientsToCsv, exportRowsToCsv } = await import('./lib/excel.js');
    if (rows[0]?.cnpj || rows.length === 0) {
      exportClientsToCsv(rows, filename);
    } else {
      exportRowsToCsv(rows, filename);
    }
  }

  async function exportPdf(rows, filename, title = 'Relatório') {
    if (!can(currentUserFull, PERMISSIONS.REPORTS_EXPORT)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode exportar relatórios.' });
      return;
    }
    const { exportRowsToPdf } = await import('./lib/pdf.js');
    exportRowsToPdf(rows, filename, title);
  }

  async function deleteHistoricoSelecionado(ids) {
    const idsValidos = [...new Set((ids ?? []).filter(Boolean))];
    if (!idsValidos.length) return false;
    if (!can(currentUserFull, PERMISSIONS.HISTORY_DELETE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode excluir registros do histórico.' });
      return false;
    }
    if (!ensureSupabaseWriteReady('excluir registros do histórico')) return false;

    try {
      const result = await excluirHistoricoPorIdsSupabase(idsValidos);
      const deletedIds = result.deleted ?? [];
      if (!deletedIds.length) {
        setToast({
          title: 'Nenhum histórico excluído',
          message: 'Verifique se a policy de DELETE do histórico já foi aplicada no Supabase.',
        });
        return false;
      }

      const deletedSet = new Set(deletedIds);
      persistSecurity((current) => ({
        ...current,
        historico_alteracoes: (current.historico_alteracoes ?? []).filter((item) => !deletedSet.has(item.id)),
      }));
      setHistoricoCliente((current) => current.filter((item) => !deletedSet.has(item.id)));
      setToast({
        title: deletedIds.length === 1 ? 'Histórico excluído' : 'Históricos excluídos',
        message: `${formatNumber(deletedIds.length)} registro(s) removido(s).`,
      });
      return true;
    } catch (error) {
      setToast({
        title: 'Falha ao excluir histórico',
        message: error.message || 'Não foi possível excluir os registros selecionados.',
      });
      return false;
    }
  }

  async function createResponsavelCatalogo(valorInput) {
    if (!can(currentUserFull, PERMISSIONS.USERS_MANAGE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode gerenciar responsáveis.' });
      return false;
    }
    if (!ensureSupabaseWriteReady('cadastrar o responsável')) return false;

    const valor = String(valorInput ?? '').trim();
    if (!valor) {
      setToast({ title: 'Responsável obrigatório', message: 'Informe um nome antes de cadastrar.' });
      return false;
    }

    const existente = responsavelCatalogo.find((item) => normalizeText(item.valor) === normalizeText(valor));
    if (existente?.ativo) {
      setToast({ title: 'Responsável já cadastrado', message: existente.valor });
      return false;
    }
    if (existente && !existente.id) {
      setToast({ title: 'Sincronização pendente', message: 'Atualize os dados do Supabase antes de alterar este responsável.' });
      return false;
    }

    setResponsavelCatalogoBusy(true);
    try {
      const saved = existente
        ? await reativarValorListagem(existente.id)
        : await criarValorListagem('responsavel', valor);
      atualizarResponsavelCatalogoLocal(saved);
      setToast({
        title: existente ? 'Responsável reativado' : 'Responsável cadastrado',
        message: saved.valor,
      });
      return true;
    } catch (error) {
      setToast({
        title: 'Falha ao cadastrar responsável',
        message: error.message || 'Não foi possível salvar o responsável no Supabase.',
      });
      return false;
    } finally {
      setResponsavelCatalogoBusy(false);
    }
  }

  async function toggleResponsavelCatalogo(item) {
    if (!can(currentUserFull, PERMISSIONS.USERS_MANAGE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode gerenciar responsáveis.' });
      return false;
    }
    if (!ensureSupabaseWriteReady('alterar o responsável')) return false;
    if (!item?.id) {
      setToast({ title: 'Sincronização pendente', message: 'Atualize os dados do Supabase antes de alterar este responsável.' });
      return false;
    }

    setResponsavelCatalogoBusy(true);
    try {
      const saved = item.ativo
        ? await inativarValorListagem(item.id)
        : await reativarValorListagem(item.id);
      atualizarResponsavelCatalogoLocal(saved);
      setToast({
        title: saved.ativo ? 'Responsável reativado' : 'Responsável inativado',
        message: saved.valor,
      });
      return true;
    } catch (error) {
      setToast({
        title: 'Falha ao atualizar responsável',
        message: error.message || 'Não foi possível atualizar o responsável no Supabase.',
      });
      return false;
    } finally {
      setResponsavelCatalogoBusy(false);
    }
  }

  async function deleteResponsavelCatalogo(item) {
    if (!can(currentUserFull, PERMISSIONS.USERS_MANAGE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode gerenciar responsáveis.' });
      return false;
    }
    if (!ensureSupabaseWriteReady('excluir o responsável')) return false;
    if (!item?.id) {
      setToast({ title: 'Sincronização pendente', message: 'Atualize os dados do Supabase antes de excluir este responsável.' });
      return false;
    }
    if (item.ativo) {
      setToast({ title: 'Inative antes de excluir', message: 'A exclusão definitiva só fica disponível para responsáveis inativos.' });
      return false;
    }

    setResponsavelCatalogoBusy(true);
    try {
      const vinculados = await listarClientesVinculadosResponsavel(item.valor);
      if (vinculados.length) {
        const exemplo = vinculados[0]?.nome_identificacao || vinculados[0]?.razao_social || 'cliente vinculado';
        setToast({
          title: 'Exclusão bloqueada',
          message: `${item.valor} ainda está vinculado a ${formatNumber(vinculados.length)} cliente(s) ativo(s), incluindo ${exemplo}. Transfira ou limpe esses vínculos antes de excluir.`,
        });
        return false;
      }

      if (!confirm(`Excluir definitivamente o responsável ${item.valor}? Essa ação não poderá ser desfeita.`)) {
        return false;
      }

      const deleted = await excluirValorListagem(item.id, 'responsavel');
      setResponsavelCatalogo((current) => {
        const nextCatalogo = current.filter((row) => row.id !== item.id);
        setListagens((currentListagens) => ({
          ...currentListagens,
          responsavel: getResponsaveisAtivosCatalogo(nextCatalogo),
        }));
        return nextCatalogo;
      });
      setToast({
        title: 'Responsável excluído',
        message: deleted.valor || item.valor,
      });
      return true;
    } catch (error) {
      setToast({
        title: 'Falha ao excluir responsável',
        message: error.message || 'Não foi possível excluir o responsável no Supabase.',
      });
      return false;
    } finally {
      setResponsavelCatalogoBusy(false);
    }
  }

  async function uploadResponsavelSignature(item, file) {
    if (!can(currentUserFull, PERMISSIONS.USERS_MANAGE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode gerenciar assinaturas.' });
      return false;
    }
    if (!ensureSupabaseWriteReady('salvar a assinatura do responsável')) return false;
    if (!item?.id || !isUuid(item.id)) {
      setToast({ title: 'Sincronização pendente', message: 'Atualize os dados do Supabase antes de salvar a assinatura.' });
      return false;
    }

    setResponsavelCatalogoBusy(true);
    try {
      const saved = await salvarAssinaturaResponsavelSupabase(item, file);
      atualizarResponsavelCatalogoLocal(saved);
      setToast({ title: 'Assinatura salva', message: saved.valor });
      return true;
    } catch (error) {
      setToast({
        title: 'Falha ao salvar assinatura',
        message: error.message || 'Não foi possível salvar a assinatura no Supabase.',
      });
      return false;
    } finally {
      setResponsavelCatalogoBusy(false);
    }
  }

  async function removeResponsavelSignature(item) {
    if (!can(currentUserFull, PERMISSIONS.USERS_MANAGE)) {
      setToast({ title: 'Acesso negado', message: 'Seu perfil não pode gerenciar assinaturas.' });
      return false;
    }
    if (!ensureSupabaseWriteReady('remover a assinatura do responsável')) return false;
    if (!item?.id || !isUuid(item.id)) {
      setToast({ title: 'Sincronização pendente', message: 'Atualize os dados do Supabase antes de remover a assinatura.' });
      return false;
    }

    setResponsavelCatalogoBusy(true);
    try {
      const saved = await removerAssinaturaResponsavelSupabase(item);
      atualizarResponsavelCatalogoLocal(saved);
      setToast({ title: 'Assinatura removida', message: saved.valor });
      return true;
    } catch (error) {
      setToast({
        title: 'Falha ao remover assinatura',
        message: error.message || 'Não foi possível remover a assinatura no Supabase.',
      });
      return false;
    } finally {
      setResponsavelCatalogoBusy(false);
    }
  }

  async function saveUser(userValues) {
    if (!can(currentUserFull, PERMISSIONS.USERS_MANAGE)) return;
    if (!ensureSupabaseWriteReady('salvar o usuário')) return;
    if (!security.usuarios.some((user) => user.id === userValues.id)) {
      setToast({ title: 'Ação bloqueada', message: 'Usuário não encontrado na base local.' });
      return;
    }
    if (!isUuid(userValues.id)) {
      setToast({ title: 'Sincronização pendente', message: 'Atualize os dados do Supabase antes de editar usuários.' });
      return;
    }
    if (userValues.id === currentUserFull?.id && userValues.status !== 'Ativo') {
      setToast({ title: 'Ação bloqueada', message: 'Você não pode inativar seu próprio usuário.' });
      return;
    }
    if (userValues.id === currentUserFull?.id && userValues.perfil_acesso !== currentUserFull?.perfil_acesso) {
      setToast({ title: 'Ação bloqueada', message: 'Altere o perfil do seu próprio usuário apenas por um fluxo administrado.' });
      return;
    }
    try {
      const updated = await atualizarUsuarioPortal(userValues.id, {
        nome: userValues.nome,
        cargo: userValues.cargo,
        setor: userValues.setor,
        perfil_acesso: userValues.perfil_acesso,
        status: userValues.status,
      });
      persistSecurity((current) => ({
        ...current,
        usuarios: (current.usuarios ?? []).map((user) => (user.id === updated.id ? updated : user)),
      }));
      setEditingUser(null);
      setToast({ title: 'Usuário salvo', message: updated.email });
    } catch (error) {
      setToast({
        title: 'Falha ao salvar usuário',
        message: error.message || 'Não foi possível persistir o usuário no Supabase.',
      });
    }
  }

  async function toggleUserStatus(user) {
    if (!ensureSupabaseWriteReady('alterar o status do usuário')) return;
    if (user.id === currentUserFull?.id) {
      setToast({ title: 'Ação bloqueada', message: 'Você não pode inativar seu próprio usuário.' });
      return;
    }
    if (!isUuid(user.id)) {
      setToast({ title: 'Sincronização pendente', message: 'Atualize os dados do Supabase antes de alterar usuários.' });
      return;
    }

    const nextStatus = user.status === 'Ativo' ? 'Inativo' : 'Ativo';
    try {
      const updated = await atualizarUsuarioPortal(user.id, { status: nextStatus });
      persistSecurity((current) => ({
        ...current,
        usuarios: (current.usuarios ?? []).map((item) => (item.id === updated.id ? updated : item)),
      }));
      setToast({ title: 'Usuário ' + nextStatus.toLowerCase(), message: user.email });
    } catch (error) {
      setToast({
        title: 'Falha ao atualizar status',
        message: error.message || 'Não foi possível atualizar o usuário no Supabase.',
      });
    }
  }

  if (!authReady) return <FullscreenStatusState label={authGateLabel} />;

  if (!currentUserFull && (shouldHoldAuthenticatedEntry || (authRestoring && hasStoredSession))) {
    return <FullscreenStatusState label={authGateLabel} />;
  }

  if (currentUserFull && !initialPortalReady) {
    return <FullscreenStatusState label={portalGateLabel} />;
  }

  if (!currentUserFull) {
    if (authView === 'firstAccess') {
      return (
        <FirstAccessPage
          onBack={() => setAuthView('login')}
          onCreatePassword={createFirstAccessPassword}
        />
      );
    }
    if (authView === 'forgot') {
      return (
        <ForgotPasswordPage
          onBack={() => setAuthView('login')}
          onRequestReset={requestPasswordReset}
        />
      );
    }
    if (authView === 'reset') {
      return <ResetPasswordPage onBack={() => setAuthView('login')} onResetPassword={resetPassword} />;
    }
    return <LoginPage onLogin={login} onForgot={() => setAuthView('forgot')} onReset={() => setAuthView('reset')} onFirstAccess={() => setAuthView('firstAccess')} />;
  }

  if (currentUserFull.precisa_trocar_senha) {
    return (
      <ForcedPasswordPage
        currentUser={currentUserFull}
        onChangePassword={changeRequiredPassword}
        onLogout={() => logout()}
      />
    );
  }

  const canCreateClient = can(currentUserFull, PERMISSIONS.CLIENTS_CREATE);
  const canExportReports = can(currentUserFull, PERMISSIONS.REPORTS_EXPORT);
  const canDeleteHistory = can(currentUserFull, PERMISSIONS.HISTORY_DELETE);

  const content = {
    dashboard: can(currentUserFull, PERMISSIONS.DASHBOARDS_VIEW)
      ? (
        <DashboardPage
          clients={activeClients}
          onPreset={applyPreset}
          onNavigate={(nextPage, options = {}) => {
            if (options.clearFilters) {
              setFilters(DEFAULT_FILTERS);
              setQuickFilterLabel('');
            }
            setPage(nextPage);
          }}
        />
      )
      : <AccessDeniedPage />,
    clientes: (
      <BaseClientesPage
        filters={filters}
        setFilters={setFilters}
        listagens={listagens}
        quickFilterLabel={quickFilterLabel}
        onClear={clearFilters}
        onNewClient={() => {
          if (!ensureSupabaseWriteReady('abrir o cadastro de cliente')) return;
          setEditingClient({});
        }}
        onManualFilter={() => setQuickFilterLabel('')}
        visibleCount={filteredClients.length}
        totalCount={enrichedClients.length}
        clients={filteredClients}
        sort={sort}
        setSort={setSort}
        onView={openClient}
        onEdit={(client) => {
          if (isClientArchived(client)) {
            setToast({ title: 'Cliente arquivado', message: 'Restaure o cliente antes de editar.' });
            return;
          }
          if (!ensureSupabaseWriteReady('editar o cliente')) return;
          setEditingClient(client);
        }}
        onInactivate={inactivateClient}
        onRestore={restoreClient}
        canCreateClient={canCreateClient}
        canCreateClientEnabled={canCreateClient && canWritePortalData}
        createDisabledReason={writeBlockedReason}
        allClients={enrichedClients}
        canEditRow={(client) => canWritePortalData && !isClientArchived(client) && canEditClient(currentUserFull, client)}
        canInactivateRow={(client) => canWritePortalData && !isClientArchived(client) && can(currentUserFull, PERMISSIONS.CLIENTS_INACTIVATE) && canViewClient(currentUserFull, client)}
        canRestoreRow={(client) => canWritePortalData && isClientArchived(client) && can(currentUserFull, PERMISSIONS.CLIENTS_INACTIVATE) && canViewClient(currentUserFull, client)}
        canBatchUpdateResponsavel={(client) => canWritePortalData && canViewClient(currentUserFull, client) && canEditClientField(currentUserFull, 'responsavel')}
        responsavelOptions={getResponsaveisAtivosCatalogo(responsavelCatalogo)}
        onBatchUpdateResponsavel={batchUpdateResponsavel}
        renderClientCell={(client, fieldKey) => {
          if (fieldKey === 'responsavel') {
            return renderFieldValue(getResponsavelOperacional(client));
          }
          if (fieldKey === 'revisor') {
            return renderFieldValue(normalizeTeamMemberDisplayName(client?.revisor));
          }
          if (fieldKey === 'contrato_social') {
            return (
              <ContratoSocialTableCell
                cliente={client}
                contrato={client._contrato_social_atual}
                disabled={!canManageContratoSocial(client)}
                onSuccess={(contrato) => handleContratoSocialSuccess(contrato?.cliente_id || client.id, contrato, client.id)}
                onError={handleAnexoError}
              />
            );
          }
          const tipoAnexo = ATTACHMENT_TYPE_BY_FIELD[fieldKey];
          if (!tipoAnexo) return undefined;
          return (
            <AttachmentCell
              client={client}
              fieldKey={fieldKey}
              tipoAnexo={tipoAnexo}
              disabled={!canManageAttachment(client, fieldKey)}
              onSuccess={handleAnexoSuccess}
              onRemove={handleAnexoRemove}
              onError={handleAnexoError}
            />
          );
        }}
      />
    ),
    detalhe: (
      <DetailPage
        client={selectedClient}
        onBack={() => setPage('clientes')}
        onEdit={(client) => {
          if (isClientArchived(client)) {
            setToast({ title: 'Cliente arquivado', message: 'Restaure o cliente antes de editar.' });
            return;
          }
          if (!ensureSupabaseWriteReady('editar o cliente')) return;
          setEditingClient(client);
        }}
        canEditCurrent={selectedClient ? canWritePortalData && !isClientArchived(selectedClient) && canEditClient(currentUserFull, selectedClient) : false}
        canManageAttachments={selectedClient ? canManageAttachment(selectedClient, 'anexo_recibo_reinf') : false}
        canManageContratosSociais={selectedClient ? canManageContratoSocial(selectedClient) : false}
        onAnexoSuccess={handleAnexoSuccess}
        onAnexoRemove={handleAnexoRemove}
        onAnexoError={handleAnexoError}
        onContratoSocialSuccess={handleContratoSocialSuccess}
        historicoRows={historicoCliente}
        historicoLoading={historicoClienteLoading}
        reinfRelatorios={reinfRelatorios}
      />
    ),
    reinf: (
      <ReinfPage
        clients={activeClients}
        responsavelOptions={responsavelCatalogo}
        reinfRelatorios={reinfRelatorios}
        onView={openClient}
        onSaveReport={salvarRelatorioReinf}
        onSendEmail={enviarEmailReinf}
        supabaseStatus={supabaseStatus}
        metadata={metadata}
        statusLabel={supabaseStatusLabel}
        statusTone={supabaseStatusTone}
        onRefresh={refreshSupabaseData}
        loading={supabaseRefreshing || supabaseBootstrapping}
        searchContext={reinfSearchContext}
        onClearSearchContext={() => setReinfSearchContext(null)}
      />
    ),
    ecd: (
      <EcdEcfPage
        clients={activeClients}
        onView={openClient}
        canManageAttachments={canManageAttachment}
        canEditDeliveryDate={(client, fieldKey = 'data_entrega_ecd') => canWritePortalData && canViewClient(currentUserFull, client) && canEditClientField(currentUserFull, fieldKey)}
        onQuickUpdate={quickUpdateClient}
        onAnexoSuccess={handleAnexoSuccess}
        onAnexoRemove={handleAnexoRemove}
        onAnexoError={handleAnexoError}
        supabaseStatus={supabaseStatus}
        metadata={metadata}
        statusLabel={supabaseStatusLabel}
        statusTone={supabaseStatusTone}
        onRefresh={refreshSupabaseData}
        loading={supabaseRefreshing || supabaseBootstrapping}
        searchContext={ecdSearchContext}
        onClearSearchContext={() => setEcdSearchContext(null)}
      />
    ),
    relatorios: can(currentUserFull, PERMISSIONS.REPORTS_VIEW)
      ? (
        <ReportsPage
          clients={activeClients}
          filteredClients={filteredActiveClients}
          reinfRelatorios={reinfRelatorios}
          onExportXlsx={exportXlsx}
          onExportCsv={exportCsv}
          onExportPdf={exportPdf}
          onDeleteReinfReport={excluirRelatorioReinf}
          canExport={canExportReports}
          canDeleteReinfReports={
            canWritePortalData
              && [
                ACCESS_PROFILE_KEYS.COORDINATOR_ADMIN,
                ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL,
              ].includes(currentUserFull?.perfil_acesso)
          }
          supabaseStatus={supabaseStatus}
          metadata={metadata}
          statusLabel={supabaseStatusLabel}
          statusTone={supabaseStatusTone}
          onRefresh={refreshSupabaseData}
          loading={supabaseRefreshing || supabaseBootstrapping}
        />
      )
      : <AccessDeniedPage />,
    usuarios: can(currentUserFull, PERMISSIONS.USERS_MANAGE)
      ? (
        <Suspense fallback={<PageLoadingFallback label="Carregando gestão de usuários..." />}>
          <LazyUsersPage
            users={security.usuarios.map(sanitizeUser)}
            onEdit={(user) => {
              if (!ensureSupabaseWriteReady('editar o usuário')) return;
              setEditingUser(security.usuarios.find((item) => item.id === user.id));
            }}
            onToggleStatus={toggleUserStatus}
            responsavelOptions={responsavelCatalogo}
            responsavelBusy={responsavelCatalogoBusy}
            onCreateResponsavel={createResponsavelCatalogo}
            onToggleResponsavel={toggleResponsavelCatalogo}
            onDeleteResponsavel={deleteResponsavelCatalogo}
            onUploadResponsavelSignature={uploadResponsavelSignature}
            onRemoveResponsavelSignature={removeResponsavelSignature}
            getResponsavelSignatureUrl={gerarUrlPublicaAssinaturaResponsavel}
            profileLabelByKey={Object.fromEntries(
              Object.entries(ACCESS_PROFILES).map(([key, profile]) => [key, profile.label]),
            )}
            chipClass={chipClass}
            formatDateTime={formatDateTime}
          />
        </Suspense>
      )
      : <AccessDeniedPage />,
    historico: can(currentUserFull, PERMISSIONS.HISTORY_VIEW)
      ? (
        <Suspense fallback={<PageLoadingFallback label="Carregando histórico..." />}>
          <LazyHistoryPage
            history={security.historico_alteracoes}
            users={security.usuarios.map(sanitizeUser)}
            formatDateTime={formatDateTime}
            getFieldLabel={getFieldLabel}
            valueOrDash={valueOrDash}
            fieldDefinitions={FIELD_DEFINITIONS}
            canDelete={canDeleteHistory && canWritePortalData}
            onDeleteSelected={deleteHistoricoSelecionado}
          />
        </Suspense>
      )
      : <AccessDeniedPage />,
  }[page] ?? <AccessDeniedPage />;

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xlsm,.xls"
        className="hidden"
        onChange={handleImport}
      />
      <AppShell
        page={page}
        setPage={setPage}
        onImportClick={() => {
          if (!ensureSupabaseWriteReady('abrir a importação')) return;
          importInputRef.current?.click();
        }}
        metadata={metadata}
        totalClientes={activeClients.length}
        currentUser={currentUser}
        onLogout={() => logout()}
        canImport={can(currentUserFull, PERMISSIONS.IMPORT_EXCEL)}
        canImportEnabled={can(currentUserFull, PERMISSIONS.IMPORT_EXCEL) && canWritePortalData}
        importDisabledReason={writeBlockedReason}
        supabaseStatus={supabaseStatus}
        supabaseStatusLabel={supabaseStatusLabel}
        supabaseStatusTone={supabaseStatusTone}
        writeBlockedMessage={writeBlockedMessage}
      >
        <PageContentErrorBoundary
          resetKey={page}
          pageLabel={NAV_ITEMS.find((item) => item.key === page)?.label ?? page}
        >
          {content}
        </PageContentErrorBoundary>
      </AppShell>
      {editingClient ? (
        <ClientModal
          client={editingClient}
          listagens={listagens}
          onClose={() => setEditingClient(null)}
          onSave={saveClient}
          canEditFieldForClient={(fieldKey) => !editingClient.id || canEditClientField(currentUserFull, fieldKey)}
          canManageContratosSociais={editingClient?.id ? canManageContratoSocial(editingClient) : false}
          onAnexoSuccess={handleAnexoSuccess}
          onAnexoRemove={handleAnexoRemove}
          onAnexoError={handleAnexoError}
          onContratoSocialSuccess={handleContratoSocialSuccess}
        />
      ) : null}
      {editingUser ? (
        <UserModal
          user={editingUser}
          users={security.usuarios}
          onClose={() => setEditingUser(null)}
          onSave={saveUser}
        />
      ) : null}
      {importPreview ? (
        <ImportPreviewModal
          preview={importPreview}
          busy={importBusy}
          onCancel={() => setImportPreview(null)}
          onConfirm={confirmarImportacaoExcel}
        />
      ) : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
