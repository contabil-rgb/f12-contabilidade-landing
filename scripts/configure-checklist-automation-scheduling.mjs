import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const projectRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (!projectRef) throw new Error('Projeto Supabase vinculado nao encontrado.');

const supabaseCli = process.platform === 'win32'
  ? 'node_modules/@supabase/cli-windows-x64/bin/supabase.exe'
  : 'node_modules/@supabase/cli-linux-x64/bin/supabase';
const apiKeysResult = execFileSync(
  supabaseCli,
  ['projects', 'api-keys', '--project-ref', projectRef, '-o', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
);
const apiKeys = JSON.parse(apiKeysResult);
const internalKey = apiKeys.find((item) => (
  item.type === 'legacy' && item.name === 'service_role'
))?.api_key;
if (!internalKey) throw new Error('Chave service_role do projeto nao encontrada.');
if (/\r|\n/.test(internalKey)) throw new Error('Formato inesperado da chave interna.');

const quoteSql = (value) => `'${value.replaceAll("'", "''")}'`;
const projectUrl = `https://${projectRef}.supabase.co`;
const sql = `
do $block$
declare
  v_id uuid;
begin
  select id into v_id
  from vault.secrets
  where name = 'checklist_automacao_project_url'
  order by updated_at desc
  limit 1;

  if v_id is null then
    perform vault.create_secret(
      ${quoteSql(projectUrl)},
      'checklist_automacao_project_url',
      'URL usada pelos agendamentos internos do checklist'
    );
  else
    perform vault.update_secret(
      v_id,
      ${quoteSql(projectUrl)},
      'checklist_automacao_project_url',
      'URL usada pelos agendamentos internos do checklist'
    );
  end if;

  select id into v_id
  from vault.secrets
  where name = 'checklist_automacao_internal_key'
  order by updated_at desc
  limit 1;

  if v_id is null then
    perform vault.create_secret(
      ${quoteSql(internalKey)},
      'checklist_automacao_internal_key',
      'Chave interna usada apenas pelo pg_cron para invocar Edge Functions do checklist'
    );
  else
    perform vault.update_secret(
      v_id,
      ${quoteSql(internalKey)},
      'checklist_automacao_internal_key',
      'Chave interna usada apenas pelo pg_cron para invocar Edge Functions do checklist'
    );
  end if;
end;
$block$;
`;

const temporaryId = randomUUID();
const temporarySecrets = join(tmpdir(), `checklist-secrets-${temporaryId}.env`);
const temporarySql = join(tmpdir(), `checklist-vault-${temporaryId}.sql`);
try {
  writeFileSync(
    temporarySecrets,
    `CHECKLIST_AUTOMACAO_INTERNAL_KEY=${internalKey}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  execFileSync(
    supabaseCli,
    [
      'secrets',
      'set',
      '--env-file',
      temporarySecrets,
      '--project-ref',
      projectRef,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );

  writeFileSync(temporarySql, sql, { encoding: 'utf8', mode: 0o600 });
  execFileSync(
    supabaseCli,
    ['db', 'query', '--linked', '--file', temporarySql],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
} finally {
  rmSync(temporarySecrets, { force: true });
  rmSync(temporarySql, { force: true });
}

console.log('Credenciais do agendamento configuradas sem gravar valores no repositorio.');
