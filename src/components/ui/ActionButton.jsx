import { classNames } from './classNames';

const VARIANT_CLASSNAMES = {
  primary: 'border border-blue-500/70 bg-blue-600 text-white shadow-[0_10px_26px_rgba(37,99,235,0.22)] hover:border-blue-400 hover:bg-blue-500 active:bg-blue-700 dark:border-blue-400/40 dark:bg-blue-600 dark:shadow-[0_12px_30px_rgba(37,99,235,0.18)] dark:hover:bg-blue-500 dark:active:bg-blue-700',
  secondary: 'border border-slate-300/75 bg-slate-50/90 text-slate-700 shadow-sm hover:border-blue-400/45 hover:bg-white hover:text-slate-950 active:bg-slate-100 dark:border-gray-700/80 dark:bg-gray-800/85 dark:text-gray-100 dark:hover:border-blue-400/45 dark:hover:bg-gray-700/90 dark:active:bg-gray-900',
  subtle: 'border border-slate-300/70 bg-slate-100/60 text-slate-700 hover:border-blue-400/40 hover:bg-slate-50 active:bg-slate-200/70 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-blue-400/40 dark:hover:bg-gray-700/80 dark:active:bg-gray-900',
  danger: 'border border-red-300/75 bg-red-50/65 text-red-700 shadow-sm hover:border-red-400/80 hover:bg-red-100/80 active:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-950/30 dark:active:bg-red-950/50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white dark:active:bg-gray-900',
  icon: 'border border-slate-300/75 bg-slate-50/90 text-slate-600 shadow-sm hover:border-brand-blue/45 hover:bg-sky-50 hover:text-brand-blue active:bg-sky-100 dark:border-gray-700/80 dark:bg-gray-800/85 dark:text-gray-200 dark:hover:border-blue-500/45 dark:hover:bg-blue-500/10 dark:hover:text-blue-300 dark:active:bg-gray-900',
};

const SIZE_CLASSNAMES = {
  md: 'h-11 px-4 text-sm',
  sm: 'h-10 px-3 text-sm',
  icon: 'h-10 w-10 p-0',
};

export default function ActionButton({
  as: Component = 'button',
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  return (
    <Component
      className={classNames(
        'inline-flex min-w-0 items-center justify-center gap-2 rounded-xl font-medium outline-none transition duration-150 ease-out hover:-translate-y-px active:translate-y-0 focus-visible:ring-4 focus-visible:ring-brand-blue/10 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSNAMES[variant] ?? VARIANT_CLASSNAMES.secondary,
        SIZE_CLASSNAMES[size] ?? SIZE_CLASSNAMES.md,
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
