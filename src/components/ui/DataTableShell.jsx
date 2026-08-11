import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { classNames } from './classNames';

export function TableScrollArea({ children, className = '', topClassName = '' }) {
  const topScrollRef = useRef(null);
  const tableScrollRef = useRef(null);
  const [scrollMetrics, setScrollMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });

  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    const topScroll = topScrollRef.current;
    if (!tableScroll || !topScroll) return undefined;

    let frame = 0;
    const updateMetrics = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setScrollMetrics({
          scrollWidth: tableScroll.scrollWidth,
          clientWidth: tableScroll.clientWidth,
        });
      });
    };

    const syncFromTop = () => {
      if (tableScroll.scrollLeft !== topScroll.scrollLeft) {
        tableScroll.scrollLeft = topScroll.scrollLeft;
      }
    };

    const syncFromTable = () => {
      if (topScroll.scrollLeft !== tableScroll.scrollLeft) {
        topScroll.scrollLeft = tableScroll.scrollLeft;
      }
    };

    updateMetrics();
    tableScroll.addEventListener('scroll', syncFromTable, { passive: true });
    topScroll.addEventListener('scroll', syncFromTop, { passive: true });
    window.addEventListener('resize', updateMetrics);

    const observer = new ResizeObserver(updateMetrics);
    observer.observe(tableScroll);
    Array.from(tableScroll.children).forEach((child) => observer.observe(child));

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      tableScroll.removeEventListener('scroll', syncFromTable);
      topScroll.removeEventListener('scroll', syncFromTop);
      window.removeEventListener('resize', updateMetrics);
    };
  }, [children]);

  const hasHorizontalScroll = scrollMetrics.scrollWidth > scrollMetrics.clientWidth + 1;

  return (
    <>
      <div
        ref={topScrollRef}
        className={classNames('table-top-scroll overflow-soft', !hasHorizontalScroll && 'hidden', topClassName)}
        aria-hidden="true"
      >
        <div style={{ width: `${scrollMetrics.scrollWidth}px` }} className="h-1" />
      </div>
      <div ref={tableScrollRef} className={classNames('table-scroll-shell overflow-soft', className)}>
        {children}
      </div>
    </>
  );
}

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
      <TableScrollArea className={className}>
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
      </TableScrollArea>

      {!hasRows ? (
        <div className="empty-state">
          <Search className="text-slate-300 dark:text-gray-600" size={40} aria-hidden="true" />
          <p className="text-base font-bold text-slate-800 dark:text-gray-100">{emptyTitle}</p>
          {emptyDescription ? <p className="max-w-md text-sm font-medium leading-6 text-slate-500 dark:text-gray-300">{emptyDescription}</p> : null}
        </div>
      ) : null}
    </>
  );
}
