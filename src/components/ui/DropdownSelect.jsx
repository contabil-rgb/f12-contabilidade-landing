import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { normalizeText } from '../../lib/formatters';
import { classNames } from './classNames';

function useFloatingDropdown(open, containerRef) {
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    function updatePosition() {
      if (typeof window === 'undefined') return;
      const trigger = containerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;
      const menuWidth = Math.max(rect.width, 220);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const availableSpace = openUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(256, Math.max(144, availableSpace - gap));
      const top = openUp
        ? Math.max(viewportPadding, rect.top - maxHeight - gap)
        : Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - maxHeight);

      setMenuStyle({
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${menuWidth}px`,
        maxHeight: `${maxHeight}px`,
        zIndex: 9999,
      });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, containerRef]);

  return { menuRef, menuStyle };
}

export default function DropdownSelect({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  includeBlank = true,
  emptyLabel = 'Todos',
  searchable = true,
  searchPlaceholder = 'Pesquisar opção',
  className = '',
  buttonClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [optionSearch, setOptionSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const { menuRef, menuStyle } = useFloatingDropdown(open, containerRef);
  const mappedOptions = useMemo(() => options.map((option) => (
    typeof option === 'string' || typeof option === 'number'
      ? { value: option, label: String(option) }
      : option
  )), [options]);
  const normalizedOptions = useMemo(() => [
    ...(includeBlank ? [{ value: '', label: emptyLabel }] : []),
    ...mappedOptions,
  ], [emptyLabel, includeBlank, mappedOptions]);
  const normalizedSearch = normalizeText(optionSearch);
  const filteredOptions = normalizedSearch
    ? mappedOptions.filter((option) => normalizeText(`${option.label} ${option.value}`).includes(normalizedSearch))
    : mappedOptions;
  const visibleOptions = normalizedSearch
    ? [...(includeBlank ? [{ value: '', label: emptyLabel }] : []), ...filteredOptions]
    : normalizedOptions;
  const firstFilteredOption = normalizedSearch ? filteredOptions[0] : null;
  const selectedOption = normalizedOptions.find((option) => String(option.value) === String(value));
  const selectedLabel = selectedOption?.label ?? emptyLabel;
  const showSearch = searchable && mappedOptions.length > 0;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, menuRef]);

  useEffect(() => {
    if (!open) {
      setOptionSearch('');
      return undefined;
    }
    if (!showSearch) return undefined;

    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, showSearch]);

  function handleSelect(nextValue) {
    onChange(nextValue);
    setOptionSearch('');
    setOpen(false);
  }

  const dropdownMenu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label={ariaLabel || label}
        style={menuStyle ?? { visibility: 'hidden' }}
        className="dropdown-menu-shell overflow-soft normal-case ring-1 ring-slate-900/5 dark:ring-white/5"
      >
        {showSearch ? (
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-500 focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
              <Search size={14} className="shrink-0" aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={optionSearch}
                onChange={(event) => setOptionSearch(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setOpen(false);
                  } else if (event.key === 'Enter' && firstFilteredOption) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSelect(firstFilteredOption.value);
                  }
                }}
                placeholder={searchPlaceholder}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold normal-case text-slate-800 outline-none placeholder:text-slate-400 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
        ) : null}

        {visibleOptions.map((option) => {
          const selected = String(option.value) === String(value);
          return (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={(event) => {
                event.stopPropagation();
                handleSelect(option.value);
              }}
              className={`dropdown-option ${selected ? 'dropdown-option-selected' : ''}`}
            >
              <span className="truncate">{option.label}</span>
              {selected ? <Check size={15} className="shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}

        {normalizedSearch && visibleOptions.length === (includeBlank ? 1 : 0) ? (
          <div className="px-3 py-3 text-sm font-semibold text-slate-500 dark:text-gray-400">
            Nenhuma opção encontrada
          </div>
        ) : null}
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      ref={containerRef}
      className={classNames(
        'relative text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400',
        className,
      )}
    >
      {label ? <span className="block">{label}</span> : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className={classNames(
          'select-shell flex items-center justify-between gap-2 text-left normal-case',
          label && 'mt-2',
          buttonClassName,
        )}
        aria-label={ariaLabel || label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={classNames('shrink-0 text-slate-400 transition', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {dropdownMenu}
    </div>
  );
}
