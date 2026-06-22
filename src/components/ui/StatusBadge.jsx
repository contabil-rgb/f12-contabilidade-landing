import { classNames } from './classNames';

export default function StatusBadge({
  children,
  className = '',
  toneClass = '',
  size = 'sm',
}) {
  const sizeClass =
    size === 'md'
      ? 'px-3 py-1.5 text-xs'
      : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full border font-black',
        sizeClass,
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}
