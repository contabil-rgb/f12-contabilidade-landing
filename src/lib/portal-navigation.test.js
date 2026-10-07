import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PORTAL_HISTORY_STATE_KEY,
  buildPortalUrl,
  isPortalHistoryEntry,
  normalizePortalRoute,
  readPortalRoute,
  readPortalRouteFromPopState,
  samePortalRoute,
  writePortalRoute,
} from './portal-navigation.js';

function createWindowMock(href) {
  const calls = [];
  const location = { href };
  const history = {
    state: { preserved: true },
    pushState(state, _title, url) {
      calls.push({ method: 'pushState', state, url });
      this.state = state;
      location.href = new URL(url, location.href).href;
    },
    replaceState(state, _title, url) {
      calls.push({ method: 'replaceState', state, url });
      this.state = state;
      location.href = new URL(url, location.href).href;
    },
  };
  return { location, history, calls };
}

test('usa o dashboard e produz URL canônica quando a página não foi informada', () => {
  const result = readPortalRoute('https://portal.exemplo.com/');

  assert.deepEqual(result.route, {
    page: 'dashboard',
    checklistView: 'checklist',
    clientId: null,
  });
  assert.equal(result.canonicalUrl, '/?pagina=dashboard');
  assert.equal(result.needsNormalization, true);
});

test('traduz páginas e subpáginas públicas para os estados internos atuais', () => {
  const result = readPortalRoute('https://portal.exemplo.com/?pagina=checklist&aba=automacao');

  assert.deepEqual(result.route, {
    page: 'checklist',
    checklistView: 'automation',
    clientId: null,
  });
  assert.equal(result.needsNormalization, false);
});

test('normaliza página e subpágina desconhecidas sem manter parâmetros incompatíveis', () => {
  assert.equal(
    readPortalRoute('https://portal.exemplo.com/?pagina=desconhecida&aba=automacao&cliente=123').canonicalUrl,
    '/?pagina=dashboard',
  );
  assert.equal(
    readPortalRoute('https://portal.exemplo.com/?pagina=checklist&aba=invalida').canonicalUrl,
    '/?pagina=checklist&aba=checklist',
  );
});

test('exige identificador para o detalhe e preserva um cliente válido', () => {
  assert.deepEqual(
    readPortalRoute('https://portal.exemplo.com/?pagina=cliente').route,
    { page: 'clientes', checklistView: 'checklist', clientId: null },
  );
  assert.deepEqual(
    readPortalRoute('https://portal.exemplo.com/?pagina=cliente&cliente=abc-123').route,
    { page: 'detalhe', checklistView: 'checklist', clientId: 'abc-123' },
  );
});

test('preserva parâmetros de recuperação e o hash ao gerar outra página', () => {
  const url = buildPortalUrl(
    { page: 'clientes' },
    'https://portal.exemplo.com/?type=recovery&token_hash=segredo&pagina=dashboard#reset',
  );

  assert.equal(url, '/?type=recovery&token_hash=segredo&pagina=clientes#reset');
});

test('reconhece rotas equivalentes depois da normalização', () => {
  assert.equal(samePortalRoute(
    { page: 'cliente', clientId: ' 123 ' },
    { page: 'detalhe', clientId: '123' },
  ), true);
  assert.equal(samePortalRoute(
    { page: 'checklist', checklistView: 'catalogo' },
    { page: 'checklist', checklistView: 'automation' },
  ), false);
  assert.deepEqual(normalizePortalRoute({ page: 'cliente' }), {
    page: 'clientes',
    checklistView: 'checklist',
    clientId: null,
  });
});

test('usa pushState para um destino novo e preserva o estado existente', () => {
  const browser = createWindowMock('https://portal.exemplo.com/?pagina=dashboard');
  const result = writePortalRoute(browser, { page: 'checklist', checklistView: 'history' });

  assert.equal(result.mode, 'push');
  assert.equal(result.url, '/?pagina=checklist&aba=historico');
  assert.equal(browser.calls[0].method, 'pushState');
  assert.equal(browser.calls[0].state.preserved, true);
  assert.equal(browser.calls[0].state[PORTAL_HISTORY_STATE_KEY].route.checklistView, 'history');
});

test('evita entrada duplicada e permite normalização explícita com replaceState', () => {
  const sameTarget = createWindowMock('https://portal.exemplo.com/?pagina=clientes&origem=atalho');
  const duplicate = writePortalRoute(sameTarget, { page: 'clientes' });
  assert.equal(duplicate.mode, 'replace');
  assert.equal(sameTarget.calls[0].method, 'replaceState');
  assert.equal(sameTarget.calls[0].url, '/?origem=atalho&pagina=clientes');

  const missingPage = createWindowMock('https://portal.exemplo.com/');
  const normalized = writePortalRoute(missingPage, { page: 'dashboard' }, { replace: true });
  assert.equal(normalized.mode, 'replace');
  assert.equal(missingPage.calls[0].url, '/?pagina=dashboard');
});

test('interpreta popstate pela URL e identifica entradas criadas pelo portal', () => {
  const state = {
    [PORTAL_HISTORY_STATE_KEY]: {
      version: 1,
      route: { page: 'clientes', checklistView: 'checklist', clientId: null },
    },
  };
  const result = readPortalRouteFromPopState(
    { state },
    'https://portal.exemplo.com/?pagina=clientes',
  );

  assert.equal(isPortalHistoryEntry(state), true);
  assert.equal(result.isPortalEntry, true);
  assert.equal(result.route.page, 'clientes');
});

