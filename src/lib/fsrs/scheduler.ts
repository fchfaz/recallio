import {
  fsrs,
  Rating as FsrsRating,
  State as FsrsState,
  type Card as FsrsCard,
  type RecordLogItem,
} from 'ts-fsrs';
import type { Card, CardState, ReviewRating, ReviewLog } from '@/types';

// Convert our CardState to ts-fsrs numeric state
export function toFsrsState(state: CardState): FsrsState {
  switch (state) {
    case 'new':
      return FsrsState.New;
    case 'learning':
      return FsrsState.Learning;
    case 'review':
      return FsrsState.Review;
    case 'relearning':
      return FsrsState.Relearning;
    default:
      return FsrsState.New;
  }
}

// Convert ts-fsrs numeric state to our CardState
export function fromFsrsState(state: FsrsState): CardState {
  switch (state) {
    case FsrsState.New:
      return 'new';
    case FsrsState.Learning:
      return 'learning';
    case FsrsState.Review:
      return 'review';
    case FsrsState.Relearning:
      return 'relearning';
    default:
      return 'new';
  }
}

// Convert our Card to ts-fsrs Card structure
export function toFsrsCard(card: Card): FsrsCard {
  return {
    due: new Date(card.due),
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    scheduled_days: card.scheduledDays || 0,
    learning_steps: 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    state: toFsrsState(card.state),
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  };
}

// Format interval into clean, human-readable Anki-like string
export function formatInterval(dueDate: Date, nowDate: Date = new Date()): string {
  const diffMs = dueDate.getTime() - nowDate.getTime();
  if (diffMs <= 0) return '< 1m';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return '< 1m';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  if (diffDays < 365) {
    const months = (diffDays / 30.4).toFixed(1);
    return `${months.endsWith('.0') ? parseInt(months) : months}mo`;
  }
  const years = (diffDays / 365.25).toFixed(1);
  return `${years.endsWith('.0') ? parseInt(years) : years}y`;
}

// Create configured FSRS scheduler instance
export function getScheduler(desiredRetention: number = 0.9) {
  return fsrs({
    request_retention: Math.min(Math.max(desiredRetention, 0.7), 0.97),
  });
}

// Get review options and projected intervals for UI buttons
export interface RatingPreview {
  rating: ReviewRating;
  label: string;
  intervalText: string;
  nextDue: Date;
  scheduledDays: number;
  color: string;
  keyboardShortcut: string;
}

export function getNextReviewPreviews(
  card: Card,
  desiredRetention: number = 0.9,
  now: Date = new Date()
): Record<ReviewRating, RatingPreview> {
  const scheduler = getScheduler(desiredRetention);
  const fsrsCard = toFsrsCard(card);
  const recordLogs: any = scheduler.repeat(fsrsCard, now);

  const getPreview = (
    rating: ReviewRating,
    fsrsRating: FsrsRating,
    label: string,
    color: string,
    shortcut: string
  ): RatingPreview => {
    const item: RecordLogItem = recordLogs[fsrsRating];
    const nextDue = item.card.due;
    const intervalText = formatInterval(nextDue, now);

    return {
      rating,
      label,
      intervalText,
      nextDue,
      scheduledDays: item.card.scheduled_days,
      color,
      keyboardShortcut: shortcut,
    };
  };

  return {
    1: getPreview(1, FsrsRating.Again, 'Again', 'border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400', '1'),
    2: getPreview(2, FsrsRating.Hard, 'Hard', 'border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400', '2'),
    3: getPreview(3, FsrsRating.Good, 'Good', 'border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400', '3'),
    4: getPreview(4, FsrsRating.Easy, 'Easy', 'border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400', '4'),
  };
}

// Schedule and return the updated Card and generated ReviewLog
export function executeReview(
  card: Card,
  rating: ReviewRating,
  durationMs: number = 0,
  desiredRetention: number = 0.9,
  now: Date = new Date()
): { updatedCard: Card; reviewLog: ReviewLog } {
  const scheduler = getScheduler(desiredRetention);
  const fsrsCard = toFsrsCard(card);
  const recordLogs: any = scheduler.repeat(fsrsCard, now);

  const ratingMap: Record<ReviewRating, FsrsRating> = {
    1: FsrsRating.Again,
    2: FsrsRating.Hard,
    3: FsrsRating.Good,
    4: FsrsRating.Easy,
  };

  const selectedItem: RecordLogItem = recordLogs[ratingMap[rating]];
  const newFsrsCard = selectedItem.card;

  const elapsedDays = card.lastReview
    ? Math.max(0, Math.floor((now.getTime() - card.lastReview) / 86400000))
    : 0;

  const updatedCard: Card = {
    ...card,
    due: newFsrsCard.due.toISOString(),
    stability: Number(newFsrsCard.stability.toFixed(4)),
    difficulty: Number(newFsrsCard.difficulty.toFixed(4)),
    elapsedDays,
    scheduledDays: newFsrsCard.scheduled_days,
    reps: newFsrsCard.reps,
    lapses: newFsrsCard.lapses,
    state: fromFsrsState(newFsrsCard.state),
    lastReview: now.getTime(),
    updatedAt: now.getTime(),
  };

  const reviewLog: ReviewLog = {
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    cardId: card.id,
    deckId: card.deckId,
    rating,
    state: card.state,
    due: newFsrsCard.due.toISOString(),
    stability: Number(newFsrsCard.stability.toFixed(4)),
    difficulty: Number(newFsrsCard.difficulty.toFixed(4)),
    elapsedDays,
    scheduledDays: newFsrsCard.scheduled_days,
    reviewDurationMs: durationMs,
    reviewedAt: now.getTime(),
  };

  return { updatedCard, reviewLog };
}
