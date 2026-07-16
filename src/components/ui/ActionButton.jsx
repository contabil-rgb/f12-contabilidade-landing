import { classNames } from './classNames';

const VARIANT_CLASSNAMES = {
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-500 active:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 dark:active:bg-blue-700',
  secondary: 'border border-slate-300/80 bg-slate-50/95 text-slate-700 shadow-sm hover:border-slate-400/80 hover:bg-white active:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:active:bg-gray-900',
  subtle: 'border border-slate-300/80 bg-slate-100/70 text-slate-700 hover:border-slate-400/80 hover:bg-slate-50 active:bg-slate-200/70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:active:bg-gray-900',
  danger: 'border border-red-300/80 bg-red-50/70 text-red-700 shadow-sm hover:bg-red-100/80 active:bg-red-100 dark:border-red-500/30 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-red-950/30 dark:active:bg-red-950/50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white dark:active:bg-gray-900',
  icon: 'border border-slate-300/80 bg-slate-50/95 text-slate-600 shadow-sm hover:border-brand-blue/40 hover:bg-sky-50 hover:text-brand-blue active:bg-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-300 dark:active:bg-gray-900',
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
        'inline-flex min-w-0 items-center justify-center gap-2 rounded-lg font-black outline-none transition duration-150 ease-out active:translate-y-px focus-visible:ring-4 focus-visible:ring-brand-blue/10 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60',
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
