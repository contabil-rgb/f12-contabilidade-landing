import assert from 'node:assert/strict';

const serviceRoleKey = 'service-role-coordinator-test';
const environment = new Map([
  ['SUPABASE_URL', 'https://project.supabase.co'],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
]);

let handler;
globalThis.Deno = {
  env: { get: (name) => environment.get(name) },
  serve: (candidate) => { handler = candidate; },
};

const coordinator = await import('../supabase/functions/coordenar-checklist-automacao/index.ts');
assert.equal(typeof handler, 'function');
assert.equal(coordinator.parseTimeToMinutes('08:00:00'), 480);
assert.equal(
  coordinator.getZonedDateTime(new Date('2026-09-02T12:00:00Z')).date,
  '2026-09-02',
);
const scheduledLocal = coordinator.getZonedDateTime(new Date('2026-09-02T12:00:00Z'));
assert.equal(coordinator.getCoordinationBlock(scheduledLocal, '2026-09-03', 480), 'FORA_DA_DATA');
assert.equal(coordinator.getCoordinationBlock(scheduledLocal, '2026-09-02', 481), 'ANTES_DO_HORARIO');
assert.equal(coordinator.getCoordinationBlock(scheduledLocal, '2026-09-02', 480), null);

const originalFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  throw new Error('Nao deveria chamar servicos sem autorizacao.');
};

const unauthorized = await handler(new Request('https://coordinator.example.com', {
  method: 'POST',
  headers: { Authorization: 'Bearer invalid-key' },
  body: '{}',
}));
assert.equal(unauthorized.status, 403);
assert.equal(calls.length, 0);

calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  calls.push({ url: address, options });
  if (address.includes('/rest/v1/checklist_automacao_configuracao?')) {
    return Response.json([{
      ativa: false,
      modo: 'TESTE',
      fuso_horario: 'America/Manaus',
      horario_local: '08:00:00',
    }]);
  }
  throw new Error(`URL inesperada durante pausa: ${address}`);
};

const paused = await handler(new Request('https://coordinator.example.com', {
  method: 'POST',
  headers: { Authorization: `Bearer ${serviceRoleKey}` },
  body: '{}',
}));
const pausedBody = await paused.json();
assert.equal(paused.status, 200);
assert.equal(pausedBody.pausada, true);
assert.equal(calls.length, 1);

const nowInManaus = coordinator.getZonedDateTime(new Date());
const preparationResult = {
  persistido: true,
  duplicado: false,
  execucao: { id: '33333333-3333-4333-8333-333333333333' },
};
calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  calls.push({ url: address, options, body });

  if (address.includes('/rest/v1/checklist_automacao_configuracao?')) {
    return Response.json([{
      ativa: true,
      modo: 'TESTE',
      fuso_horario: 'America/Manaus',
      horario_local: '00:00:00',
    }]);
  }
  if (address.endsWith('/rpc/checklist_segundo_dia_util_manaus')) {
    assert.equal(body.p_ano, nowInManaus.year);
    assert.equal(body.p_mes, nowInManaus.month);
    return Response.json(nowInManaus.date);
  }
  if (address.endsWith('/rpc/preparar_checklist_automacao_interno')) {
    assert.equal(body.p_competencia_referencia, nowInManaus.competence);
    assert.equal(body.p_acionamento, 'AGENDADO');
    assert.equal(
      body.p_chave_idempotencia,
      `checklist:${nowInManaus.competence.slice(0, 7)}:teste:agendado`,
    );
    return Response.json(preparationResult);
  }
  if (address.endsWith('/functions/v1/processar-checklist-automacao')) {
    assert.equal(body.limite, 3);
    return Response.json({ ok: true, reservados: 0, enviados: 0, falhas: 0 });
  }
  throw new Error(`URL inesperada: ${address}`);
};

const coordinated = await handler(new Request('https://coordinator.example.com', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ limite: 3 }),
}));
const coordinatedBody = await coordinated.json();
assert.equal(coordinated.status, 200);
assert.equal(coordinatedBody.ok, true);
assert.equal(coordinatedBody.pausada, false);
assert.deepEqual(coordinatedBody.preparacao, preparationResult);
assert.equal(coordinatedBody.processamento.ok, true);
assert.equal(calls.length, 4);

globalThis.fetch = originalFetch;
console.log('coordenar-checklist-automacao: OK');
