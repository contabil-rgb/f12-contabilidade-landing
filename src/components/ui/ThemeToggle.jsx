import { Moon, SunMedium } from 'lucide-react';
import { useTheme } from './theme-context';
import { classNames } from './classNames';

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    // Botao global do tema para manter a alternancia acessivel em qualquer pagina.
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className={classNames(
        'inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300/80 bg-[#eef6fb]/90 px-3.5 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-300/30 transition duration-150 hover:border-brand-blue/40 hover:bg-white/90 hover:text-brand-blue focus-visible:ring-4 focus-visible:ring-brand-blue/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:shadow-none dark:hover:border-blue-500/40 dark:hover:text-blue-300',
        className,
      )}
    >
      {isDark ? <SunMedium size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
      <span>{isDark ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  );
}
