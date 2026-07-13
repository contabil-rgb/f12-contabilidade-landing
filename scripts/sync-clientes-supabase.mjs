import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { normalizeClienteRowForSync } from '../src/lib/clientes-sync.js';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env.local');
const SNAPSHOT_PATH = path.join(ROOT, 'local-data', 'baseContabilidade.js');
const APPLY_MODE = process.argv.includes('--apply');
const BATCH_SIZE = 200;

function readEnvLocal() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

function uniqueByCnpj(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.cnpj) continue;
    map.set(row.cnpj, row);
  }
  return [...map.values()];
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function run() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Snapshot local nao encontrado em ${SNAPSHOT_PATH}. Gere o arquivo com: node scripts/import-base-contabilidade.mjs`);
  }

  const env = readEnvLocal();
  const urlRaw = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!urlRaw || !key) {
    throw new Error('Variaveis ausentes em .env.local: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  const url = String(urlRaw).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const supabase = createClient(url, key);
  const { clientesContabeis = [] } = await import(pathToFileURL(SNAPSHOT_PATH).href);

  const rows = uniqueByCnpj(clientesContabeis.map((row) => normalizeClienteRowForSync(row)).filter(Boolean));
  console.log(`[sync-clientes] clientes validos para upsert: ${rows.length}`);

  if (!APPLY_MODE) {
    console.log('[sync-clientes] dry-run ativo. Nada foi gravado.');
    console.log('[sync-clientes] execute com --apply para persistir no Supabase.');
    return;
  }

  let processed = 0;
  for (const part of chunk(rows, BATCH_SIZE)) {
    const { error } = await supabase
      .from('clientes')
      .upsert(part, { onConflict: 'cnpj' });
    if (error) throw new Error(`Falha no upsert: ${error.message}`);
    processed += part.length;
    console.log(`[sync-clientes] processados ${processed}/${rows.length}`);
  }

  const { count, error: countError } = await supabase
    .from('clientes')
    .select('id', { count: 'exact', head: true });
  if (countError) throw new Error(`Nao foi possivel validar contagem: ${countError.message}`);
  console.log(`[sync-clientes] concluido. total atual em public.clientes: ${count ?? 0}`);
}

run().catch((error) => {
  console.error(`[sync-clientes] erro: ${error.message}`);
  process.exit(1);
});
