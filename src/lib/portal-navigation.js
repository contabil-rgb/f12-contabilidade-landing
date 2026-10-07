export const PORTAL_NAVIGATION_QUERY_KEYS = Object.freeze({
  page: 'pagina',
  checklistView: 'aba',
  clientId: 'cliente',
});

export const PORTAL_HISTORY_STATE_KEY = '__portalNavigation';

const DEFAULT_BASE_URL = 'http://portal.local/';
const DEFAULT_ROUTE = Object.freeze({
  page: 'dashboard',
  checklistView: 'checklist',
  clientId: null,
});

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
  const cleaned = cleanValue(value);
  if (!cleaned) return DEFAULT_ROUTE.page;
  if (Object.hasOwn(INTERNAL_PAGE_TO_PUBLIC, cleaned)) return cleaned;
  return PUBLIC_PAGE_TO_INTERNAL[cleaned] ?? DEFAULT_ROUTE.page;
}

function normalizeChecklistView(value) {
  const cleaned = cleanValue(value);
  if (!cleaned) return DEFAULT_ROUTE.checklistView;
  if (Object.hasOwn(INTERNAL_CHECKLIST_VIEW_TO_PUBLIC, cleaned)) return cleaned;
  return PUBLIC_CHECKLIST_VIEW_TO_INTERNAL[cleaned] ?? DEFAULT_ROUTE.checklistView;
}

export function normalizePortalRoute(route = {}) {
  let page = normalizePage(route.page);
  const clientId = cleanValue(route.clientId);
  const checklistView = normalizeChecklistView(route.checklistView);

  if (page === 'detalhe' && !clientId) page = 'clientes';

  return {
    page,
    checklistView: page === 'checklist' ? checklistView : DEFAULT_ROUTE.checklistView,
    clientId: page === 'detalhe' ? clientId : null,
  };
}

export function buildPortalUrl(route, source = DEFAULT_BASE_URL) {
  const normalized = normalizePortalRoute(route);
  const url = toUrl(source);
  const { page: pageKey, checklistView: checklistViewKey, clientId: clientIdKey } = PORTAL_NAVIGATION_QUERY_KEYS;

  url.searchParams.delete(pageKey);
  url.searchParams.delete(checklistViewKey);
  url.searchParams.delete(clientIdKey);

  url.searchParams.set(pageKey, INTERNAL_PAGE_TO_PUBLIC[normalized.page]);
  if (normalized.page === 'checklist') {
    url.searchParams.set(checklistViewKey, INTERNAL_CHECKLIST_VIEW_TO_PUBLIC[normalized.checklistView]);
  }
  if (normalized.page === 'detalhe') {
    url.searchParams.set(clientIdKey, normalized.clientId);
  }

  return relativeUrl(url);
}

export function readPortalRoute(source = DEFAULT_BASE_URL) {
  const url = toUrl(source);
  const requestedPage = cleanValue(url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.page));
  const requestedChecklistView = cleanValue(url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.checklistView));
  const requestedClientId = cleanValue(url.searchParams.get(PORTAL_NAVIGATION_QUERY_KEYS.clientId));
  const route = normalizePortalRoute({
    page: requestedPage,
    checklistView: requestedChecklistView,
    clientId: requestedClientId,
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
  return (
    normalizedLeft.page === normalizedRight.page
    && normalizedLeft.checklistView === normalizedRight.checklistView
    && normalizedLeft.clientId === normalizedRight.clientId
  );
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

