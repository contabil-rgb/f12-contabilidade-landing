import { classNames } from './classNames';

const VARIANT_CLASSNAMES = {
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-700',
  subtle: 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-700',
  danger: 'border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50 dark:border-red-500/30 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-red-950/30',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
  icon: 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-brand-blue/30 hover:text-brand-blue dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:text-blue-300',
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
        'inline-flex items-center justify-center gap-2 rounded-lg font-black transition duration-150 ease-out focus-visible:ring-4 focus-visible:ring-brand-blue/10 disabled:cursor-not-allowed disabled:opacity-60',
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
