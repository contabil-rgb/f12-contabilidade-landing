import { classNames } from './classNames';

export default function SurfacePanel({
  as: Component = 'section',
  className = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  title,
  description,
  right,
  children,
  footer,
}) {
  return (
    <Component className={classNames('min-w-0 surface-card', className)}>
      {title || description || right ? (
        <div className={classNames('flex flex-col gap-4 p-5 sm:p-6 xl:flex-row xl:items-start xl:justify-between', headerClassName)}>
          <div className="min-w-0">
            {title ? <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-gray-100 sm:text-[1.65rem]">{title}</h2> : null}
            {description ? <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-gray-200/90">{description}</p> : null}
          </div>
          {right ? <div className="flex min-w-0 flex-wrap items-center gap-2.5 xl:justify-end">{right}</div> : null}
        </div>
      ) : null}

      <div className={bodyClassName}>{children}</div>

      {footer ? <div className={footerClassName}>{footer}</div> : null}
    </Component>
  );
}
