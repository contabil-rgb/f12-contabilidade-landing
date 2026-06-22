import { Search } from 'lucide-react';
import { classNames } from './classNames';

export default function DataTableShell({
  headers = [],
  minWidth = 'min-w-[1080px]',
  emptyTitle = 'Nenhum registro encontrado.',
  emptyDescription = '',
  children,
  className = '',
  tableClassName = '',
  renderHeadCell,
  hasRows = true,
}) {
  return (
    <>
      <div className={classNames('overflow-auto overflow-soft rounded-xl border border-slate-100/80 dark:border-gray-800', className)}>
        <table className={classNames(minWidth, 'border-separate border-spacing-0 text-left text-sm', tableClassName)}>
          <thead className="bg-slate-50/95 backdrop-blur dark:bg-gray-800/95">
            <tr>
              {headers.map((header, index) => (
                <th key={`${header}-${index}`} className="border-b border-slate-200 px-4 py-4 text-xs font-black uppercase tracking-wide text-slate-500 dark:border-gray-700 dark:text-gray-300">
                  {renderHeadCell ? renderHeadCell(header, index) : header}
                </th>
              ))}
            </tr>
          </thead>
          {children}
        </table>
      </div>

      {!hasRows ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
          <Search className="text-slate-300 dark:text-gray-600" size={40} aria-hidden="true" />
          <p className="text-base font-black text-slate-800 dark:text-gray-100">{emptyTitle}</p>
          {emptyDescription ? <p className="max-w-md text-sm font-semibold leading-6 text-slate-500 dark:text-gray-300">{emptyDescription}</p> : null}
        </div>
      ) : null}
    </>
  );
}
