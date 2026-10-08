import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CnpjConsultaError,
  createCnpjConsultaService,
} from '../src/services/cnpj-consulta.core.ts';

const validCnpj = '98765432000198';

function createClient({ session = { access_token: 'token' }, sessionError = null, invoke } = {}) {
  let sessionCalls = 0;
  let invokeCalls = 0;
  const client = {
    auth: {
      async getSession() {
        sessionCalls += 1;
        return { data: { session }, error: sessionError };
      },
    },
    functions: {
      async invoke(name, options) {
        invokeCalls += 1;
        if (invoke) return invoke(name, options);
        return { data: null, error: new Error('invoke nao configurado') };
      },
    },
  };
  return {
    client,
    counts: () => ({ sessionCalls, invokeCalls }),
  };
}

async function expectCode(promise, code, retryable) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof CnpjConsultaError, true);
    assert.equal(error.code, code);
    if (retryable !== undefined) assert.equal(error.retryable, retryable);
    assert.equal(Boolean(error.message), true);
    return true;
  });
}

test('rejeita CNPJ invalido antes de consultar sessao ou funcao', async () => {
  const mocked = createClient();
  const service = createCnpjConsultaService(mocked.client);
  await expectCode(service.consultar('98.765.432/0001-99'), 'CNPJ_INVALIDO', false);
  assert.deepEqual(mocked.counts(), { sessionCalls: 0, invokeCalls: 0 });
});

test('informa sessao ausente ou autenticacao indisponivel', async () => {
  const missing = createClient({ session: null });
  await expectCode(
    createCnpjConsultaService(missing.client).consultar(validCnpj),
    'SESSAO_AUSENTE',
    false,
  );
  assert.deepEqual(missing.counts(), { sessionCalls: 1, invokeCalls: 0 });

  const failed = createClient({ sessionError: new Error('storage failure') });
  await expectCode(
    createCnpjConsultaService(failed.client).consultar(validCnpj),
    'AUTENTICACAO_INDISPONIVEL',
    true,
  );
  assert.equal(failed.counts().invokeCalls, 0);
});

test('invoca a funcao interna com CNPJ sem mascara e normaliza o contrato', async () => {
  const mocked = createClient({
    invoke: async (name, options) => {
      assert.equal(name, 'consultar-cnpj');
      assert.deepEqual(options.body, { cnpj: validCnpj });
      return {
        data: {
          ok: true,
          empresa: {
            cnpj: validCnpj,
            razaoSocial: ' Empresa F12 Ltda ',
            nomeFantasia: '',
            nomeIdentificacao: '',
            provedor: 'CNPJ.ws',
            atualizadoEm: null,
            campoExterno: 'nao deve sair no contrato',
          },
        },
        error: null,
      };
    },
  });

  const result = await createCnpjConsultaService(mocked.client)
    .consultar('98.765.432/0001-98');
  assert.deepEqual(result, {
    cnpj: validCnpj,
    razaoSocial: 'Empresa F12 Ltda',
    nomeFantasia: '',
    nomeIdentificacao: 'Empresa F12 Ltda',
    provedor: 'CNPJ.ws',
    atualizadoEm: null,
  });
  assert.deepEqual(mocked.counts(), { sessionCalls: 1, invokeCalls: 1 });
});

test('traduz erros HTTP da funcao para mensagens do Portal', async () => {
  const cases = [
    ['CNPJ_NAO_ENCONTRADO', 404, false],
    ['LIMITE_CONSULTAS', 429, true],
    ['TEMPO_ESGOTADO', 503, true],
    ['PROVEDOR_INDISPONIVEL', 503, true],
  ];

  for (const [code, status, retryable] of cases) {
    const context = Response.json(
      { error: 'Mensagem tecnica externa', code, retryable },
      { status },
    );
    const mocked = createClient({
      invoke: async () => ({
        data: null,
        error: { message: 'Edge Function returned a non-2xx status code', context },
      }),
    });
    const service = createCnpjConsultaService(mocked.client);
    await expectCode(service.consultar(validCnpj), code, retryable);
  }
});

test('traduz sessao expirada, falta de permissao e falha de rede', async () => {
  for (const [status, code] of [[401, 'SESSAO_EXPIRADA'], [403, 'SEM_PERMISSAO']]) {
    const mocked = createClient({
      invoke: async () => ({
        data: null,
        error: {
          message: 'HTTP error',
          context: Response.json({ error: 'erro tecnico' }, { status }),
        },
      }),
    });
    await expectCode(
      createCnpjConsultaService(mocked.client).consultar(validCnpj),
      code,
      false,
    );
  }

  const network = createClient({
    invoke: async () => { throw new TypeError('network failure'); },
  });
  await expectCode(
    createCnpjConsultaService(network.client).consultar(validCnpj),
    'CONSULTA_INDISPONIVEL',
    true,
  );
});

test('rejeita resposta de sucesso fora do contrato interno', async () => {
  const mocked = createClient({
    invoke: async () => ({
      data: {
        ok: true,
        empresa: { cnpj: validCnpj, razaoSocial: '', provedor: 'CNPJ.ws' },
      },
      error: null,
    }),
  });
  await expectCode(
    createCnpjConsultaService(mocked.client).consultar(validCnpj),
    'RESPOSTA_INVALIDA',
    false,
  );
});
