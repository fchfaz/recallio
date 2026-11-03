import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900/90 dark:bg-slate-800/95 border border-amber-500/30 px-3.5 py-2 text-xs font-medium text-amber-400 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-2">
      <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
      <span>Offline Mode — All decks & reviews saved locally.</span>
    </div>
  );
};
