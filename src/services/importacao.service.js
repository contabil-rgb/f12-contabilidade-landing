import { mergeClienteRowForImport, normalizeClienteRowForSync } from '../lib/clientes-sync.js';
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

function hasValue(value) {
  return value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '');
}

function sameValue(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

async function existingClientsMap(cnpjs) {
  const existing = new Map();
  for (const batch of toBatch(cnpjs)) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .in('cnpj', batch);
    if (error) {
      throw new Error(`Falha ao consultar CNPJs existentes: ${error.message}`);
    }
    (data ?? []).forEach((row) => existing.set(String(row.cnpj ?? '').trim(), row));
  }
  return existing;
}

export async function sincronizarClientesRows(rows, sourceLabel = 'sincronização', options = {}) {
  const apply = options.apply !== false;
  const importedFields = options.importedFields ?? [];
  const invalidRowsCount = Number(options.invalidRowsCount ?? 0);
  const duplicateRowsCount = Number(options.duplicateRowsCount ?? 0);
  const totalRowsRead = Number(options.totalRowsRead ?? rows.length);
  const errors = [];
  const normalizedRows = [];
  let ignored = 0;

  for (const row of rows) {
    const prepared = normalizeClienteRowForSync(row);
    if (!prepared) {
      ignored += 1;
      continue;
    }
    normalizedRows.push({ source: row, normalized: prepared });
  }

  const uniqueMap = new Map();
  normalizedRows.forEach((entry) => uniqueMap.set(entry.normalized.cnpj, entry));
  const dedupedEntries = [...uniqueMap.values()];

  if (!dedupedEntries.length) {
    return {
      ok: false,
      summary: {
        source: sourceLabel,
        totalLinhasLidas: totalRowsRead,
        totalConsideradas: 0,
        criados: 0,
        atualizados: 0,
        ignorados: ignored + invalidRowsCount,
        invalidos: invalidRowsCount,
        duplicados: duplicateRowsCount,
        erros: 1,
      },
      errors: ['Nenhum cliente válido para importação (CNPJ e Razão Social são obrigatórios).'],
      rows: [],
    };
  }

  const cnpjList = dedupedEntries.map((entry) => entry.normalized.cnpj);
  const existing = await existingClientsMap(cnpjList);
  const dedupedRows = dedupedEntries.map((entry) => mergeClienteRowForImport(
    entry.source,
    existing.get(entry.normalized.cnpj),
    importedFields,
  ));
  const created = dedupedRows.filter((row) => !existing.has(row.cnpj)).length;
  const updated = dedupedRows.length - created;
  const changedFields = new Set();
  let changedValues = 0;
  let preservedBlankValues = 0;
  dedupedEntries.forEach((entry, index) => {
    const previous = existing.get(entry.normalized.cnpj);
    if (!previous) return;
    importedFields.forEach((field) => {
      if (['cnpj', 'atualizado_em'].includes(field)) return;
      if (!hasValue(entry.source?.[field])) {
        if (hasValue(previous[field])) preservedBlankValues += 1;
        return;
      }
      if (!sameValue(previous[field], dedupedRows[index]?.[field])) {
        changedValues += 1;
        changedFields.add(field);
      }
    });
  });
  let appliedRows = 0;

  if (apply) {
    for (const batch of toBatch(dedupedRows)) {
      const { error } = await supabase
        .from('clientes')
        .upsert(batch, { onConflict: 'cnpj' });
      if (error) {
        errors.push(`Falha ao gravar lote (${batch.length} registros): ${error.message}`);
        break;
      }
      appliedRows += batch.length;
    }
  }

  return {
    ok: errors.length === 0,
    summary: {
      source: sourceLabel,
      apply,
      totalLinhasLidas: totalRowsRead,
      totalConsideradas: dedupedRows.length,
      criados: errors.length ? 0 : created,
      atualizados: errors.length ? 0 : updated,
      ignorados: ignored + invalidRowsCount + (normalizedRows.length - dedupedRows.length),
      invalidos: invalidRowsCount,
      duplicados: duplicateRowsCount,
      camposAlterados: [...changedFields],
      valoresAlterados: changedValues,
      valoresVaziosPreservados: preservedBlankValues,
      aplicados: apply ? appliedRows : 0,
      parcial: apply && errors.length > 0 && appliedRows > 0,
      erros: errors.length,
    },
    errors,
    rows: dedupedRows,
  };
}

export async function importarClientesExcel(arrayBuffer, fileName = 'importacao.xlsx') {
  const payload = await workbookFromBuffer(arrayBuffer, fileName);
  const result = await sincronizarClientesRows(payload.clientes ?? [], fileName, {
    apply: true,
    importedFields: payload.metadata?.importedFields,
    invalidRowsCount: payload.metadata?.invalidRowsCount,
    duplicateRowsCount: payload.metadata?.duplicateRowsCount,
    totalRowsRead: payload.metadata?.totalRowsRead,
  });
  return {
    ...result,
    payload,
  };
}

export async function previsualizarImportacaoExcel(arrayBuffer, fileName = 'importacao.xlsx') {
  const payload = await workbookFromBuffer(arrayBuffer, fileName);
  const result = await sincronizarClientesRows(payload.clientes ?? [], fileName, {
    apply: false,
    importedFields: payload.metadata?.importedFields,
    invalidRowsCount: payload.metadata?.invalidRowsCount,
    duplicateRowsCount: payload.metadata?.duplicateRowsCount,
    totalRowsRead: payload.metadata?.totalRowsRead,
  });
  return {
    ...result,
    payload,
  };
}
