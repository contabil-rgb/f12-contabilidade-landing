import assert from 'node:assert/strict';

const serviceRoleKey = 'service-role-test-key';
const environment = new Map([
  ['SUPABASE_URL', 'https://project.supabase.co'],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
  ['RESEND_API_KEY', 'resend-test-key'],
  ['CHECKLIST_EMAIL_FROM', 'F12 <contabil@example.com>'],
  ['CHECKLIST_EMAIL_BCC', 'auditoria@example.com'],
  ['CHECKLIST_AUTOMACAO_ASSINATURA', 'Setor Contabil'],
]);

let handler;
globalThis.Deno = {
  env: { get: (name) => environment.get(name) },
  serve: (candidate) => { handler = candidate; },
};

const helpers = await import('../supabase/functions/_shared/checklist-automation-email.ts');
await import('../supabase/functions/processar-checklist-automacao/index.ts');

assert.equal(typeof handler, 'function');

const items = [
  { ano: 2026, mes: 2, item_descricao: 'Extrato & relatorio' },
  { ano: 2026, mes: 1, item_descricao: 'Folha <mensal>' },
  { ano: 2026, mes: 1, item_descricao: 'Folha <mensal>' },
];
const groups = helpers.groupChecklistItems(items);
assert.equal(groups.length, 2);
assert.equal(groups[0].month, 1);
assert.deepEqual(groups[0].items, ['Folha <mensal>']);

const email = helpers.buildChecklistAutomationEmail({
  modo: 'TESTE',
  destinatario_original: 'cliente@example.com',
  assunto: '[TESTE] Lembrete',
  itens_cobrados: items,
});
assert.match(email.text, /01\/2026/);
assert.match(email.text, /02\/2026/);
assert.match(email.html, /Folha &lt;mensal&gt;/);
assert.match(email.html, /Extrato &amp; relatorio/);
assert.equal(helpers.isTransientResendStatus(429), true);
assert.equal(helpers.isTransientResendStatus(503), true);
assert.equal(helpers.isTransientResendStatus(422), false);

const originalFetch = globalThis.fetch;

let externalCalls = [];
globalThis.fetch = async (url, options = {}) => {
  externalCalls.push({ url: String(url), options });
  throw new Error('A chamada nao deveria ocorrer sem autorizacao.');
};

const unauthorized = await handler(new Request('https://worker.example.com', {
  method: 'POST',
  headers: { Authorization: 'Bearer invalid-key' },
  body: '{}',
}));
assert.equal(unauthorized.status, 403);
assert.equal(externalCalls.length, 0);

const work = {
  id: '11111111-1111-4111-8111-111111111111',
  token_reserva: '22222222-2222-4222-8222-222222222222',
  chave_idempotencia: 'checklist:test:cliente',
  tentativa_atual: 1,
  modo: 'TESTE',
  cliente_nome: 'Cliente Teste',
  destinatario_original: 'cliente@example.com',
  destinatario_efetivo: 'teste@example.com',
  cc_efetivo: 'copia@example.com',
  assunto: '[TESTE] Lembrete Contabil',
  itens_cobrados: items,
};

externalCalls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  externalCalls.push({ url: address, options, body });

  if (address.endsWith('/rpc/reservar_checklist_automacao_trabalhos_interno')) {
    return Response.json({ quantidade: 1, trabalhos: [work] });
  }
  if (address.endsWith('/rpc/iniciar_checklist_automacao_envio_interno')) {
    return Response.json({ adquirido: true, ja_enviado: false });
  }
  if (address === 'https://api.resend.com/emails') {
    assert.equal(options.headers['Idempotency-Key'], work.chave_idempotencia);
    assert.deepEqual(body.to, ['teste@example.com']);
    assert.deepEqual(body.cc, ['copia@example.com']);
    assert.deepEqual(body.bcc, ['auditoria@example.com']);
    assert.match(body.html, /Envio de teste/);
    return Response.json({ id: 'resend-test-id' });
  }
  if (address.endsWith('/rpc/finalizar_checklist_automacao_trabalho_interno')) {
    assert.equal(body.p_status, 'ENVIADO');
    assert.equal(body.p_resultado.email_resend_id, 'resend-test-id');
    return Response.json({ duplicado: false, nova_tentativa: false });
  }
  throw new Error(`URL inesperada: ${address}`);
};

const success = await handler(new Request('https://worker.example.com', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ limite: 1 }),
}));
assert.equal(success.status, 200);
const successBody = await success.json();
assert.equal(successBody.ok, true);
assert.equal(successBody.reservados, 1);
assert.equal(successBody.enviados, 1);
assert.equal(successBody.falhas, 0);

externalCalls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  externalCalls.push({ url: address, options, body });

  if (address.endsWith('/rpc/reservar_checklist_automacao_trabalhos_interno')) {
    return Response.json({ quantidade: 1, trabalhos: [work] });
  }
  if (address.endsWith('/rpc/iniciar_checklist_automacao_envio_interno')) {
    return Response.json({ adquirido: true, ja_enviado: false });
  }
  if (address === 'https://api.resend.com/emails') {
    return Response.json({ message: 'Limite temporario' }, { status: 429 });
  }
  if (address.endsWith('/rpc/finalizar_checklist_automacao_trabalho_interno')) {
    assert.equal(body.p_status, 'FALHOU');
    assert.equal(body.p_resultado.erro_transitorio, true);
    assert.equal(body.p_resultado.erro_codigo, 'RESEND_HTTP_429');
    return Response.json({ nova_tentativa: true, proxima_tentativa: 2 });
  }
  throw new Error(`URL inesperada: ${address}`);
};

const retry = await handler(new Request('https://worker.example.com', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ limite: 1 }),
}));
const retryBody = await retry.json();
assert.equal(retryBody.ok, true);
assert.equal(retryBody.enviados, 0);
assert.equal(retryBody.falhas, 1);
assert.equal(retryBody.resultados[0].finalizacao.nova_tentativa, true);

globalThis.fetch = originalFetch;
console.log('processar-checklist-automacao: OK');
