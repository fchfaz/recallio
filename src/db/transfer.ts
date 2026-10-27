import { createEmptyCard, type Card, type State } from 'ts-fsrs';
import { db } from './db';
import { makeCard, uid } from './repo';
import {
  BUNDLE_SCHEMA_ID,
  BUNDLE_VERSION,
  type Bundle,
  type BundleCard,
} from '../core/schema';
import type { CardRecord } from '../core/types';

export interface ImportReport {
  decksCreated: number;
  decksMatched: number;
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkipped: number;
}

function scheduleToFsrs(s: NonNullable<BundleCard['schedule']>, now: Date): Card {
  return {
    ...createEmptyCard(now),
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    state: s.state as State,
    reps: s.reps,
    lapses: s.lapses,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    ...(s.lastReview ? { last_review: new Date(s.lastReview) } : {}),
  };
}

/**
 * Terapkan bundle yang SUDAH tervalidasi ke IndexedDB dalam satu transaksi (atomik:
 * jika gagal di tengah, tidak ada perubahan sebagian).
 * Aturan pencocokan:
 *  - Deck: cocok berdasarkan `id`, jika tidak ada → nama (tanpa beda huruf besar/kecil), jika tidak → buat baru.
 *  - Kartu: cocok berdasarkan `id` → perbarui isi (jadwal ikut diperbarui hanya bila `schedule` ada);
 *           tanpa `id` → lewati bila sisi depan sama dengan kartu yang sudah ada di deck, selain itu buat baru.
 */
export async function applyBundle(bundle: Bundle): Promise<ImportReport> {
  const report: ImportReport = { decksCreated: 0, decksMatched: 0, cardsCreated: 0, cardsUpdated: 0, cardsSkipped: 0 };
  const now = Date.now();

  await db.transaction('rw', db.decks, db.cards, async () => {
    const allDecks = await db.decks.toArray();
    for (const d of bundle.decks) {
      let deck = (d.id ? allDecks.find((x) => x.id === d.id) : undefined) ?? allDecks.find((x) => x.name.toLowerCase() === d.name.toLowerCase());
      if (deck) {
        report.decksMatched++;
      } else {
        deck = { id: d.id ?? uid(), name: d.name, description: d.description ?? '', createdAt: now, updatedAt: now };
        await db.decks.add(deck);
        allDecks.push(deck);
        report.decksCreated++;
      }

      const existing = await db.cards.where('deckId').equals(deck.id).toArray();
      const fronts = new Set(existing.map((c) => c.front.toLowerCase()));
      const byId = new Map(existing.map((c) => [c.id, c]));

      for (const c of d.cards) {
        const prev = c.id ? (byId.get(c.id) ?? (await db.cards.get(c.id))) : undefined;
        if (prev) {
          const patch: Partial<CardRecord> = { front: c.front, back: c.back, hint: c.hint ?? '', tags: c.tags ?? [], updatedAt: now, deckId: deck.id };
          if (c.schedule) {
            const f = scheduleToFsrs(c.schedule, new Date(now));
            Object.assign(patch, { fsrs: f, due: f.due.getTime(), state: f.state });
          }
          await db.cards.update(prev.id, patch);
          report.cardsUpdated++;
          continue;
        }
        if (!c.id && fronts.has(c.front.toLowerCase())) {
          report.cardsSkipped++;
          continue;
        }
        const rec = makeCard(deck.id, c, c.id ?? uid(), now);
        if (c.schedule) {
          const f = scheduleToFsrs(c.schedule, new Date(now));
          rec.fsrs = f;
          rec.due = f.due.getTime();
          rec.state = f.state;
        }
        await db.cards.add(rec);
        fronts.add(c.front.toLowerCase());
        report.cardsCreated++;
      }
    }
  });
  return report;
}

export async function buildExport(opts: { deckId?: string; includeSchedule: boolean }): Promise<Bundle> {
  const decks = opts.deckId ? [await db.decks.get(opts.deckId)].filter((d) => !!d) : await db.decks.toArray();
  const out: Bundle = {
    schema: BUNDLE_SCHEMA_ID,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    decks: [],
  };
  for (const d of decks) {
    if (!d) continue;
    const cards = await db.cards.where('deckId').equals(d.id).sortBy('createdAt');
    out.decks.push({
      id: d.id,
      name: d.name,
      description: d.description,
      cards: cards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        hint: c.hint,
        tags: c.tags,
        ...(opts.includeSchedule
          ? {
              schedule: {
                due: new Date(c.fsrs.due).toISOString(),
                stability: c.fsrs.stability,
                difficulty: c.fsrs.difficulty,
                state: c.fsrs.state,
                reps: c.fsrs.reps,
                lapses: c.fsrs.lapses,
                scheduledDays: c.fsrs.scheduled_days,
                learningSteps: c.fsrs.learning_steps,
                ...(c.fsrs.last_review ? { lastReview: new Date(c.fsrs.last_review).toISOString() } : {}),
              },
            }
          : {}),
      })),
    });
  }
  return out;
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
