import React from 'react';
import { LayoutDashboard, Layers, GraduationCap, BarChart3, Settings } from 'lucide-react';
import type { NavigationTab } from '@/components/layout/Sidebar';

interface MobileNavProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  dueCount: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentTab, onSelectTab, dueCount }) => {
  const tabs = [
    { id: 'dashboard' as const, label: 'Home', icon: LayoutDashboard },
    { id: 'decks' as const, label: 'Decks', icon: Layers },
    {
      id: 'study' as const,
      label: 'Study',
      icon: GraduationCap,
      badge: dueCount > 0 ? dueCount : undefined,
    },
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 px-2 py-1 safe-area-pb">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1.5 px-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] leading-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
