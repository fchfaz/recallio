import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase } from '@/lib/db/database';
import { Sidebar, type NavigationTab } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { Dashboard } from '@/pages/Dashboard';
import { Decks } from '@/pages/Decks';
import { Study } from '@/pages/Study';
import { Statistics } from '@/pages/Statistics';
import { ImportExport } from '@/pages/ImportExport';
import { Settings } from '@/pages/Settings';
import { CardEditorModal } from '@/components/flashcards/CardEditorModal';
import { ToastProvider } from '@/components/ui/Toast';
import { OfflineIndicator } from '@/components/ui/OfflineIndicator';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [selectedDeckForAddCard, setSelectedDeckForAddCard] = useState<string | undefined>(undefined);
  const [activeStudyDeckId, setActiveStudyDeckId] = useState<string | undefined>(undefined);
  const [isDbReady, setIsDbReady] = useState(false);

  // Initialize Dexie and seed demo decks if needed
  useEffect(() => {
    initializeDatabase().then(() => setIsDbReady(true));
  }, []);

  // Reactive due cards count
  const dueCardsCount = useLiveQuery(async () => {
    const cards = await db.cards.toArray();
    const now = new Date();
    return cards.filter((c) => new Date(c.due) <= now || c.state === 'new').length;
  }, []) ?? 0;

  const handleStartStudy = (deckId?: string) => {
    setActiveStudyDeckId(deckId);
    setCurrentTab('study');
  };

  const handleOpenAddCard = (deckId?: string) => {
    setSelectedDeckForAddCard(deckId);
    setIsAddCardOpen(true);
  };

  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'decks':
        return 'My Decks';
      case 'study':
        return 'Study Mode';
      case 'stats':
        return 'Statistics';
      case 'import-export':
        return 'Import & Export';
      case 'settings':
        return 'Settings';
      default:
        return 'Recallio';
    }
  };

  if (!isDbReady) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-300">Loading Recallio...</span>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-full w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
        {/* Desktop Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          dueCount={dueCardsCount}
        />

        {/* Main Content Area */}
        <div className="flex flex-col flex-1 h-full overflow-hidden">
          {/* Header */}
          <Header
            title={getPageTitle()}
            dueCount={dueCardsCount}
            onOpenAddCard={() => handleOpenAddCard()}
            onOpenImport={() => setCurrentTab('import-export')}
          />

          {/* Page View Body */}
          <main className="flex-1 overflow-y-auto pb-20 md:pb-8">
            {currentTab === 'dashboard' && (
              <Dashboard
                onStartStudy={handleStartStudy}
                onOpenDeckList={() => setCurrentTab('decks')}
                onOpenAddCard={() => handleOpenAddCard()}
              />
            )}
            {currentTab === 'decks' && (
              <Decks
                onStartStudy={handleStartStudy}
                onOpenAddCard={handleOpenAddCard}
              />
            )}
            {currentTab === 'study' && (
              <Study
                initialDeckId={activeStudyDeckId}
                onNavigateToDecks={() => setCurrentTab('decks')}
              />
            )}
            {currentTab === 'stats' && <Statistics />}
            {currentTab === 'import-export' && (
              <ImportExport onNavigateToDecks={() => setCurrentTab('decks')} />
            )}
            {currentTab === 'settings' && <Settings />}
          </main>

          {/* Mobile Bottom Navigation */}
          <MobileNav
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            dueCount={dueCardsCount}
          />
        </div>

        {/* Add Card Modal */}
        <CardEditorModal
          isOpen={isAddCardOpen}
          onClose={() => setIsAddCardOpen(false)}
          defaultDeckId={selectedDeckForAddCard}
        />

        {/* Connectivity Offline Indicator */}
        <OfflineIndicator />
      </div>
    </ToastProvider>
  );
}
