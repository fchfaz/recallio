import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  Maximize2,
  Minimize2,
  Volume2,
  ZoomIn,
  Sparkles,
  Award,
  ArrowRight,
  Layers,
  ChevronLeft,
  X,
} from 'lucide-react';
import { db, getUserSettings } from '@/lib/db/database';
import { executeReview, getNextReviewPreviews, type RatingPreview } from '@/lib/fsrs/scheduler';
import type { Card, Deck, ReviewLog, ReviewRating, UserSettings } from '@/types';
import { useToast } from '@/components/ui/Toast';

interface StudyProps {
  initialDeckId?: string;
  onNavigateToDecks: () => void;
}

export const Study: React.FC<StudyProps> = ({ initialDeckId, onNavigateToDecks }) => {
  const { showToast } = useToast();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId || 'all');
  const [queue, setQueue] = useState<Card[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Undo stack
  const [history, setHistory] = useState<{ card: Card; previousCard: Card; reviewLog: ReviewLog }[]>([]);

  // Session stats
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionStartTime] = useState(Date.now());
  const [cardStartTime, setCardStartTime] = useState(Date.now());
  const [isSessionComplete, setIsSessionComplete] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load decks & settings
  useEffect(() => {
    db.decks.toArray().then((loaded) => setDecks(loaded));
    getUserSettings().then((s) => setSettings(s));
  }, []);

  // Load cards due for study
  const loadDueCards = useCallback(async () => {
    const allCards = await db.cards.toArray();
    const now = new Date();

    const dueCards = allCards.filter((c) => {
      if (selectedDeckId !== 'all' && c.deckId !== selectedDeckId) {
        return false;
      }
      return new Date(c.due) <= now || c.state === 'new';
    });

    // Sort: learning first, then review, then new
    const sorted = [...dueCards].sort((a, b) => {
      const stateOrder: Record<string, number> = { learning: 0, relearning: 1, review: 2, new: 3 };
      return (stateOrder[a.state] ?? 4) - (stateOrder[b.state] ?? 4);
    });

    setQueue(sorted);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setIsSessionComplete(sorted.length === 0);
    setCardStartTime(Date.now());
  }, [selectedDeckId]);

  useEffect(() => {
    loadDueCards();
  }, [loadDueCards]);

  const currentCard = queue[currentCardIndex];

  // Confetti celebration when session completes
  useEffect(() => {
    if (isSessionComplete && sessionReviewed > 0) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B'],
        });
      } catch (e) {
        console.error(e);
      }
    }
  }, [isSessionComplete, sessionReviewed]);

  // Handle reviewing the card with a specific rating (1: Again, 2: Hard, 3: Good, 4: Easy)
  const handleRate = async (rating: ReviewRating) => {
    if (!currentCard) return;

    const durationMs = Date.now() - cardStartTime;
    const desiredRetention = settings?.desiredRetention ?? 0.9;
    const { updatedCard, reviewLog } = executeReview(
      currentCard,
      rating,
      durationMs,
      desiredRetention
    );

    // Save to database
    await db.transaction('rw', db.cards, db.reviews, async () => {
      await db.cards.put(updatedCard);
      await db.reviews.add(reviewLog);
    });

    // Record undo history
    setHistory((prev) => [...prev, { card: updatedCard, previousCard: currentCard, reviewLog }]);
    setSessionReviewed((prev) => prev + 1);

    // If rated 'Again', put it back in the end of the current session queue
    if (rating === 1) {
      setQueue((prev) => {
        const remaining = [...prev];
        remaining.splice(currentCardIndex, 1);
        remaining.push(updatedCard);
        return remaining;
      });
      setIsFlipped(false);
      setCardStartTime(Date.now());
    } else {
      // Remove from current queue
      const nextQueue = queue.filter((_, idx) => idx !== currentCardIndex);
      setQueue(nextQueue);
      setIsFlipped(false);
      setCardStartTime(Date.now());

      if (nextQueue.length === 0) {
        setIsSessionComplete(true);
      }
    }
  };

  // Undo last review
  const handleUndo = async () => {
    if (history.length === 0) return;
    const lastAction = history[history.length - 1];

    await db.transaction('rw', db.cards, db.reviews, async () => {
      await db.cards.put(lastAction.previousCard);
      await db.reviews.delete(lastAction.reviewLog.id);
    });

    setHistory((prev) => prev.slice(0, -1));
    setSessionReviewed((prev) => Math.max(0, prev - 1));
    setQueue((prev) => [lastAction.previousCard, ...prev]);
    setIsFlipped(true); // Return directly to the flipped card state
    setIsSessionComplete(false);
    showToast('Review undone', 'info');
  };

  // Pronounce card front with TTS
  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentCard) return;
    const textToSpeak = (isFlipped ? currentCard.back : currentCard.front)
      .replace(/<[^>]*>/g, '')
      .replace(/\[\.\.\.\]/g, 'blank');

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  // Previews for the 4 FSRS rating buttons
  const previews: Record<ReviewRating, RatingPreview> | null = currentCard
    ? getNextReviewPreviews(currentCard, settings?.desiredRetention ?? 0.9)
    : null;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (zoomedImage) {
        if (e.key === 'Escape') setZoomedImage(null);
        return;
      }

      // Space or Enter to flip
      if ((e.code === 'Space' || e.key === 'Enter') && !isFlipped) {
        e.preventDefault();
        setIsFlipped(true);
        return;
      }

      // Ratings 1, 2, 3, 4
      if (isFlipped && currentCard) {
        if (e.key === '1') {
          e.preventDefault();
          handleRate(1);
        } else if (e.key === '2') {
          e.preventDefault();
          handleRate(2);
        } else if (e.key === '3') {
          e.preventDefault();
          handleRate(3);
        } else if (e.key === '4') {
          e.preventDefault();
          handleRate(4);
        }
      }

      // Z or Cmd+Z for undo
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey || !isFlipped)) {
        if (history.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, currentCard, history, zoomedImage]);

  // Handle image clicks inside card HTML to trigger zoom
  const handleCardContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'img') {
      const src = (target as HTMLImageElement).src;
      if (src) setZoomedImage(src);
    }
  };

  // Card queue breakdown
  const newCount = queue.filter((c) => c.state === 'new').length;
  const learningCount = queue.filter((c) => c.state === 'learning' || c.state === 'relearning').length;
  const reviewCount = queue.filter((c) => c.state === 'review').length;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-slate-50 dark:bg-slate-950 transition-colors ${
        isFullscreen ? 'fixed inset-0 z-50 p-6 bg-slate-950' : 'p-4 md:p-8 max-w-4xl mx-auto w-full'
      }`}
    >
      {/* Top Session Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <select
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Decks ({queue.length} due)</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Queue Count Pills */}
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              title="New Cards"
              className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900"
            >
              {newCount}
            </span>
            <span
              title="Learning Cards"
              className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
            >
              {learningCount}
            </span>
            <span
              title="Review Cards"
              className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
            >
              {reviewCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              title="Undo previous review (Z)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Study'}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Flashcard Stage */}
      <div className="flex-1 flex flex-col items-center justify-center py-6 min-h-[380px]">
        {isSessionComplete ? (
          /* Finished Screen */
          <div className="text-center max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-500/25 mb-5">
              <Award className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              All Caught Up!
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              You reviewed{' '}
              <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                {sessionReviewed} card{sessionReviewed !== 1 ? 's' : ''}
              </strong>{' '}
              in this session. Your memory consolidation is on track!
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={onNavigateToDecks}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Layers className="w-4 h-4" />
                <span>Browse Decks</span>
              </button>
              <button
                onClick={loadDueCards}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Check for Due Cards</span>
              </button>
            </div>
          </div>
        ) : currentCard ? (
          /* Interactive Flashcard Card */
          <div
            onClick={() => !isFlipped && setIsFlipped(true)}
            className={`w-full max-w-2xl min-h-[340px] md:min-h-[400px] flex flex-col justify-between rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xl p-6 md:p-10 transition-all duration-200 ${
              !isFlipped ? 'cursor-pointer hover:border-indigo-400/50 hover:shadow-2xl' : ''
            }`}
          >
            {/* Card Header Tag & TTS */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest text-[10px]">
                  {currentCard.cardType === 'cloze' ? 'Cloze Deletion' : 'Flashcard'}
                </span>
                {currentCard.tags && currentCard.tags.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    #{currentCard.tags[0]}
                  </span>
                )}
              </div>
              <button
                onClick={handleSpeak}
                title="Pronounce text with TTS"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {/* Prompt & Answer Stage */}
            <div
              onClick={handleCardContentClick}
              className="my-auto py-6 text-center select-text max-w-xl mx-auto w-full"
            >
              {/* Question / Front */}
              <div
                className="text-lg md:text-2xl font-medium text-slate-900 dark:text-slate-100 leading-relaxed font-sans"
                dangerouslySetInnerHTML={{ __html: currentCard.front }}
              />

              {/* Optional Hint */}
              {currentCard.hint && !isFlipped && (
                <div className="mt-4 text-xs font-semibold text-amber-500 bg-amber-500/10 inline-block px-3 py-1 rounded-full border border-amber-500/20">
                  Hint: {currentCard.hint}
                </div>
              )}

              {/* Revealed Back */}
              {isFlipped && (
                <div className="mt-8 pt-6 border-t-2 border-indigo-100 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div
                    className="text-base md:text-xl text-slate-800 dark:text-slate-200 leading-relaxed font-sans"
                    dangerouslySetInnerHTML={{ __html: currentCard.back }}
                  />
                </div>
              )}
            </div>

            {/* Card Bottom Indicator */}
            {!isFlipped && (
              <div className="text-center pt-4 text-xs font-semibold text-slate-400 flex items-center justify-center gap-1.5">
                <span>Click card or press</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] border border-slate-200 dark:border-slate-700">
                  Space
                </kbd>
                <span>to show answer</span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Review Ratings Footer */}
      {currentCard && isFlipped && previews && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 animate-in fade-in duration-150">
          <div className="grid grid-cols-4 gap-2 md:gap-4 max-w-2xl mx-auto">
            {([1, 2, 3, 4] as ReviewRating[]).map((rating) => {
              const preview = previews[rating];
              return (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  className={`flex flex-col items-center justify-center p-3 md:p-4 rounded-2xl border-2 bg-white dark:bg-slate-900 transition-all cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${preview.color}`}
                >
                  <span className="font-bold text-sm md:text-base">{preview.label}</span>
                  <span className="text-xs opacity-75 font-mono mt-0.5">{preview.intervalText}</span>
                  <span className="hidden sm:inline text-[10px] opacity-40 font-mono mt-1">
                    [{preview.keyboardShortcut}]
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Show Answer Action if not flipped */}
      {currentCard && !isFlipped && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 max-w-md mx-auto w-full">
          <button
            onClick={() => setIsFlipped(true)}
            className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm text-white shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Show Answer</span>
            <kbd className="px-1.5 py-0.5 bg-indigo-700 rounded text-xs font-mono">Space</kbd>
          </button>
        </div>
      )}

      {/* Zoomed Image Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={zoomedImage}
              alt="Zoomed diagram"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-3 -right-3 p-1.5 rounded-full bg-slate-900 text-white shadow-md border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
