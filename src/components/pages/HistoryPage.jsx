import { History } from 'lucide-react';

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
    <section className="surface-card">
      <div className="border-b border-slate-200 p-6">
        <h2 className="text-[1.65rem] font-black tracking-tight text-slate-950">Histórico de alterações</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Registros automáticos dos campos sensíveis e operacionais definidos.</p>
      </div>
      <div className="overflow-auto overflow-soft">
        <table className="min-w-[1400px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50/95 backdrop-blur">
            <tr>
              {['Data', 'Usuário', 'Cliente', 'Campo', 'Valor anterior', 'Valor novo', 'Tipo de ação'].map((header) => (
                <th key={header} className="border-b border-slate-200 px-4 py-4 text-xs font-black uppercase tracking-wide text-slate-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id} className="transition even:bg-slate-50/40 hover:bg-sky-50/60">
                <td className="border-b border-slate-100 px-4 py-4">{formatDateTime(item.data_alteracao)}</td>
                <td className="border-b border-slate-100 px-4 py-4">{usersById.get(item.usuario_id)?.nome ?? item.usuario_nome ?? 'Usuário removido'}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-bold text-slate-900">{item.cliente_nome}</td>
                <td className="border-b border-slate-100 px-4 py-4">{getFieldLabel(fieldDefinitions, item.campo_alterado)}</td>
                <td className="border-b border-slate-100 px-4 py-4">{valueOrDash(item.valor_anterior)}</td>
                <td className="border-b border-slate-100 px-4 py-4">{valueOrDash(item.valor_novo)}</td>
                <td className="border-b border-slate-100 px-4 py-4">{item.tipo_acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!history.length ? (
        <div className="p-10 text-center">
          <History className="mx-auto text-slate-300" size={42} aria-hidden="true" />
          <p className="mt-3 font-black text-slate-900">Nenhuma alteração registrada ainda.</p>
        </div>
      ) : null}
    </section>
  );
}
