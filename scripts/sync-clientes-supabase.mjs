import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { clientesContabeis } from '../src/data/baseContabilidade.js';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env.local');
const APPLY_MODE = process.argv.includes('--apply');
const BATCH_SIZE = 200;

const DB_FIELDS = [
  'cnpj',
  'razao_social',
  'nome_identificacao',
  'tipo_cliente',
  'regime_tributario',
  'atividades',
  'responsavel',
  'revisor',
  'situacao',
  'competencia_em_dia',
  'dias_atraso',
  'distribuicao_lucros',
  'envio_reinf',
  'data_enviada_reinf',
  'valor_lucro_acumulado',
  'ecd',
  'ultima_ecd_entregue',
  'data_entrega_ecd',
  'data_envio_ecd',
  'responsavel_ecd',
  'ecf',
  'ultima_ecf_entregue',
  'pendencia_tecnica',
  'cliente_notificado',
  'proxima_acao',
  'status',
];

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

function normalizeText(value) {
  const raw = String(value ?? '').trim();
  return raw || null;
}

function normalizeCnpj(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length !== 14) return null;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function parseDateBrOrIso(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function parseMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntSafe(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function toClienteRow(row) {
  const mapped = {
    cnpj: normalizeCnpj(row.cnpj),
    razao_social: normalizeText(row.razao_social),
    nome_identificacao: normalizeText(row.nome_identificacao),
    tipo_cliente: normalizeText(row.tipo_cliente),
    regime_tributario: normalizeText(row.regime_tributario),
    atividades: normalizeText(row.atividades),
    responsavel: normalizeText(row.responsavel),
    revisor: normalizeText(row.revisor),
    situacao: normalizeText(row.situacao),
    competencia_em_dia: normalizeText(row.competencia_em_dia),
    dias_atraso: parseIntSafe(row.dias_atraso),
    distribuicao_lucros: normalizeText(row.distribuicao_lucros),
    envio_reinf: normalizeText(row.envio_reinf),
    data_enviada_reinf: parseDateBrOrIso(row.data_enviada_reinf),
    valor_lucro_acumulado: parseMoney(row.valor_lucro_acumulado),
    ecd: normalizeText(row.ecd),
    ultima_ecd_entregue: normalizeText(row.ultima_ecd_entregue),
    data_entrega_ecd: parseDateBrOrIso(row.data_entrega_ecd),
    data_envio_ecd: parseDateBrOrIso(row.data_envio_ecd),
    responsavel_ecd: normalizeText(row.responsavel_ecd),
    ecf: normalizeText(row.ecf),
    ultima_ecf_entregue: normalizeText(row.ultima_ecf_entregue),
    pendencia_tecnica: normalizeText(row.pendencia_tecnica),
    cliente_notificado: normalizeText(row.cliente_notificado),
    proxima_acao: normalizeText(row.proxima_acao),
    status: 'Ativo',
  };

  if (!mapped.cnpj || !mapped.razao_social) return null;
  const out = {};
  for (const key of DB_FIELDS) out[key] = mapped[key] ?? null;
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
  const env = readEnvLocal();
  const urlRaw = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!urlRaw || !key) {
    throw new Error('Variaveis ausentes em .env.local: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  const url = String(urlRaw).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const supabase = createClient(url, key);

  const rows = uniqueByCnpj(clientesContabeis.map(toClienteRow).filter(Boolean));
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
