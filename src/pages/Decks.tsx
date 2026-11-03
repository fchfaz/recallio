import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Search,
  MoreVertical,
  Play,
  Download,
  Trash2,
  Edit2,
  Copy,
  FolderTree,
  Sparkles,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { db, deleteDeck, getDeckStats } from '@/lib/db/database';
import { exportDeckToAnki, triggerFileDownload } from '@/lib/anki/exporter';
import type { Deck, DeckStats } from '@/types';
import { useToast } from '@/components/ui/Toast';

interface DecksProps {
  onStartStudy: (deckId: string) => void;
  onOpenAddCard: (deckId?: string) => void;
}

export const Decks: React.FC<DecksProps> = ({ onStartStudy, onOpenAddCard }) => {
  const { showToast } = useToast();
  const [deckStats, setDeckStats] = useState<DeckStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const loadDecks = async () => {
    const stats = await getDeckStats();
    setDeckStats(stats);
  };

  useEffect(() => {
    loadDecks();
  }, []);

  const handleCreateOrUpdateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) {
      showToast('Deck name is required.', 'error');
      return;
    }

    const now = Date.now();
    if (editingDeck) {
      await db.decks.update(editingDeck.id, {
        name: newDeckName.trim(),
        description: newDeckDesc.trim(),
        updatedAt: now,
      });
      showToast('Deck updated!', 'success');
    } else {
      const newDeckId = `deck_${now}_${Math.random().toString(36).slice(2, 6)}`;
      await db.decks.add({
        id: newDeckId,
        name: newDeckName.trim(),
        description: newDeckDesc.trim(),
        settings: {
          newCardsPerDay: 20,
          maxReviewsPerDay: 100,
          desiredRetention: 0.9,
        },
        createdAt: now,
        updatedAt: now,
      });
      showToast('New deck created!', 'success');
    }

    setNewDeckName('');
    setNewDeckDesc('');
    setEditingDeck(null);
    setIsCreateModalOpen(false);
    loadDecks();
  };

  const handleDuplicateDeck = async (deckId: string) => {
    const original = await db.decks.get(deckId);
    if (!original) return;

    const now = Date.now();
    const newDeckId = `deck_${now}_dup`;
    const newName = `${original.name} (Copy)`;

    await db.decks.add({
      ...original,
      id: newDeckId,
      name: newName,
      createdAt: now,
      updatedAt: now,
    });

    // Copy cards and notes
    const cards = await db.cards.where('deckId').equals(deckId).toArray();
    const newCards = cards.map((c) => ({
      ...c,
      id: `card_${now}_${Math.random().toString(36).slice(2, 6)}`,
      deckId: newDeckId,
      createdAt: now,
      updatedAt: now,
    }));

    if (newCards.length > 0) {
      await db.cards.bulkAdd(newCards);
    }

    showToast(`Duplicated "${original.name}"!`, 'success');
    setActiveMenuId(null);
    loadDecks();
  };

  const handleDeleteDeck = async (deckId: string, deckName: string) => {
    if (!confirm(`Are you sure you want to delete "${deckName}" and all its flashcards?`)) {
      return;
    }
    await deleteDeck(deckId);
    showToast(`Deleted "${deckName}"`, 'info');
    setActiveMenuId(null);
    loadDecks();
  };

  const handleExportDeck = async (deckId: string, deckName: string) => {
    try {
      showToast('Exporting .apkg package...', 'info');
      const blob = await exportDeckToAnki(deckId);
      const cleanName = deckName.replace(/[^a-zA-Z0-9_-]/g, '_');
      triggerFileDownload(blob, `${cleanName}.apkg`);
      showToast('Exported Anki package downloaded!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export deck.', 'error');
    }
    setActiveMenuId(null);
  };

  const filteredDecks = deckStats.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
            Deck Management
          </h2>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
            Organize flashcards, hierarchical subdecks, and study queues
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search decks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs md:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <button
            onClick={() => {
              setEditingDeck(null);
              setNewDeckName('');
              setNewDeckDesc('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs md:text-sm shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Deck</span>
          </button>
        </div>
      </div>

      {/* Decks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredDecks.map((deck) => {
          const isSubdeck = deck.name.includes('::');
          return (
            <div
              key={deck.id}
              className="group relative rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 shadow-xs hover:shadow-lg transition flex flex-col justify-between"
            >
              <div>
                {/* Header & Menu */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    {isSubdeck && (
                      <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-500">
                        <FolderTree className="w-3 h-3" />
                        <span>Subdeck</span>
                      </div>
                    )}
                    <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                      {deck.name}
                    </h3>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() =>
                        setActiveMenuId(activeMenuId === deck.id ? null : deck.id)
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Popover Menu */}
                    {activeMenuId === deck.id && (
                      <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl text-xs space-y-0.5 animate-in fade-in zoom-in-95">
                        <button
                          onClick={async () => {
                            const d = await db.decks.get(deck.id);
                            if (d) {
                              setEditingDeck(d);
                              setNewDeckName(d.name);
                              setNewDeckDesc(d.description || '');
                              setIsCreateModalOpen(true);
                              setActiveMenuId(null);
                            }
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Rename / Edit</span>
                        </button>
                        <button
                          onClick={() => handleDuplicateDeck(deck.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Duplicate Deck</span>
                        </button>
                        <button
                          onClick={() => handleExportDeck(deck.id, deck.name)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export .apkg</span>
                        </button>
                        <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                        <button
                          onClick={() => handleDeleteDeck(deck.id, deck.name)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-left cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Deck</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {deck.description && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {deck.description}
                  </p>
                )}

                {/* Deck Card Counts */}
                <div className="mt-4 grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 text-center">
                  <div>
                    <span className="block text-xs font-bold text-blue-600 dark:text-blue-400">
                      {deck.newCards}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">New</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-rose-600 dark:text-rose-400">
                      {deck.dueCards}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Due</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {deck.masteredCards}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Mastered
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => onOpenAddCard(deck.id)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  + Add Card
                </button>

                <button
                  onClick={() => onStartStudy(deck.id)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Study</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Deck Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              {editingDeck ? 'Edit Deck' : 'Create New Deck'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Tip: Use double colons (::) for subdecks, e.g.{' '}
              <span className="font-mono text-indigo-500">Languages::Spanish</span>
            </p>

            <form onSubmit={handleCreateOrUpdateDeck} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Deck Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Japanese Kanji"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. JLPT N5 vocabulary and grammar notes"
                  value={newDeckDesc}
                  onChange={(e) => setNewDeckDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs"
                >
                  {editingDeck ? 'Save Changes' : 'Create Deck'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
