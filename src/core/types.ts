import type { Card } from 'ts-fsrs';

export interface Deck {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

/** Kartu yang disimpan di IndexedDB. `due` & `state` diduplikasi dari `fsrs` agar bisa di-index. */
export interface CardRecord {
  id: string;
  deckId: string;
  front: string;
  back: string;
  hint: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  due: number;
  state: number; // 0 New, 1 Learning, 2 Review, 3 Relearning
  suspended: 0 | 1;
  fsrs: Card;
}

export interface ReviewLogRecord {
  id?: number;
  cardId: string;
  deckId: string;
  rating: number; // 1 Again, 2 Hard, 3 Good, 4 Easy
  state: number; // state SEBELUM review
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reviewedAt: number;
}

export interface Settings {
  newPerDay: number;
  maxReviewsPerDay: number;
  requestRetention: number;
  enableFuzz: boolean;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  maxReviewsPerDay: 200,
  requestRetention: 0.9,
  enableFuzz: true,
  theme: 'system',
};

export interface DeckCounts {
  total: number;
  due: number;
  fresh: number;
}
