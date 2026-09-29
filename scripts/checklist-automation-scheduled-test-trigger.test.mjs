import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260929100000_checklist_automacao_teste_agendado_acionamento.sql', import.meta.url),
  'utf8',
);
const disableScript = readFileSync(
  new URL('../supabase/checklist-automacao-teste-agendado-desativar.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /processar-checklist-automacao-agendada-teste/);
assert.match(migration, /'\* \* \* \* \*'/);
assert.match(migration, /c\.modo = 'TESTE'/);
assert.match(migration, /c\.ativa = false/);
assert.match(migration, /a\.disponivel_em <= now\(\)/);
assert.match(migration, /a\.reserva_expira_em <= now\(\)/);
assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
assert.doesNotMatch(migration, /update\s+public\.checklist_automacao_configuracao/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.checklist_automacao_agendamentos_teste/i);
assert.doesNotMatch(migration, /sb_secret_|eyJhbGci/i);
assert.match(disableScript, /checklist-automacao-teste-agendado-manaus/);
assert.match(disableScript, /cron\.unschedule/);
assert.doesNotMatch(disableScript, /delete\s+from|drop\s+table|truncate/i);

console.log('acionamento do teste agendado: OK');

