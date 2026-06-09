import { sincronizarClientesRows } from './importacao.service';

export async function carregarSnapshotClientesLocal() {
  const module = await import('../data/baseContabilidade.js');
  const rows = module?.clientesContabeis ?? [];

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('Snapshot local de clientes vazio ou indisponivel.');
  }

  return rows.map((row) => ({ ...row }));
}

export async function reaplicarSnapshotClientesLocal(options = {}) {
  const { transformRow } = options;
  const snapshotRows = await carregarSnapshotClientesLocal();
  const preparedRows = typeof transformRow === 'function'
    ? snapshotRows.map((row) => transformRow(row))
    : snapshotRows;

  return sincronizarClientesRows(preparedRows, 'snapshot-administrativo-local');
}
