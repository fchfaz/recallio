import type { CardRecord, Settings } from './types';

export interface DoneToday {
  fresh: number;
  review: number;
}

/**
 * Fungsi murni: tentukan kartu yang boleh dipelajari sekarang.
 * - Kartu learning/relearning (state 1 & 3) yang jatuh tempo: tanpa batas harian.
 * - Kartu review (state 2) jatuh tempo: dibatasi maxReviewsPerDay per deck.
 * - Kartu baru (state 0): dibatasi newPerDay per deck.
 */
export function planQueue(
  cards: CardRecord[],
  doneByDeck: Map<string, DoneToday>,
  s: Pick<Settings, 'newPerDay' | 'maxReviewsPerDay'>,
  now: number,
): { due: CardRecord[]; fresh: CardRecord[] } {
  const active = cards.filter((c) => !c.suspended);
  const used = new Map<string, DoneToday>();
  const doneOf = (deckId: string) => {
    let u = used.get(deckId);
    if (!u) {
      const d = doneByDeck.get(deckId);
      u = { fresh: d?.fresh ?? 0, review: d?.review ?? 0 };
      used.set(deckId, u);
    }
    return u;
  };

  const due: CardRecord[] = [];
  for (const c of active.filter((c) => c.state !== 0 && c.due <= now).sort((a, b) => a.due - b.due)) {
    if (c.state === 2) {
      const u = doneOf(c.deckId);
      if (u.review >= s.maxReviewsPerDay) continue;
      u.review++;
    }
    due.push(c);
  }

  const fresh: CardRecord[] = [];
  for (const c of active.filter((c) => c.state === 0).sort((a, b) => a.createdAt - b.createdAt)) {
    const u = doneOf(c.deckId);
    if (u.fresh >= s.newPerDay) continue;
    u.fresh++;
    fresh.push(c);
  }
  return { due, fresh };
}

export function startOfToday(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
