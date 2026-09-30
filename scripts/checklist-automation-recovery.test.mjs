import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260930100000_checklist_automacao_recuperacao_mensal.sql', import.meta.url),
  'utf8',
);
assert.match(migration, /'checklist-automacao-coordenador-manaus'[\s\S]*?'\*\/5 12-15 \* \* \*'/);
assert.match(migration, /'checklist-automacao-worker-manaus'[\s\S]*?'\* 12-16 \* \* \*'/);
assert.match(migration, /registrar_checklist_automacao_recuperacao_interno/);
assert.match(migration, /from public, anon, authenticated/);
assert.match(migration, /to service_role/);

const realDate = globalThis.Date;
let fixedInstant = '2026-09-02T12:15:00Z';
globalThis.Date = class extends realDate {
  constructor(value) {
    super(value === undefined ? fixedInstant : value);
  }

  static now() {
    return new realDate(fixedInstant).getTime();
  }
};

const serviceRoleKey = 'service-role-recovery-test';
const internalApiKey = 'internal-api-recovery-test';
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
await import('../supabase/functions/coordenar-checklist-automacao/index.ts');

const originalFetch = globalThis.fetch;
const executionId = '33333333-3333-4333-8333-333333333333';
let duplicate = false;
let calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  calls.push({ address, body });

  if (address.includes('/rest/v1/checklist_automacao_configuracao?')) {
    return Response.json([{
      ativa: true,
      modo: 'TESTE',
      fuso_horario: 'America/Manaus',
      horario_local: '08:00:00',
    }]);
  }
  if (address.endsWith('/rpc/checklist_segundo_dia_util_manaus')) {
    return Response.json('2026-09-02');
  }
  if (address.endsWith('/rpc/preparar_checklist_automacao_interno')) {
    return Response.json({
      persistido: true,
      duplicado: duplicate,
      execucao: { id: executionId },
    });
  }
  if (address.endsWith('/rpc/registrar_checklist_automacao_recuperacao_interno')) {
    assert.equal(body.p_execucao_id, executionId);
    assert.equal(body.p_atraso_minutos, 15);
    return Response.json({ registrado: true, execucao_id: executionId, atraso_minutos: 15 });
  }
  if (address.endsWith('/functions/v1/processar-checklist-automacao')) {
    return Response.json({ ok: true, enviados: 0, falhas: 0 });
  }
  throw new Error(`URL inesperada: ${address}`);
};

const request = () => new Request('https://coordinator.example.com', {
  method: 'POST',
  headers: { apikey: internalApiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ limite: 10 }),
});

const recovered = await handler(request());
const recoveredBody = await recovered.json();
assert.equal(recovered.status, 200);
assert.equal(recoveredBody.recuperacao, true);
assert.equal(recoveredBody.atraso_minutos, 15);
assert.equal(recoveredBody.registro_recuperacao.registrado, true);
assert.ok(
  calls.findIndex((call) => call.address.includes('registrar_checklist_automacao_recuperacao_interno'))
    < calls.findIndex((call) => call.address.includes('/functions/v1/processar-checklist-automacao')),
);

duplicate = true;
calls = [];
const repeated = await handler(request());
const repeatedBody = await repeated.json();
assert.equal(repeatedBody.recuperacao, true);
assert.equal(repeatedBody.registro_recuperacao, null);
assert.equal(calls.some((call) => call.address.includes('registrar_checklist_automacao_recuperacao_interno')), false);
assert.equal(calls.filter((call) => call.address.includes('/functions/v1/processar-checklist-automacao')).length, 1);

fixedInstant = '2026-09-02T16:00:00Z';
calls = [];
const expired = await handler(request());
const expiredBody = await expired.json();
assert.equal(expiredBody.janela_recuperacao_encerrada, true);
assert.equal(calls.length, 2);
assert.equal(calls.some((call) => call.address.includes('/rpc/preparar_checklist_automacao_interno')), false);

globalThis.fetch = originalFetch;
globalThis.Date = realDate;
console.log('recuperacao mensal da automacao: OK');
