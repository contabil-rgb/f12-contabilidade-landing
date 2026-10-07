export const PORTAL_NAVIGATION_QUERY_KEYS = Object.freeze({
  page: 'pagina',
  checklistView: 'aba',
  clientId: 'cliente',
  checklistYear: 'ano',
  checklistMonth: 'mes',
  historyPage: 'historico_pagina',
  historyPageSize: 'historico_por_pagina',
});

export const PORTAL_CLIENT_FILTER_QUERY_KEYS = Object.freeze({
  search: 'busca',
  arquivamento: 'status_cliente',
  alerta: 'alerta',
  tipo_cliente: 'tipo_cliente',
  grupo_empresarial: 'grupo',
  regime_tributario: 'regime',
  atividades: 'atividade',
  responsavel: 'responsavel',
  revisor: 'revisor',
  situacao: 'situacao',
  competencia_em_dia: 'competencia',
  dificuldade: 'dificuldade',
  ecd: 'ecd',
  ecf: 'ecf',
  envio_reinf: 'reinf',
  distribuicao_lucros: 'lucros',
});

export const PORTAL_HISTORY_STATE_KEY = '__portalNavigation';

const DEFAULT_BASE_URL = 'http://portal.local/';
const HISTORY_PAGE_SIZES = new Set([10, 25, 50]);
const CLIENT_STATUS_FILTERS = new Set(['inicio_contrato', 'ativos', 'em_distrato', 'arquivados']);

function currentCompetence() {
  const current = new Date();
  return { year: current.getFullYear(), month: current.getMonth() + 1 };
}

function defaultRoute() {
  const competence = currentCompetence();
  return {
    page: 'dashboard',
    checklistView: 'checklist',
    clientId: null,
    checklistYear: competence.year,
    checklistMonth: competence.month,
    historyPage: 1,
    historyPageSize: 25,
    clientFilters: {},
  };
}

const PUBLIC_PAGE_TO_INTERNAL = Object.freeze({
  dashboard: 'dashboard',
  clientes: 'clientes',
  cliente: 'detalhe',
  reinf: 'reinf',
  ecd: 'ecd',
  checklist: 'checklist',
  relatorios: 'relatorios',
  usuarios: 'usuarios',
  historico: 'historico',
});

const INTERNAL_PAGE_TO_PUBLIC = Object.freeze(
  Object.fromEntries(Object.entries(PUBLIC_PAGE_TO_INTERNAL).map(([publicPage, internalPage]) => [internalPage, publicPage])),
);

const PUBLIC_CHECKLIST_VIEW_TO_INTERNAL = Object.freeze({
  checklist: 'checklist',
  catalogo: 'catalog',
  historico: 'history',
  automacao: 'automation',
});

const INTERNAL_CHECKLIST_VIEW_TO_PUBLIC = Object.freeze(
  Object.fromEntries(
    Object.entries(PUBLIC_CHECKLIST_VIEW_TO_INTERNAL)
      .map(([publicView, internalView]) => [internalView, publicView]),
  ),
);

function toUrl(source = DEFAULT_BASE_URL) {
  if (source instanceof URL) return new URL(source.href);
  return new URL(String(source || DEFAULT_BASE_URL), DEFAULT_BASE_URL);
}

function relativeUrl(url) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function cleanValue(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || null;
}

function normalizePage(value) {
  const defaults = defaultRoute();
  const cleaned = cleanValue(value);
  if (!cleaned) return defaults.page;
  if (Object.hasOwn(INTERNAL_PAGE_TO_PUBLIC, cleaned)) return cleaned;
  return PUBLIC_PAGE_TO_INTERNAL[cleaned] ?? defaults.page;
}

function normalizeChecklistView(value) {
  const defaults = defaultRoute();
  const cleaned = cleanValue(value);
  if (!cleaned) return defaults.checklistView;
  if (Object.hasOwn(INTERNAL_CHECKLIST_VIEW_TO_PUBLIC, cleaned)) return cleaned;
  return PUBLIC_CHECKLIST_VIEW_TO_INTERNAL[cleaned] ?? defaults.checklistView;
}

function normalizeInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function normalizeClientFilters(filters = {}) {
  return Object.fromEntries(
    Object.keys(PORTAL_CLIENT_FILTER_QUERY_KEYS)
      .map((key) => [key, cleanValue(filters?.[key])])
      .filter(([key, value]) => {
        if (value === null) return false;
        if (key !== 'arquivamento') return true;
        return CLIENT_STATUS_FILTERS.has(value);
      }),
  );
}

export function normalizePortalRoute(route = {}) {
  const defaults = defaultRoute();
  let page = normalizePage(route.page);
  const clientId = cleanValue(route.clientId);
  const checklistView = normalizeChecklistView(route.checklistView);
  const checklistYear = normalizeInteger(route.checklistYear, defaults.checklistYear, {
    min: defaults.checklistYear - 2,
    max: defaults.checklistYear + 2,
  });
  const checklistMonth = normalizeInteger(route.checklistMonth, defaults.checklistMonth, { min: 1, max: 12 });
  const historyPage = normalizeInteger(route.historyPage, defaults.historyPage);
  const requestedHistoryPageSize = normalizeInteger(route.historyPageSize, defaults.historyPageSize);
  const historyPageSize = HISTORY_PAGE_SIZES.has(requestedHistoryPageSize)
    ? requestedHistoryPageSize
    : defaults.historyPageSize;

  if (page === 'detalhe' && !clientId) page = 'clientes';

  return {
    page,
    checklistView: page === 'checklist' ? checklistView : defaults.checklistView,
    clientId: page === 'detalhe' ? clientId : null,
    checklistYear,
    checklistMonth,
    historyPage,
    historyPageSize,
    clientFilters: page === 'clientes' ? normalizeClientFilters(route.clientFilters) : {},
  };
}

export function buildPortalUrl(route, source = DEFAULT_BASE_URL) {
  const normalized = normalizePortalRoute(route);
  const url = toUrl(source);
  const {
    page: pageKey,
    checklistView: checklistViewKey,
    clientId: clientIdKey,
    checklistYear: checklistYearKey,
    checklistMonth: checklistMonthKey,
    historyPage: historyPageKey,
    historyPageSize: historyPageSizeKey,
  } = PORTAL_NAVIGATION_QUERY_KEYS;

  [
    pageKey,
    checklistViewKey,
    clientIdKey,
    checklistYearKey,
    checklistMonthKey,
    historyPageKey,
    historyPageSizeKey,
    ...Object.values(PORTAL_CLIENT_FILTER_QUERY_KEYS),
  ].forEach((key) => url.searchParams.delete(key));

  url.searchParams.set(pageKey, INTERNAL_PAGE_TO_PUBLIC[normalized.page]);
  if (normalized.page === 'checklist') {
    url.searchParams.set(checklistViewKey, INTERNAL_CHECKLIST_VIEW_TO_PUBLIC[normalized.checklistView]);
    if (['checklist', 'catalog'].includes(normalized.checklistView)) {
      url.searchParams.set(checklistYearKey, String(normalized.checklistYear));
      url.searchParams.set(checklistMonthKey, String(normalized.checklistMonth));
    }
    if (normalized.checklistView === 'history') {
      url.searchParams.set(historyPageKey, String(normalized.historyPage));
      url.searchParams.set(historyPageSizeKey, String(normalized.historyPageSize));
    }
  }
  if (normalized.page === 'detalhe') {
    url.searchParams.set(clientIdKey, normalized.clientId);
  }
  if (normalized.page === 'clientes') {
    Object.entries(normalized.clientFilters).forEach(([key, value]) => {
      url.searchParams.set(PORTAL_CLIENT_FILTER_QUERY_KEYS[key], value);
    });
  }

  return relativeUrl(url);
}

export function readPortalRoute(source = DEFAULT_BASE_URL) {
  const url = toUrl(source);
  const requestedPage = cleanValue(url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.page));
  const requestedChecklistView = cleanValue(url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.checklistView));
  const requestedClientId = cleanValue(url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.clientId));
  const clientFilters = Object.fromEntries(
    Object.entries(PORTAL_CLIENT_FILTER_QUERY_KEYS)
      .map(([key, queryKey]) => [key, url.searchParams.get(queryKey)]),
  );
  const route = normalizePortalRoute({
    page: requestedPage,
    checklistView: requestedChecklistView,
    clientId: requestedClientId,
    checklistYear: url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.checklistYear),
    checklistMonth: url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.checklistMonth),
    historyPage: url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.historyPage),
    historyPageSize: url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.historyPageSize),
    clientFilters,
  });
  const canonicalUrl = buildPortalUrl(route, url);

  return {
    route,
    canonicalUrl,
    needsNormalization: canonicalUrl !== relativeUrl(url),
    requested: {
      page: requestedPage,
      checklistView: requestedChecklistView,
      clientId: requestedClientId,
    },
  };
}

export function samePortalRoute(left, right) {
  const normalizedLeft = normalizePortalRoute(left);
  const normalizedRight = normalizePortalRoute(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export function createPortalHistoryState(route, currentState = null) {
  const baseState = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
    ? currentState
    : {};

  return {
    ...baseState,
    [PORTAL_HISTORY_STATE_KEY]: {
      version: 1,
      route: normalizePortalRoute(route),
    },
  };
}

export function isPortalHistoryEntry(state) {
  return Boolean(
    state
    && typeof state === 'object'
    && state[PORTAL_HISTORY_STATE_KEY]?.version === 1,
  );
}

export function writePortalRoute(windowObject, route, { replace = false } = {}) {
  if (!windowObject?.history || !windowObject?.location?.href) {
    throw new TypeError('Uma janela com history e location é obrigatória para atualizar a navegação.');
  }

  const normalized = normalizePortalRoute(route);
  const targetUrl = buildPortalUrl(normalized, windowObject.location.href);
  const currentRoute = readPortalRoute(windowObject.location.href).route;
  const shouldReplace = replace || samePortalRoute(currentRoute, normalized);
  const method = shouldReplace ? 'replaceState' : 'pushState';
  const state = createPortalHistoryState(normalized, windowObject.history.state);

  windowObject.history[method](state, '', targetUrl);

  return {
    route: normalized,
    url: targetUrl,
    mode: shouldReplace ? 'replace' : 'push',
  };
}

export function readPortalRouteFromPopState(event, source = DEFAULT_BASE_URL) {
  const resolved = readPortalRoute(source);
  return {
    ...resolved,
    isPortalEntry: isPortalHistoryEntry(event?.state),
  };
}

