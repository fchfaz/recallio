import { db } from './db';
import { planQueue, startOfToday, type DoneToday } from '../core/queue';
import { newFsrsCard, reviewCard, type FSRS, type Grade } from '../core/scheduler';
import {
  DEFAULT_SETTINGS,
  type CardRecord,
  type Deck,
  type DeckCounts,
  type Settings,
} from '../core/types';
import type { CardInput } from '../core/schema';

export const uid = () => crypto.randomUUID();

/* ---------- Settings ---------- */

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.meta.put({ key: 'settings', value: { ...cur, ...patch } });
}

/* ---------- Deck ---------- */

export async function createDeck(name: string, description = ''): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = { id: uid(), name: name.trim(), description: description.trim(), createdAt: now, updatedAt: now };
  await db.decks.add(deck);
  return deck;
}

export async function updateDeck(id: string, name: string, description: string): Promise<void> {
  await db.decks.update(id, { name: name.trim(), description: description.trim(), updatedAt: Date.now() });
}

export async function deleteDeck(id: string): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.logs, async () => {
    await db.cards.where('deckId').equals(id).delete();
    await db.logs.where('deckId').equals(id).delete();
    await db.decks.delete(id);
  });
}

/* ---------- Kartu ---------- */

export function makeCard(deckId: string, input: CardInput, id: string = uid(), now = Date.now()): CardRecord {
  const f = newFsrsCard(new Date(now));
  return {
    id,
    deckId,
    front: input.front,
    back: input.back,
    hint: input.hint ?? '',
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    due: f.due.getTime(),
    state: f.state,
    suspended: 0,
    fsrs: f,
  };
}

export async function saveCard(deckId: string, input: CardInput, id?: string): Promise<void> {
  if (!id) {
    await db.cards.add(makeCard(deckId, input));
    return;
  }
  await db.cards.update(id, {
    front: input.front,
    back: input.back,
    hint: input.hint ?? '',
    tags: input.tags ?? [],
    updatedAt: Date.now(),
  });
}

export async function deleteCard(id: string): Promise<void> {
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.delete(id);
    await db.logs.where('cardId').equals(id).delete();
  });
}

export async function toggleSuspend(id: string, suspended: boolean): Promise<void> {
  await db.cards.update(id, { suspended: suspended ? 1 : 0, updatedAt: Date.now() });
}

/* ---------- Antrean & statistik ---------- */

async function doneToday(): Promise<Map<string, DoneToday>> {
  const logs = await db.logs.where('reviewedAt').aboveOrEqual(startOfToday()).toArray();
  const m = new Map<string, DoneToday>();
  for (const l of logs) {
    const d = m.get(l.deckId) ?? { fresh: 0, review: 0 };
    if (l.state === 0) d.fresh++;
    else if (l.state === 2) d.review++;
    m.set(l.deckId, d);
  }
  return m;
}

export async function buildQueue(deckId?: string): Promise<CardRecord[]> {
  const s = await getSettings();
  const cards = deckId ? await db.cards.where('deckId').equals(deckId).toArray() : await db.cards.toArray();
  const { due, fresh } = planQueue(cards, await doneToday(), s, Date.now());
  return [...due, ...fresh];
}

export async function deckCounts(): Promise<Record<string, DeckCounts>> {
  const s = await getSettings();
  const cards = await db.cards.toArray();
  const { due, fresh } = planQueue(cards, await doneToday(), s, Date.now());
  const out: Record<string, DeckCounts> = {};
  const bucket = (id: string) => (out[id] ??= { total: 0, due: 0, fresh: 0 });
  for (const c of cards) bucket(c.deckId).total++;
  for (const c of due) bucket(c.deckId).due++;
  for (const c of fresh) bucket(c.deckId).fresh++;
  return out;
}

export async function applyReview(card: CardRecord, grade: Grade, f: FSRS, now = new Date()): Promise<CardRecord> {
  const { next, log } = reviewCard(f, card.fsrs, grade, now);
  const updated: CardRecord = {
    ...card,
    fsrs: next,
    due: next.due.getTime(),
    state: next.state,
    updatedAt: now.getTime(),
  };
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(updated);
    await db.logs.add({
      cardId: card.id,
      deckId: card.deckId,
      rating: grade,
      state: card.state,
      stability: log.stability,
      difficulty: log.difficulty,
      scheduledDays: log.scheduled_days,
      reviewedAt: now.getTime(),
    });
  });
  return updated;
}

export interface Activity {
  today: number;
  streak: number;
  week: { label: string; count: number }[];
}

const DAY = 86_400_000;

export async function activity(): Promise<Activity> {
  const start = startOfToday();
  const logs = await db.logs.where('reviewedAt').aboveOrEqual(start - 365 * DAY).toArray();
  const perDay = new Map<number, number>();
  for (const l of logs) {
    const k = startOfToday(new Date(l.reviewedAt));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = start - (6 - i) * DAY;
    return {
      label: new Date(day).toLocaleDateString('id-ID', { weekday: 'short' }),
      count: perDay.get(day) ?? 0,
    };
  });
  // streak: hari beruntun hingga hari ini (jika hari ini belum belajar, hitung dari kemarin)
  let streak = 0;
  let cursor = perDay.has(start) ? start : start - DAY;
  while (perDay.has(cursor)) {
    streak++;
    cursor -= DAY;
  }
  return { today: perDay.get(start) ?? 0, streak, week };
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.logs, db.meta, async () => {
    await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear(), db.meta.clear()]);
  });
}
