import assert from 'node:assert/strict';

const anonKey = 'anon-manual-test-key';
const serviceRoleKey = 'service-role-manual-test-key';
const internalApiKey = 'internal-api-manual-test-key';
const userToken = 'portal-user-access-token';
const authUserId = '11111111-1111-4111-8111-111111111111';
const portalUserId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';
const clientIds = [
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
];

const environment = new Map([
  ['SUPABASE_URL', 'https://project.supabase.co'],
  ['SUPABASE_ANON_KEY', anonKey],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
  ['CHECKLIST_AUTOMACAO_INTERNAL_KEY', internalApiKey],
]);

let handler;
globalThis.Deno = {
  env: { get: (name) => environment.get(name) },
  serve: (candidate) => { handler = candidate; },
};

const manualTest = await import(
  '../supabase/functions/executar-checklist-automacao-teste/index.ts'
);
assert.equal(typeof handler, 'function');

const normalized = manualTest.validateManualTestPayload({
  competencia_referencia: '2026-09-01',
  cliente_ids: [clientIds[1], clientIds[0], clientIds[1]],
  chave_requisicao: 'manual-test-request',
});
assert.deepEqual(normalized.clientIds, clientIds);
assert.throws(
  () => manualTest.validateManualTestPayload({
    competencia_referencia: '2026-09-02',
    cliente_ids: clientIds,
    chave_requisicao: 'manual-test-request',
  }),
  /AAAA-MM-01/,
);
assert.throws(
  () => manualTest.validateManualTestPayload({
    competencia_referencia: '2026-09-01',
    cliente_ids: Array.from(
      { length: 11 },
      (_, index) => `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
    ),
    chave_requisicao: 'manual-test-request',
  }),
  /maximo 10/,
);

const originalFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  throw new Error('Nao deveria chamar servicos sem sessao.');
};

const unauthorized = await handler(new Request('https://manual-test.example.com', {
  method: 'POST',
  body: '{}',
}));
assert.equal(unauthorized.status, 401);
assert.equal(calls.length, 0);

calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  calls.push({ url: address, options, body });

  if (address.endsWith('/auth/v1/user')) {
    assert.equal(options.headers.apikey, anonKey);
    assert.equal(options.headers.Authorization, `Bearer ${userToken}`);
    return Response.json({ id: authUserId });
  }
  if (address.includes('/rest/v1/usuarios?')) {
    assert.equal(new URL(address).searchParams.get('auth_user_id'), `eq.${authUserId}`);
    return Response.json([{
      id: portalUserId,
      nome: 'Setor Contabil',
      email: 'contabil@example.com',
      status: 'Ativo',
      perfil_acesso: 'setor_contabil_operacional',
    }]);
  }
  if (address.endsWith('/rpc/preparar_checklist_automacao_teste_interno')) {
    assert.equal(options.headers.apikey, serviceRoleKey);
    assert.equal(options.headers.Authorization, `Bearer ${serviceRoleKey}`);
    assert.equal(body.p_competencia_referencia, '2026-09-01');
    assert.deepEqual(body.p_cliente_ids, clientIds);
    assert.equal(body.p_chave_requisicao, 'request-from-header');
    assert.equal(body.p_iniciado_por, portalUserId);
    return Response.json({
      persistido: true,
      duplicado: false,
      automacao_global_pausada: true,
      execucao: { id: executionId, total_clientes: 2, total_trabalhos: 2 },
      resumo: { total_clientes: 2, preparados: 2 },
    });
  }
  if (address.endsWith('/functions/v1/processar-checklist-automacao')) {
    assert.equal(options.headers.apikey, internalApiKey);
    assert.equal(options.headers.Authorization, `Bearer ${internalApiKey}`);
    assert.equal(body.execucao_id, executionId);
    assert.equal(body.limite, 2);
    return Response.json({
      ok: true,
      direcionada: true,
      execucao_id: executionId,
      reservados: 2,
      enviados: 2,
      falhas: 0,
      resultados: [],
    });
  }
  throw new Error(`URL inesperada: ${address}`);
};

const success = await handler(new Request('https://manual-test.example.com', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${userToken}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': 'request-from-header',
  },
  body: JSON.stringify({
    competencia_referencia: '2026-09-01',
    cliente_ids: [clientIds[1], clientIds[0]],
  }),
}));
const successBody = await success.json();
assert.equal(success.status, 200);
assert.equal(successBody.ok, true);
assert.equal(successBody.execucao_id, executionId);
assert.deepEqual(successBody.cliente_ids, clientIds);
assert.equal(successBody.solicitado_por.id, portalUserId);
assert.equal(successBody.processamento.enviados, 2);
assert.equal(calls.length, 4);

calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  calls.push({ url: address, options });
  if (address.endsWith('/auth/v1/user')) {
    return Response.json({ id: authUserId });
  }
  if (address.includes('/rest/v1/usuarios?')) {
    return Response.json([{
      id: portalUserId,
      status: 'Inativo',
      perfil_acesso: 'setor_contabil_operacional',
    }]);
  }
  throw new Error(`URL inesperada na negacao: ${address}`);
};

const forbidden = await handler(new Request('https://manual-test.example.com', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${userToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    competencia_referencia: '2026-09-01',
    cliente_ids: clientIds,
    chave_requisicao: 'manual-test-request',
  }),
}));
assert.equal(forbidden.status, 403);
assert.equal(calls.length, 2);

globalThis.fetch = originalFetch;
console.log('executar-checklist-automacao-teste: OK');
