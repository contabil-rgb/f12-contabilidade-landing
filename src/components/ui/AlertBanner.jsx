import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { classNames } from './classNames';

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
};

export default function AlertBanner({
  tone = 'info',
  title,
  children,
  className = '',
}) {
  const Icon = ICONS[tone] ?? ICONS.info;

  return (
    <div className={classNames('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-semibold shadow-sm', TONES[tone] ?? TONES.info, className)}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="font-black">{title}</p> : null}
        <div className={title ? 'mt-1' : ''}>{children}</div>
      </div>
    </div>
  );
}
