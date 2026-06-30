import { normalizeClienteRowForSync } from '../lib/clientes-sync.js';
import { supabase } from '../lib/supabase';

const BATCH_SIZE = 200;

async function workbookFromBuffer(buffer, source) {
  const { workbookFromArrayBuffer } = await import('../lib/excel.js');
  return workbookFromArrayBuffer(buffer, source);
}

function toBatch(items, size = BATCH_SIZE) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function existingCnpjSet(cnpjs) {
  if (!cnpjs.length) return new Set();
  const { data, error } = await supabase
    .from('clientes')
    .select('cnpj')
    .in('cnpj', cnpjs);
  if (error) {
    throw new Error(`Falha ao consultar CNPJs existentes: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => String(row.cnpj ?? '').trim()));
}

export async function sincronizarClientesRows(rows, sourceLabel = 'sincronização', options = {}) {
  const apply = options.apply !== false;
  const errors = [];
  const preparedRows = [];
  let ignored = 0;

  for (const row of rows) {
    const prepared = normalizeClienteRowForSync(row);
    if (!prepared) {
      ignored += 1;
      continue;
    }
    preparedRows.push(prepared);
  }

  const uniqueMap = new Map();
  preparedRows.forEach((row) => uniqueMap.set(row.cnpj, row));
  const dedupedRows = [...uniqueMap.values()];

  if (!dedupedRows.length) {
    return {
      ok: false,
      summary: {
        source: sourceLabel,
        totalLinhasLidas: rows.length,
        totalConsideradas: 0,
        criados: 0,
        atualizados: 0,
        ignorados: ignored,
        erros: 1,
      },
      errors: ['Nenhum cliente válido para importação (CNPJ e Razão Social são obrigatórios).'],
      rows: [],
    };
  }

  const cnpjList = dedupedRows.map((row) => row.cnpj);
  const existed = await existingCnpjSet(cnpjList);
  const created = dedupedRows.filter((row) => !existed.has(row.cnpj)).length;
  const updated = dedupedRows.length - created;

  if (apply) {
    for (const batch of toBatch(dedupedRows)) {
      const { error } = await supabase
        .from('clientes')
        .upsert(batch, { onConflict: 'cnpj' });
      if (error) {
        errors.push(`Falha ao gravar lote (${batch.length} registros): ${error.message}`);
        break;
      }
    }
  }

  return {
    ok: errors.length === 0,
    summary: {
      source: sourceLabel,
      apply,
      totalLinhasLidas: rows.length,
      totalConsideradas: dedupedRows.length,
      criados: errors.length ? 0 : created,
      atualizados: errors.length ? 0 : updated,
      ignorados: ignored + (preparedRows.length - dedupedRows.length),
      erros: errors.length,
    },
    errors,
    rows: dedupedRows,
  };
}

export async function importarClientesExcel(arrayBuffer, fileName = 'importacao.xlsx') {
  const payload = await workbookFromBuffer(arrayBuffer, fileName);
  const result = await sincronizarClientesRows(payload.clientes ?? [], fileName, { apply: true });
  return {
    ...result,
    payload,
  };
}

export async function previsualizarImportacaoExcel(arrayBuffer, fileName = 'importacao.xlsx') {
  const payload = await workbookFromBuffer(arrayBuffer, fileName);
  const result = await sincronizarClientesRows(payload.clientes ?? [], fileName, { apply: false });
  return {
    ...result,
    payload,
  };
}
