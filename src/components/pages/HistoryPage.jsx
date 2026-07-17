import { useEffect, useMemo, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import DataTableShell from '../ui/DataTableShell';
import SurfacePanel from '../ui/SurfacePanel';

export default function HistoryPage({
  history = [],
  users = [],
  formatDateTime,
  getFieldLabel,
  valueOrDash,
  fieldDefinitions,
  canDelete = false,
  onDeleteSelected,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const selectableIds = useMemo(() => history.map((item) => item.id).filter(Boolean), [history]);
  const selectedCount = selectedIds.length;
  const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;

  useEffect(() => {
    const availableIds = new Set(selectableIds);
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [selectableIds]);

  function toggleAll() {
    setSelectedIds(allSelected ? [] : selectableIds);
  }

  function toggleOne(id) {
    if (!id) return;
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  }

  async function handleDeleteSelected() {
    if (!canDelete || !selectedCount || deleting) return;
    const confirmed = window.confirm(
      selectedCount === 1
        ? 'Excluir o registro selecionado do historico? Esta acao nao pode ser desfeita.'
        : `Excluir ${selectedCount} registros selecionados do historico? Esta acao nao pode ser desfeita.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const deleted = await onDeleteSelected?.(selectedIds);
      if (deleted !== false) {
        setSelectedIds([]);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SurfacePanel
      title="Histórico de alterações"
      description="Registros automáticos dos campos sensíveis e operacionais definidos."
      headerClassName="border-b border-slate-200"
      right={canDelete ? (
        <button
          type="button"
          onClick={handleDeleteSelected}
          disabled={!selectedCount || deleting}
          className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:border-rose-400/40 dark:hover:bg-rose-500/15"
        >
          <Trash2 size={16} aria-hidden="true" />
          {deleting ? 'Excluindo...' : selectedCount ? `Excluir selecionados (${selectedCount})` : 'Excluir selecionados'}
        </button>
      ) : null}
    >
      <DataTableShell
        headers={[
          ...(canDelete ? ['Selecionar'] : []),
          'Data',
          'Usuário',
          'Cliente',
          'Campo',
          'Valor anterior',
          'Valor novo',
          'Tipo de ação',
        ]}
        minWidth={canDelete ? 'min-w-[1120px] xl:min-w-[1480px]' : 'min-w-[1020px] xl:min-w-[1400px]'}
        hasRows={history.length > 0}
        emptyTitle="Nenhuma alteração registrada ainda."
        renderHeadCell={(header) => (
          header === 'Selecionar' ? (
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!selectableIds.length}
              aria-label="Selecionar todos os registros do histórico"
              onChange={toggleAll}
              className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue dark:border-gray-600"
            />
          ) : header
        )}
      >
        <tbody>
          {history.map((item) => (
            <tr key={item.id} className="table-row">
              {canDelete ? (
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    aria-label={`Selecionar registro de ${item.cliente_nome || 'cliente sem nome'}`}
                    onChange={() => toggleOne(item.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue dark:border-gray-600"
                  />
                </td>
              ) : null}
              <td className="table-cell table-cell-muted">{formatDateTime(item.data_alteracao)}</td>
              <td className="table-cell">{usersById.get(item.usuario_id)?.nome ?? item.usuario_nome ?? 'Usuário removido'}</td>
              <td className="table-cell table-cell-strong">{item.cliente_nome}</td>
              <td className="table-cell">{getFieldLabel(fieldDefinitions, item.campo_alterado)}</td>
              <td className="table-cell">{valueOrDash(item.valor_anterior)}</td>
              <td className="table-cell">{valueOrDash(item.valor_novo)}</td>
              <td className="table-cell">{item.tipo_acao}</td>
            </tr>
          ))}
        </tbody>
      </DataTableShell>

      {!history.length ? (
        <div className="-mt-24 p-10 text-center">
          <History className="mx-auto text-slate-300" size={42} aria-hidden="true" />
        </div>
      ) : null}
    </SurfacePanel>
  );
}
