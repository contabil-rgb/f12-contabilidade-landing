import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CnpjLookupError,
  consultarEmpresaPorCnpj,
} from '../supabase/functions/_shared/cnpj-company.ts';
import { createCnpjWsProvider } from '../supabase/functions/_shared/cnpj-ws-provider.ts';

const validCnpj = '98765432000198';

function response(body, status = 200) {
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

async function expectLookupError(promise, code, retryable) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof CnpjLookupError, true);
    assert.equal(error.code, code);
    if (retryable !== undefined) assert.equal(error.retryable, retryable);
    return true;
  });
}

test('normaliza o contrato e prefere o nome fantasia', async () => {
  let requestedUrl = '';
  const provider = createCnpjWsProvider({
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.equal(options?.method, 'GET');
      assert.equal(options?.headers?.Accept, 'application/json');
      return response({
        razao_social: 'Empresa F12 Servicos Ltda',
        atualizado_em: '2026-10-01T10:00:00Z',
        estabelecimento: {
          cnpj: validCnpj,
          nome_fantasia: 'F12 Servicos',
        },
      });
    },
  });

  const result = await consultarEmpresaPorCnpj('98.765.432/0001-98', provider);
  assert.equal(requestedUrl, `https://publica.cnpj.ws/cnpj/${validCnpj}`);
  assert.deepEqual(result, {
    cnpj: validCnpj,
    razaoSocial: 'Empresa F12 Servicos Ltda',
    nomeFantasia: 'F12 Servicos',
    nomeIdentificacao: 'F12 Servicos',
    provedor: 'CNPJ.ws',
    atualizadoEm: '2026-10-01T10:00:00Z',
  });
});

test('usa a razao social quando o nome fantasia nao existe', async () => {
  const provider = createCnpjWsProvider({
    fetchImpl: async () => response({
      razao_social: 'Empresa Sem Fantasia Ltda',
      estabelecimento: { cnpj: validCnpj, nome_fantasia: null },
    }),
  });

  const result = await consultarEmpresaPorCnpj(validCnpj, provider);
  assert.equal(result.nomeFantasia, '');
  assert.equal(result.nomeIdentificacao, 'Empresa Sem Fantasia Ltda');
  assert.equal(result.atualizadoEm, null);
});

test('padroniza CNPJ nao encontrado e limite de consultas', async () => {
  const notFound = createCnpjWsProvider({ fetchImpl: async () => response({}, 404) });
  await expectLookupError(
    consultarEmpresaPorCnpj(validCnpj, notFound),
    'CNPJ_NAO_ENCONTRADO',
    false,
  );

  const rateLimited = createCnpjWsProvider({ fetchImpl: async () => response({}, 429) });
  await expectLookupError(
    consultarEmpresaPorCnpj(validCnpj, rateLimited),
    'LIMITE_CONSULTAS',
    true,
  );
});

test('padroniza tempo esgotado e falha de rede', async () => {
  const timedOut = createCnpjWsProvider({
    timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }),
  });
  await expectLookupError(
    consultarEmpresaPorCnpj(validCnpj, timedOut),
    'TEMPO_ESGOTADO',
    true,
  );

  const networkFailure = createCnpjWsProvider({
    fetchImpl: async () => { throw new TypeError('Network failure'); },
  });
  await expectLookupError(
    consultarEmpresaPorCnpj(validCnpj, networkFailure),
    'PROVEDOR_INDISPONIVEL',
    true,
  );
});

test('rejeita JSON malformado e dados inconsistentes', async () => {
  const malformed = createCnpjWsProvider({
    fetchImpl: async () => response('{not-json'),
  });
  await expectLookupError(
    consultarEmpresaPorCnpj(validCnpj, malformed),
    'RESPOSTA_INVALIDA',
    false,
  );

  const inconsistent = createCnpjWsProvider({
    fetchImpl: async () => response({
      razao_social: '',
      estabelecimento: { cnpj: '12345678000190' },
    }),
  });
  await expectLookupError(
    consultarEmpresaPorCnpj(validCnpj, inconsistent),
    'RESPOSTA_INVALIDA',
    false,
  );
});

test('bloqueia entrada fora do contrato antes de chamar o provedor', async () => {
  let calls = 0;
  const provider = createCnpjWsProvider({
    fetchImpl: async () => {
      calls += 1;
      return response({});
    },
  });

  await expectLookupError(
    consultarEmpresaPorCnpj('123', provider),
    'CNPJ_INVALIDO',
    false,
  );
  assert.equal(calls, 0);
});
