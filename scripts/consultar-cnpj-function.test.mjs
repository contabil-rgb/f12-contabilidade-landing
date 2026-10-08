import assert from 'node:assert/strict';
import test from 'node:test';
import { CnpjLookupError } from '../supabase/functions/_shared/cnpj-company.ts';

const anonKey = 'anon-cnpj-test-key';
const userToken = 'portal-user-access-token';
const authUserId = '11111111-1111-4111-8111-111111111111';
const portalUserId = '22222222-2222-4222-8222-222222222222';
const validCnpj = '98765432000198';

const environment = new Map([
  ['SUPABASE_URL', 'https://project.supabase.co'],
  ['SUPABASE_ANON_KEY', anonKey],
]);

globalThis.Deno = {
  env: { get: (name) => environment.get(name) },
  serve: () => {},
};

const { createConsultarCnpjHandler } = await import(
  '../supabase/functions/consultar-cnpj/index.ts'
);

function request(body = { cnpj: validCnpj }, headers = {}) {
  return new Request('https://project.supabase.co/functions/v1/consultar-cnpj', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function authenticatedFetch(userOverrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const address = String(url);
    calls.push({ address, options });
    if (address.endsWith('/auth/v1/user')) {
      assert.equal(options.headers.apikey, anonKey);
      assert.equal(options.headers.Authorization, `Bearer ${userToken}`);
      return Response.json({ id: authUserId });
    }
    if (address.includes('/rest/v1/usuarios?')) {
      const query = new URL(address).searchParams;
      assert.equal(query.get('auth_user_id'), `eq.${authUserId}`);
      assert.equal(query.get('select'), 'id,status,perfil_acesso');
      return Response.json([{
        id: portalUserId,
        status: 'Ativo',
        perfil_acesso: 'setor_contabil_operacional',
        ...userOverrides,
      }]);
    }
    throw new Error(`URL inesperada: ${address}`);
  };
  return { fetchImpl, calls };
}

test('recusa metodo inadequado e solicitacao sem sessao', async () => {
  let calls = 0;
  const handler = createConsultarCnpjHandler({
    fetchImpl: async () => { calls += 1; return Response.json({}); },
  });

  const method = await handler(new Request('https://example.com', { method: 'GET' }));
  assert.equal(method.status, 405);

  const unauthorized = await handler(new Request('https://example.com', {
    method: 'POST',
    body: '{}',
  }));
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);
});

test('recusa sessao expirada e colaborador sem permissao', async () => {
  const expiredHandler = createConsultarCnpjHandler({
    fetchImpl: async () => new Response('{}', { status: 401 }),
  });
  const expired = await expiredHandler(request());
  assert.equal(expired.status, 401);

  for (const user of [
    { status: 'Inativo' },
    { perfil_acesso: 'somente_consulta' },
  ]) {
    const auth = authenticatedFetch(user);
    const handler = createConsultarCnpjHandler({ fetchImpl: auth.fetchImpl });
    const forbidden = await handler(request());
    assert.equal(forbidden.status, 403);
    assert.equal(auth.calls.length, 2);
  }
});

test('valida JSON e digitos verificadores antes de chamar o provedor', async () => {
  const auth = authenticatedFetch();
  let providerCalls = 0;
  const handler = createConsultarCnpjHandler({
    fetchImpl: auth.fetchImpl,
    provider: {
      name: 'mock',
      lookup: async () => { providerCalls += 1; return {}; },
    },
  });

  const invalidJson = await handler(request('{invalid-json'));
  assert.equal(invalidJson.status, 400);

  const invalidCnpj = await handler(request({ cnpj: '98.765.432/0001-99' }));
  const invalidBody = await invalidCnpj.json();
  assert.equal(invalidCnpj.status, 400);
  assert.equal(invalidBody.code, 'CNPJ_INVALIDO');
  assert.equal(providerCalls, 0);
});

test('retorna somente o contrato interno em uma consulta autorizada', async () => {
  const auth = authenticatedFetch();
  const company = {
    cnpj: validCnpj,
    razaoSocial: 'Empresa F12 Ltda',
    nomeFantasia: 'F12',
    nomeIdentificacao: 'F12',
    provedor: 'CNPJ.ws',
    atualizadoEm: '2026-10-01T00:00:00Z',
  };
  const handler = createConsultarCnpjHandler({
    fetchImpl: auth.fetchImpl,
    provider: {
      name: 'mock',
      lookup: async (cnpj) => {
        assert.equal(cnpj, validCnpj);
        return company;
      },
    },
  });

  const result = await handler(request({ cnpj: '98.765.432/0001-98' }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, empresa: company });
  assert.equal(auth.calls.length, 2);
});

test('traduz falhas conhecidas sem expor detalhes internos', async () => {
  const cases = [
    ['CNPJ_NAO_ENCONTRADO', 404, false],
    ['LIMITE_CONSULTAS', 429, true],
    ['TEMPO_ESGOTADO', 503, true],
    ['PROVEDOR_INDISPONIVEL', 503, true],
    ['RESPOSTA_INVALIDA', 502, false],
  ];

  for (const [code, status, retryable] of cases) {
    const auth = authenticatedFetch();
    const handler = createConsultarCnpjHandler({
      fetchImpl: auth.fetchImpl,
      provider: {
        name: 'mock',
        lookup: async () => {
          throw new CnpjLookupError(code, 'Mensagem segura.', {
            provider: 'mock',
            retryable,
            cause: new Error('detalhe interno'),
          });
        },
      },
    });
    const result = await handler(request());
    const body = await result.json();
    assert.equal(result.status, status);
    assert.deepEqual(body, { error: 'Mensagem segura.', code, retryable });
    assert.equal(JSON.stringify(body).includes('detalhe interno'), false);
    if (code === 'LIMITE_CONSULTAS') assert.equal(result.headers.get('Retry-After'), '60');
  }
});

test('trata indisponibilidade da autenticacao sem consultar o provedor', async () => {
  let providerCalls = 0;
  const handler = createConsultarCnpjHandler({
    fetchImpl: async () => { throw new TypeError('network failure'); },
    provider: {
      name: 'mock',
      lookup: async () => { providerCalls += 1; return {}; },
    },
  });
  const result = await handler(request());
  const body = await result.json();
  assert.equal(result.status, 503);
  assert.equal(body.code, 'AUTENTICACAO_INDISPONIVEL');
  assert.equal(providerCalls, 0);
});
