/**
 * Recallio Core Data Types
 */

export type CardModelType = 'basic' | 'reversed' | 'cloze' | 'optional_reversed';

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export type ReviewRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface DeckSettings {
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  desiredRetention: number; // e.g. 0.90
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  parentId?: string; // For nested subdecks (e.g. Languages::Japanese)
  settings: DeckSettings;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  deckId: string;
  modelType: CardModelType;
  modelName?: string;
  // All fields preserved from the original model (including all 38 fields of JP Mining Note)
  fields: Record<string, string>;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Card {
  id: string;
  noteId: string;
  deckId: string;
  front: string;
  back: string;
  hint?: string;
  cardType: CardModelType;
  clozeIndex?: number; // 1, 2, ... for cloze deletion cards
  tags: string[];
  
  // FSRS Scheduling parameters
  due: string; // ISO date string (YYYY-MM-DDTHH:mm:ss.sssZ)
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview?: number; // timestamp in ms

  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  rating: ReviewRating;
  state: CardState;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reviewDurationMs: number;
  reviewedAt: number; // timestamp in ms
}

export interface MediaItem {
  id: string;
  filename: string;
  mimeType: string;
  data: string; // Base64 data URL or blob URL
  size: number;
  createdAt: number;
}

export interface UserSettings {
  id: string; // 'user_settings'
  theme: 'light' | 'dark' | 'system';
  desiredRetention: number; // default: 0.9
  dailyNewLimit: number; // default: 20
  dailyReviewLimit: number; // default: 100
  showTimer: boolean;
  soundEffects: boolean;
  keyboardShortcuts: boolean;
  autoPlayAudio: boolean;
}

export interface ImportHistory {
  id: string;
  filename: string;
  deckCount: number;
  noteCount: number;
  cardCount: number;
  mediaCount: number;
  warningCount: number;
  importedAt: number;
}

export interface AnkiParsedDeck {
  id: string;
  name: string;
  description: string;
  noteCount: number;
  cardCount: number;
  selected: boolean;
}

export interface AnkiImportPreview {
  filename: string;
  primaryDatabase: 'collection.anki21' | 'collection.anki2';
  decks: AnkiParsedDeck[];
  totalNotes: number;
  totalCards: number;
  noteTypeCount: number;
  fieldsInNoteType: number;
  templateCount: number;
  mediaCount: number;
  mediaMappingEntries: number;
  warnings: string[];
  diagnosticInfo?: Record<string, any>;
  rawNotes: any[];
  rawCards: Card[];
  rawMedia: Record<string, string>; // map filename -> base64
}

export interface DeckStats {
  id: string;
  name: string;
  description: string;
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  dueCards: number;
  masteredCards: number; // stability > 30 days
  lastStudied?: number;
}
