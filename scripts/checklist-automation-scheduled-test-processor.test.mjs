import assert from 'node:assert/strict';

const serviceRoleKey = 'service-role-test-key';
const internalApiKey = 'internal-api-test-key';
const environment = new Map([
  ['SUPABASE_URL', 'https://project.supabase.co'],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
  ['CHECKLIST_AUTOMACAO_INTERNAL_KEY', internalApiKey],
]);

let handler;
globalThis.Deno = {
  env: { get: (name) => environment.get(name) },
  serve: (candidate) => { handler = candidate; },
};

await import('../supabase/functions/processar-checklist-automacao-agendada-teste/index.ts');
assert.equal(typeof handler, 'function');

const originalFetch = globalThis.fetch;
let calls = [];

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  throw new Error('Nenhuma chamada deve ocorrer sem autorizacao.');
};

const unauthorized = await handler(new Request('https://processor.example.com', {
  method: 'POST',
  headers: { apikey: 'invalid-key' },
  body: '{}',
}));
assert.equal(unauthorized.status, 403);
assert.equal(calls.length, 0);

const scheduleId = '11111111-1111-4111-8111-111111111111';
const reservationToken = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';

calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  calls.push({ url: address, body, headers: options.headers });

  if (address.endsWith('/rpc/reservar_checklist_automacao_agendamentos_teste_interno')) {
    assert.equal(body.p_limite, 1);
    return Response.json({
      quantidade: 1,
      bloqueada: false,
      agendamentos: [{ id: scheduleId, token_reserva: reservationToken }],
    });
  }
  if (address.endsWith('/rpc/preparar_checklist_automacao_agendamento_teste_interno')) {
    assert.equal(body.p_agendamento_id, scheduleId);
    assert.equal(body.p_token_reserva, reservationToken);
    return Response.json({ execucao: { id: executionId } });
  }
  if (address.endsWith('/functions/v1/processar-checklist-automacao')) {
    assert.equal(options.headers.apikey, internalApiKey);
    assert.equal(body.execucao_id, executionId);
    assert.equal(body.limite, 10);
    return Response.json({ ok: true, enviados: 2, falhas: 0 });
  }
  if (address.endsWith('/rpc/finalizar_checklist_automacao_agendamento_teste_interno')) {
    assert.equal(body.p_agendamento_id, scheduleId);
    assert.equal(body.p_resultado.processamento.enviados, 2);
    return Response.json({ ok: true, agendamento: { status: 'CONCLUIDO' } });
  }
  throw new Error(`URL inesperada: ${address}`);
};

const success = await handler(new Request('https://processor.example.com', {
  method: 'POST',
  headers: { apikey: internalApiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ limite_agendamentos: 1, limite_trabalhos: 10 }),
}));
const successBody = await success.json();
assert.equal(success.status, 200);
assert.equal(successBody.ok, true);
assert.equal(successBody.reservados, 1);
assert.equal(successBody.processados, 1);
assert.equal(successBody.falhas, 0);

calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  calls.push({ url: address, body });

  if (address.endsWith('/rpc/reservar_checklist_automacao_agendamentos_teste_interno')) {
    return Response.json({
      bloqueada: false,
      agendamentos: [{ id: scheduleId, token_reserva: reservationToken }],
    });
  }
  if (address.endsWith('/rpc/preparar_checklist_automacao_agendamento_teste_interno')) {
    return Response.json({ message: 'Falha controlada na preparacao.' }, { status: 500 });
  }
  if (address.endsWith('/rpc/finalizar_checklist_automacao_agendamento_teste_interno')) {
    assert.equal(body.p_resultado.erro_codigo, 'PROCESSADOR_AGENDADO');
    return Response.json({ ok: true, agendamento: { status: 'AGENDADO' } });
  }
  throw new Error(`URL inesperada na recuperacao: ${address}`);
};

const recovered = await handler(new Request('https://processor.example.com', {
  method: 'POST',
  headers: { apikey: internalApiKey },
  body: '{}',
}));
const recoveredBody = await recovered.json();
assert.equal(recovered.status, 200);
assert.equal(recoveredBody.falhas, 1);
assert.equal(recoveredBody.resultados[0].erro_codigo, 'PROCESSADOR_AGENDADO');
assert.equal(calls.some((call) => call.url.includes('/functions/v1/')), false);

calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  calls.push({ url: address, options });
  if (address.endsWith('/rpc/reservar_checklist_automacao_agendamentos_teste_interno')) {
    return Response.json({ bloqueada: true, motivo: 'Automacao global nao esta pausada.' });
  }
  throw new Error(`URL inesperada no bloqueio: ${address}`);
};

const blocked = await handler(new Request('https://processor.example.com', {
  method: 'POST',
  headers: { apikey: internalApiKey },
  body: '{}',
}));
const blockedBody = await blocked.json();
assert.equal(blockedBody.ok, true);
assert.equal(blockedBody.bloqueada, true);
assert.equal(blockedBody.reservados, 0);
assert.equal(calls.length, 1);

globalThis.fetch = originalFetch;
console.log('processar-checklist-automacao-agendada-teste: OK');
