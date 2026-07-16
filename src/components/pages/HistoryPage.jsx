import { History } from 'lucide-react';
import DataTableShell from '../ui/DataTableShell';
import SurfacePanel from '../ui/SurfacePanel';

export default function HistoryPage({
  history,
  users,
  formatDateTime,
  getFieldLabel,
  valueOrDash,
  fieldDefinitions,
}) {
  const usersById = new Map(users.map((user) => [user.id, user]));

  return (
    <SurfacePanel
      title="Histórico de alterações"
      description="Registros automáticos dos campos sensíveis e operacionais definidos."
      headerClassName="border-b border-slate-200"
    >
      <DataTableShell
        headers={['Data', 'Usuário', 'Cliente', 'Campo', 'Valor anterior', 'Valor novo', 'Tipo de ação']}
        minWidth="min-w-[1020px] xl:min-w-[1400px]"
        hasRows={history.length > 0}
        emptyTitle="Nenhuma alteração registrada ainda."
      >
        <tbody>
          {history.map((item) => (
            <tr key={item.id} className="table-row">
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
