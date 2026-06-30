import { sincronizarClientesRows } from './importacao.service';

function snapshotToolsEnabled() {
  return String(import.meta.env.VITE_ENABLE_LOCAL_SNAPSHOT_TOOLS ?? '').trim().toLowerCase() === 'true';
}

function isLocalMaintenanceHost() {
  const hostname = String(globalThis?.location?.hostname ?? '').trim().toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export async function carregarSnapshotClientesLocal() {
  if (!snapshotToolsEnabled() || !isLocalMaintenanceHost()) {
    throw new Error('Snapshot local bloqueado fora do ambiente local de manutenção habilitado.');
  }

  const module = await import('../data/baseContabilidade.js');
  const rows = module?.clientesContabeis ?? [];

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('Snapshot local de clientes vazio ou indisponível.');
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
