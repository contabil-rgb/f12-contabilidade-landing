import SurfacePanel from './SurfacePanel';
import { classNames } from './classNames';

export function getMetricPanelToneClass(tone = 'neutral') {
  return {
    success: 'surface-tone-success',
    warning: 'surface-tone-warning',
    danger: 'surface-tone-danger',
    info: 'surface-tone-info',
    muted: 'surface-tone-muted',
    neutral: '',
  }[tone] ?? '';
}

export default function MetricTile({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
  toneClass = '',
  onClick,
  className = '',
}) {
  const interactive = typeof onClick === 'function';
  const Component = interactive ? 'button' : 'div';
  const panelToneClass = getMetricPanelToneClass(tone);

  return (
    <SurfacePanel
      as={Component}
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={classNames(
        'min-h-[168px] p-5 text-left',
        panelToneClass,
        interactive ? 'group hover:-translate-y-0.5 hover:border-brand-blue/35 hover:shadow-soft' : '',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-gray-300">{title}</p>
          <p className="mt-3 text-3xl font-black leading-none text-slate-950 dark:text-gray-100 sm:text-[2.1rem]">{value}</p>
          {detail ? <p className="mt-3 max-w-[30ch] text-sm font-semibold leading-6 text-slate-500 dark:text-gray-200/90">{detail}</p> : null}
        </div>
        {Icon ? (
          <span className={classNames('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-white/90 shadow-sm dark:border-gray-600 dark:bg-gray-800/90', toneClass)}>
            <Icon size={21} aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </SurfacePanel>
  );
}
