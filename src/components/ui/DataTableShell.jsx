import { Search } from 'lucide-react';
import { classNames } from './classNames';

export default function DataTableShell({
  headers = [],
  minWidth = 'min-w-[900px] lg:min-w-[1080px]',
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
      <div className={classNames('table-scroll-shell overflow-soft', className)}>
        <table className={classNames('table-base', minWidth, tableClassName)}>
          <thead className="table-head">
            <tr>
              {headers.map((header, index) => (
                <th key={`${header}-${index}`} className="table-head-cell">
                  {renderHeadCell ? renderHeadCell(header, index) : header}
                </th>
              ))}
            </tr>
          </thead>
          {children}
        </table>
      </div>

      {!hasRows ? (
        <div className="empty-state">
          <Search className="text-slate-300 dark:text-gray-600" size={40} aria-hidden="true" />
          <p className="text-base font-black text-slate-800 dark:text-gray-100">{emptyTitle}</p>
          {emptyDescription ? <p className="max-w-md text-sm font-semibold leading-6 text-slate-500 dark:text-gray-300">{emptyDescription}</p> : null}
        </div>
      ) : null}
    </>
  );
}
