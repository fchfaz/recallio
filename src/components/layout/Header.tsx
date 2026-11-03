import React from 'react';
import { Plus, UploadCloud, GraduationCap, Sun, Moon } from 'lucide-react';
import { PWAInstallButton } from '@/components/ui/PWAInstallButton';
import { useTheme } from '@/hooks/useTheme';

interface HeaderProps {
  title: string;
  onOpenAddCard: () => void;
  onOpenImport: () => void;
  dueCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onOpenAddCard,
  onOpenImport,
}) => {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-4 md:px-8 backdrop-blur-xl transition-colors">
      <div className="flex items-center gap-3">
        {/* Mobile Brand Icon */}
        <div className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Header PWA Install Button */}
        <PWAInstallButton compact />

        {/* Quick Import Action */}
        <button
          onClick={onOpenImport}
          title="Import Anki .apkg or JSON backup"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Import</span>
        </button>

        {/* Add Flashcard CTA */}
        <button
          onClick={onOpenAddCard}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition hover:shadow-indigo-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">Add Card</span>
          <span className="sm:hidden">Add</span>
        </button>

        {/* Theme toggle on header for mobile */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="md:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
