import Dexie, { type Table } from 'dexie';
import type {
  Deck,
  Note,
  Card,
  CardModelType,
  ReviewLog,
  MediaItem,
  UserSettings,
  ImportHistory,
  DeckStats,
} from '@/types';
import { renderClozeFront, renderClozeBack, getUniqueClozeIndices } from '@/lib/cloze/parser';

export class RecallioDatabase extends Dexie {
  decks!: Table<Deck, string>;
  notes!: Table<Note, string>;
  cards!: Table<Card, string>;
  reviews!: Table<ReviewLog, string>;
  media!: Table<MediaItem, string>;
  settings!: Table<UserSettings, string>;
  importHistory!: Table<ImportHistory, string>;

  constructor() {
    super('RecallioDatabase');
    
    this.version(1).stores({
      decks: 'id, name, parentId, createdAt',
      notes: 'id, deckId, modelType, createdAt, *tags',
      cards: 'id, noteId, deckId, cardType, state, due, reps, *tags, createdAt',
      reviews: 'id, cardId, deckId, reviewedAt, rating',
      media: 'id, filename, createdAt',
      settings: 'id',
      importHistory: 'id, importedAt',
    });
  }
}

export const db = new RecallioDatabase();

// Default user settings
export const DEFAULT_USER_SETTINGS: UserSettings = {
  id: 'user_settings',
  theme: 'dark',
  desiredRetention: 0.9,
  dailyNewLimit: 20,
  dailyReviewLimit: 100,
  showTimer: true,
  soundEffects: true,
  keyboardShortcuts: true,
  autoPlayAudio: false,
};

// Seed default decks and cards if empty
export async function initializeDatabase() {
  const deckCount = await db.decks.count();
  if (deckCount > 0) return;

  const now = Date.now();
  const todayIso = new Date(now).toISOString();

  // 1. Deck: Quick Start
  const quickStartDeckId = 'deck_quickstart';
  const quickStartDeck: Deck = {
    id: quickStartDeckId,
    name: '🚀 Recallio Quick Start',
    description: 'Master FSRS spaced repetition, keyboard shortcuts, and cloze deletions in under 3 minutes.',
    settings: {
      newCardsPerDay: 20,
      maxReviewsPerDay: 100,
      desiredRetention: 0.9,
    },
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  };

  // 2. Deck: Cognitive Science & Memory
  const cogSciDeckId = 'deck_cogsci';
  const cogSciDeck: Deck = {
    id: cogSciDeckId,
    name: '🧠 Cognitive Science & Memory',
    description: 'Evidence-based principles of long-term memory, active recall, and cognitive retention.',
    settings: {
      newCardsPerDay: 15,
      maxReviewsPerDay: 80,
      desiredRetention: 0.9,
    },
    createdAt: now - 86400000 * 3,
    updatedAt: now,
  };

  await db.decks.bulkAdd([quickStartDeck, cogSciDeck]);

  // Seed Notes and Cards for Quick Start
  const seedNotesData = [
    {
      deckId: quickStartDeckId,
      modelType: 'basic' as const,
      front: 'What does <strong>FSRS</strong> stand for in modern spaced repetition?',
      back: '<strong>Free Spaced Repetition Scheduler</strong>.<br/><br/>It is an open, machine-learning-based algorithm that models memory stability (S), difficulty (D), and retrievability (R) significantly more accurately than legacy SM-2.',
      hint: 'Starts with "Free"',
      tags: ['tutorial', 'fsrs'],
    },
    {
      deckId: quickStartDeckId,
      modelType: 'cloze' as const,
      front: 'The four rating buttons in Recallio are {{c1::Again}}, {{c2::Hard}}, {{c3::Good}}, and {{c4::Easy}}.',
      back: 'The FSRS engine dynamically computes your next interval depending on which button you select.',
      hint: 'Review options',
      tags: ['tutorial', 'shortcuts'],
    },
    {
      deckId: quickStartDeckId,
      modelType: 'basic' as const,
      front: 'Which key shortcut flips the flashcard in Study Mode?',
      back: '<kbd class="px-2 py-1 bg-slate-700 text-white rounded font-mono">Space</kbd> or <kbd class="px-2 py-1 bg-slate-700 text-white rounded font-mono">Enter</kbd>!<br/><br/>After flipping, press <kbd class="px-2 py-1 bg-slate-700 text-white rounded font-mono">1</kbd> to <kbd class="px-2 py-1 bg-slate-700 text-white rounded font-mono">4</kbd> to rate your recall.',
      hint: 'Longest key on keyboard',
      tags: ['shortcuts'],
    },
    {
      deckId: cogSciDeckId,
      modelType: 'basic' as const,
      front: 'What is the <strong>Testing Effect</strong> (Active Recall)?',
      back: 'The psychological finding that the act of retrieving information from memory actively strengthens synaptic connections, producing far better long-term retention than passive re-reading or highlighting.',
      hint: 'Retrieval practice',
      tags: ['psychology', 'memory'],
    },
    {
      deckId: cogSciDeckId,
      modelType: 'cloze' as const,
      front: 'According to Hermann Ebbinghaus, memory retention declines exponentially over time, a phenomenon known as the {{c1::Forgetting Curve}}.',
      back: 'Spaced repetition resets the curve at systematically increasing intervals, flattening the decay rate over time.',
      hint: 'Discovered in 1885',
      tags: ['psychology', 'ebbinghaus'],
    },
    {
      deckId: cogSciDeckId,
      modelType: 'basic' as const,
      front: 'What is <strong>Desirable Difficulty</strong> in cognitive science?',
      back: 'Coined by Robert Bjork, it refers to learning conditions that require active effort and cognitive processing. While it makes short-term performance feel slower, it yields far superior long-term retention and transfer of knowledge.',
      hint: 'Concept introduced by Robert Bjork',
      tags: ['principles'],
    },
    {
      deckId: cogSciDeckId,
      modelType: 'reversed' as const,
      front: 'Interleaving Effect',
      back: 'The learning practice of alternating between different topics or problem types during study, leading to better discrimination and categorization compared to blocked (repetitive) practice.',
      hint: 'Opposite of blocked practice',
      tags: ['strategies'],
    },
  ];

  const notesToAdd: Note[] = [];
  const cardsToAdd: Card[] = [];

  for (let i = 0; i < seedNotesData.length; i++) {
    const item = seedNotesData[i];
    const noteId = `note_seed_${i + 1}`;
    const note: Note = {
      id: noteId,
      deckId: item.deckId,
      modelType: item.modelType,
      fields: {
        front: item.front,
        back: item.back,
        hint: item.hint,
      },
      tags: item.tags,
      createdAt: now - 3600000 * (10 - i),
      updatedAt: now,
    };
    notesToAdd.push(note);

    if (item.modelType === 'cloze') {
      const clozeIndices = getUniqueClozeIndices(item.front);
      const indices = clozeIndices.length > 0 ? clozeIndices : [1];
      for (const cIdx of indices) {
        cardsToAdd.push({
          id: `card_seed_${i + 1}_c${cIdx}`,
          noteId,
          deckId: item.deckId,
          front: renderClozeFront(item.front, cIdx),
          back: `${renderClozeBack(item.front, cIdx)}<div class="mt-4 pt-3 border-t border-slate-700/50">${item.back}</div>`,
          hint: item.hint,
          cardType: 'cloze',
          clozeIndex: cIdx,
          tags: item.tags,
          due: todayIso,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          state: 'new',
          createdAt: now,
          updatedAt: now,
        });
      }
    } else if (item.modelType === 'reversed') {
      // Card 1: Forward
      cardsToAdd.push({
        id: `card_seed_${i + 1}_fwd`,
        noteId,
        deckId: item.deckId,
        front: item.front,
        back: item.back,
        hint: item.hint,
        cardType: 'reversed',
        tags: item.tags,
        due: todayIso,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 'new',
        createdAt: now,
        updatedAt: now,
      });
      // Card 2: Reverse
      cardsToAdd.push({
        id: `card_seed_${i + 1}_rev`,
        noteId,
        deckId: item.deckId,
        front: item.back,
        back: item.front,
        hint: 'Reverse prompt',
        cardType: 'reversed',
        tags: item.tags,
        due: todayIso,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 'new',
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Basic
      cardsToAdd.push({
        id: `card_seed_${i + 1}`,
        noteId,
        deckId: item.deckId,
        front: item.front,
        back: item.back,
        hint: item.hint,
        cardType: 'basic',
        tags: item.tags,
        due: todayIso,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 'new',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await db.notes.bulkAdd(notesToAdd);
  await db.cards.bulkAdd(cardsToAdd);

  // Settings
  await db.settings.put(DEFAULT_USER_SETTINGS);
}

// Helper: Get user settings
export async function getUserSettings(): Promise<UserSettings> {
  const settings = await db.settings.get('user_settings');
  return settings || DEFAULT_USER_SETTINGS;
}

// Helper: Save user settings
export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getUserSettings();
  await db.settings.put({ ...current, ...settings });
}

// Helper: Get stats for all decks
export async function getDeckStats(): Promise<DeckStats[]> {
  const decks = await db.decks.toArray();
  const allCards = await db.cards.toArray();
  const now = new Date();

  return decks.map((deck) => {
    const deckCards = allCards.filter((c) => c.deckId === deck.id);
    let newCards = 0;
    let learningCards = 0;
    let reviewCards = 0;
    let dueCards = 0;
    let masteredCards = 0;
    let lastStudied: number | undefined;

    for (const card of deckCards) {
      if (card.lastReview && (!lastStudied || card.lastReview > lastStudied)) {
        lastStudied = card.lastReview;
      }

      if (card.state === 'new') {
        newCards++;
      } else if (card.state === 'learning' || card.state === 'relearning') {
        learningCards++;
      } else if (card.state === 'review') {
        reviewCards++;
      }

      if (card.stability >= 30) {
        masteredCards++;
      }

      const isDue = new Date(card.due) <= now || card.state === 'new';
      if (isDue) {
        dueCards++;
      }
    }

    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      totalCards: deckCards.length,
      newCards,
      learningCards,
      reviewCards,
      dueCards,
      masteredCards,
      lastStudied,
    };
  });
}

// Helper: Create a note and generate its cards
export async function createNoteAndCards(
  deckId: string,
  modelType: CardModelType,
  fields: { front: string; back: string; hint?: string; extra?: string },
  tags: string[] = []
): Promise<{ note: Note; cards: Card[] }> {
  const now = Date.now();
  const todayIso = new Date(now).toISOString();
  const noteId = `note_${now}_${Math.random().toString(36).slice(2, 6)}`;

  const note: Note = {
    id: noteId,
    deckId,
    modelType,
    fields,
    tags,
    createdAt: now,
    updatedAt: now,
  };

  const cards: Card[] = [];

  if (modelType === 'cloze') {
    const clozeIndices = getUniqueClozeIndices(fields.front);
    const indices = clozeIndices.length > 0 ? clozeIndices : [1];
    for (const cIdx of indices) {
      cards.push({
        id: `card_${now}_c${cIdx}`,
        noteId,
        deckId,
        front: renderClozeFront(fields.front, cIdx),
        back: `${renderClozeBack(fields.front, cIdx)}${fields.back ? `<div class="mt-4 pt-3 border-t border-slate-700/50">${fields.back}</div>` : ''}`,
        hint: fields.hint,
        cardType: 'cloze',
        clozeIndex: cIdx,
        tags,
        due: todayIso,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 'new',
        createdAt: now,
        updatedAt: now,
      });
    }
  } else if (modelType === 'reversed') {
    cards.push({
      id: `card_${now}_fwd`,
      noteId,
      deckId,
      front: fields.front,
      back: fields.back,
      hint: fields.hint,
      cardType: 'reversed',
      tags,
      due: todayIso,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
      createdAt: now,
      updatedAt: now,
    });
    cards.push({
      id: `card_${now}_rev`,
      noteId,
      deckId,
      front: fields.back,
      back: fields.front,
      hint: fields.hint ? `Hint: ${fields.hint}` : undefined,
      cardType: 'reversed',
      tags,
      due: todayIso,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
      createdAt: now,
      updatedAt: now,
    });
  } else {
    cards.push({
      id: `card_${now}`,
      noteId,
      deckId,
      front: fields.front,
      back: fields.back,
      hint: fields.hint,
      cardType: modelType,
      tags,
      due: todayIso,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.transaction('rw', db.notes, db.cards, async () => {
    await db.notes.add(note);
    await db.cards.bulkAdd(cards);
  });

  return { note, cards };
}

// Delete deck and its associated notes, cards, and reviews safely
export async function deleteDeck(deckId: string): Promise<void> {
  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, async () => {
    await db.decks.delete(deckId);
    await db.notes.where('deckId').equals(deckId).delete();
    await db.cards.where('deckId').equals(deckId).delete();
    await db.reviews.where('deckId').equals(deckId).delete();
  });
}

// Delete note and its cards
export async function deleteNote(noteId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, db.reviews, async () => {
    await db.notes.delete(noteId);
    const cards = await db.cards.where('noteId').equals(noteId).toArray();
    for (const c of cards) {
      await db.reviews.where('cardId').equals(c.id).delete();
    }
    await db.cards.where('noteId').equals(noteId).delete();
  });
}
