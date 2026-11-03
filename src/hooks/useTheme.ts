import { useEffect, useState } from 'react';
import { getUserSettings, saveUserSettings } from '@/lib/db/database';

export function useTheme() {
  const [theme, setThemeState] = useState<'dark' | 'light' | 'system'>('dark');

  useEffect(() => {
    getUserSettings().then((settings) => {
      setThemeState(settings.theme || 'dark');
      applyTheme(settings.theme || 'dark');
    });
  }, []);

  const applyTheme = (t: 'dark' | 'light' | 'system') => {
    const root = document.documentElement;
    const isDark =
      t === 'dark' ||
      (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  const setTheme = async (newTheme: 'dark' | 'light' | 'system') => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    await saveUserSettings({ theme: newTheme });
  };

  return { theme, setTheme };
}
