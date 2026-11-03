import React from 'react';
import {
  LayoutDashboard,
  Layers,
  GraduationCap,
  BarChart3,
  ArrowUpDown,
  Settings,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { PWAInstallButton } from '@/components/ui/PWAInstallButton';
import { useTheme } from '@/hooks/useTheme';

export type NavigationTab = 'dashboard' | 'decks' | 'study' | 'stats' | 'import-export' | 'settings';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  dueCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, dueCount }) => {
  const { theme, setTheme } = useTheme();

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'decks' as const, label: 'My Decks', icon: Layers },
    {
      id: 'study' as const,
      label: 'Study',
      icon: GraduationCap,
      badge: dueCount > 0 ? dueCount : undefined,
    },
    { id: 'stats' as const, label: 'Statistics', icon: BarChart3 },
    { id: 'import-export' as const, label: 'Import / Export', icon: ArrowUpDown },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 backdrop-blur-xl shrink-0 h-full p-4 justify-between transition-colors">
      <div>
        {/* Brand */}
        <div className="flex items-center gap-3 px-3 py-2 mb-6">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 shadow-md shadow-indigo-500/25">
            <GraduationCap className="h-6 w-6 text-white" />
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
                Recallio
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                FSRS
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Spaced Repetition</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? 'bg-indigo-800 text-white'
                        : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Tools: PWA Install & Theme */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        {/* PWA Install Button */}
        <PWAInstallButton />

        <div className="flex items-center justify-between px-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>v1.0 • Offline Ready</span>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </aside>
  );
};
