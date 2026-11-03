import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Moon,
  Sun,
  Laptop,
  Volume2,
  Keyboard,
  Clock,
  Trash2,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  HardDrive,
  Info,
} from 'lucide-react';
import { db, getUserSettings, saveUserSettings, initializeDatabase } from '@/lib/db/database';
import type { UserSettings } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { useTheme } from '@/hooks/useTheme';

export const Settings: React.FC = () => {
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    getUserSettings().then((s) => setSettings(s));
  }, []);

  if (!settings) return null;

  const handleUpdate = async (patch: Partial<UserSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await saveUserSettings(patch);
    showToast('Settings saved', 'success');
  };

  const handleResetToDemo = async () => {
    if (!confirm('Reset database to default demo starter decks? Existing custom cards will be cleared.')) {
      return;
    }
    await db.decks.clear();
    await db.notes.clear();
    await db.cards.clear();
    await db.reviews.clear();
    await db.media.clear();
    await initializeDatabase();
    showToast('Reset to demo starter decks!', 'success');
  };

  const handleClearAll = async () => {
    if (!confirm('WARNING: This will permanently wipe all decks, notes, cards, and review history! Proceed?')) {
      return;
    }
    await db.decks.clear();
    await db.notes.clear();
    await db.cards.clear();
    await db.reviews.clear();
    await db.media.clear();
    await db.importHistory.clear();
    showToast('All local data cleared.', 'info');
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
          Preferences & FSRS Engine
        </h2>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
          Configure memory retention parameters, study limits, and display
        </p>
      </div>

      {/* FSRS Algorithm Settings */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              FSRS Desired Retention
            </h3>
            <p className="text-xs text-slate-500">
              Target probability of recalling a card upon its scheduled review
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Target Retention Rate
            </span>
            <span className="font-mono font-bold text-base text-indigo-600 dark:text-indigo-400">
              {Math.round(settings.desiredRetention * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0.75"
            max="0.96"
            step="0.01"
            value={settings.desiredRetention}
            onChange={(e) => handleUpdate({ desiredRetention: parseFloat(e.target.value) })}
            className="w-full accent-indigo-600 cursor-pointer"
          />

          <div className="flex justify-between text-[11px] text-slate-400">
            <span>75% (Fewer reviews)</span>
            <span>90% (Recommended)</span>
            <span>96% (Intense study)</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <span>
              90% is the scientifically optimal trade-off in cognitive psychology. Raising retention to 96% doubles the daily review workload for a marginal retention gain.
            </span>
          </div>
        </div>
      </div>

      {/* Daily Limits */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="font-bold text-base text-slate-900 dark:text-white">Daily Study Limits</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              New Cards Per Day
            </label>
            <input
              type="number"
              min="1"
              max="200"
              value={settings.dailyNewLimit}
              onChange={(e) => handleUpdate({ dailyNewLimit: parseInt(e.target.value, 10) || 20 })}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Maximum Reviews Per Day
            </label>
            <input
              type="number"
              min="10"
              max="1000"
              value={settings.dailyReviewLimit}
              onChange={(e) =>
                handleUpdate({ dailyReviewLimit: parseInt(e.target.value, 10) || 100 })
              }
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      {/* Appearance & Interface */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="font-bold text-base text-slate-900 dark:text-white">Interface & Audio</h3>

        {/* Theme */}
        <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
              Color Theme
            </span>
            <span className="text-xs text-slate-400">Choose your preferred visual mode</span>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              onClick={() => setTheme('light')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3 pt-2">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Show Study Timer
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.showTimer}
              onChange={(e) => handleUpdate({ showTimer: e.target.checked })}
              className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2.5">
              <Keyboard className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Enable Keyboard Shortcuts (Space, 1-4, Z)
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.keyboardShortcuts}
              onChange={(e) => handleUpdate({ keyboardShortcuts: e.target.checked })}
              className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2.5">
              <Volume2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Text-to-Speech Pronunciation Button
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.soundEffects}
              onChange={(e) => handleUpdate({ soundEffects: e.target.checked })}
              className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
          </label>
        </div>
      </div>

      {/* Danger Zone: Data Management */}
      <div className="p-6 rounded-3xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-4">
        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <ShieldAlert className="w-5 h-5" />
          <h3 className="font-bold text-base">Data Management & Reset</h3>
        </div>

        <p className="text-xs text-rose-700 dark:text-rose-300/80">
          All data is stored directly in your browser's IndexedDB and never uploaded to any remote server.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <button
            onClick={handleResetToDemo}
            className="w-full sm:w-auto px-4 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Decks</span>
          </button>

          <button
            onClick={handleClearAll}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe All Database</span>
          </button>
        </div>
      </div>
    </div>
  );
};
