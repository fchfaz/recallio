import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type FSRS,
  type Grade,
} from 'ts-fsrs';
import type { Settings } from './types';

export { Rating };
export type { Grade, FSRS, Card };

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export function makeScheduler(s: Pick<Settings, 'requestRetention' | 'enableFuzz'>): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: s.requestRetention,
      enable_fuzz: s.enableFuzz,
      maximum_interval: 36500,
    }),
  );
}

export function newFsrsCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/** Terapkan satu jawaban. Mengembalikan kartu baru + log dari ts-fsrs. */
export function reviewCard(f: FSRS, card: Card, grade: Grade, now: Date = new Date()) {
  const { card: next, log } = f.next(card, now, grade);
  return { next, log };
}

/** Pratinjau interval untuk keempat tombol, mis. { 1: "1 mnt", 3: "3 hr" }. */
export function previewIntervals(f: FSRS, card: Card, now: Date = new Date()): Record<number, string> {
  const rec = f.repeat(card, now);
  const out: Record<number, string> = {};
  for (const g of GRADES) out[g] = formatInterval(now.getTime(), rec[g].card.due.getTime());
  return out;
}

export function formatInterval(fromMs: number, toMs: number): string {
  if (toMs - fromMs < 30_000) return '<1 mnt';
  const min = Math.round((toMs - fromMs) / 60000);
  if (min < 60) return `${min} mnt`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} j`;
  const days = Math.round(min / 1440);
  if (days < 30) return `${days} hr`;
  if (days < 365) return `${Math.round(days / 30)} bln`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')} th`;
}
