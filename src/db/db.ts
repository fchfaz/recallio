import Dexie, { type EntityTable, type Table } from 'dexie';
import type { CardRecord, Deck, ReviewLogRecord } from '../core/types';

class AppDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  cards!: EntityTable<CardRecord, 'id'>;
  logs!: EntityTable<ReviewLogRecord, 'id'>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('recallio');
    // Versi 1. Perubahan skema berikutnya: tambahkan this.version(2).stores(...).upgrade(...)
    this.version(1).stores({
      decks: 'id, name, updatedAt',
      cards: 'id, deckId, due, state, updatedAt, *tags',
      logs: '++id, cardId, deckId, reviewedAt',
      meta: 'key',
    });
  }
}

export const db = new AppDB();
