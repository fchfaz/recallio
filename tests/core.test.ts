import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateBundleText, validateCardJson, jsonErrorOffset, LIMITS, BUNDLE_SCHEMA_ID, BUNDLE_VERSION } from '../src/core/schema';
import { SAMPLE_JSON } from '../src/core/sample';
import { GRADES, formatInterval, makeScheduler, newFsrsCard, previewIntervals, reviewCard, Rating } from '../src/core/scheduler';
import { planQueue } from '../src/core/queue';
import { makeCard } from '../src/db/repo';

const bundle = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ schema: 'recallio.deck-bundle', version: 1, decks: [{ name: 'D', cards: [{ front: 'a', back: 'b' }] }], ...over });

describe('validasi impor', () => {
  it('menerima sample bundle', () => {
    const r = validateBundleText(SAMPLE_JSON);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stats).toEqual({ decks: 1, cards: 6, withSchedule: 0 });
  });

  it('menolak teks kosong dan sintaks JSON rusak dengan lokasi', () => {
    expect(validateBundleText('   ').ok).toBe(false);
    const r = validateBundleText('{\n  "schema": ,\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.path).toBe('(sintaks JSON)');
      expect(r.errors[0]?.line).toBe(2);
      expect(r.errors[0]?.column).toBe(13);
    }
  });

  it('pemindai galat JSON konsisten dengan JSON.parse', () => {
    const cases = ['{"a":1}', '[1,2,3]', '{"a":[1,{"b":null}],"c":"x\\n"}', '{"a":1,}', '[1,,2]', '{"a" 1}', '"abc', '{a:1}', '01', '[1] x', 'tru'];
    for (const c of cases) {
      let valid = true;
      try {
        JSON.parse(c);
      } catch {
        valid = false;
      }
      expect(jsonErrorOffset(c) === -1, c).toBe(valid);
    }
  });

  it('melaporkan path galat yang presisi', () => {
    const r = validateBundleText(JSON.stringify({ schema: 'recallio.deck-bundle', version: 1, decks: [{ name: 'D', cards: [{ front: '', back: 'b' }] }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.path === 'decks[0].cards[0].front')).toBe(true);
  });

  it('menolak field asing, versi salah, dan skema salah', () => {
    expect(validateBundleText(bundle({ extra: 1 })).ok).toBe(false);
    expect(validateBundleText(bundle({ version: 2 })).ok).toBe(false);
    expect(validateBundleText(bundle({ schema: 'lain' })).ok).toBe(false);
  });

  it('menolak ID duplikat', () => {
    const decks = [{ name: 'D', cards: [{ id: 'x', front: 'a', back: 'b' }, { id: 'x', front: 'c', back: 'd' }] }];
    const r = validateBundleText(bundle({ decks }));
    expect(r.ok).toBe(false);
  });

  it('menormalkan tag & memberi peringatan duplikat depan', () => {
    const decks = [{ name: 'D', cards: [{ front: 'a', back: 'b', tags: [' N5 '] }, { front: 'A', back: 'c' }] }];
    const r = validateBundleText(bundle({ decks }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.decks[0]?.cards[0]?.tags).toEqual(['n5']);
      expect(r.warnings.length).toBe(1);
    }
  });

  it('menolak jadwal dengan tanggal tidak valid', () => {
    const decks = [{ name: 'D', cards: [{ front: 'a', back: 'b', schedule: { due: 'besok', stability: 1, difficulty: 5, state: 2, reps: 1, lapses: 0 } }] }];
    expect(validateBundleText(bundle({ decks })).ok).toBe(false);
  });

  it('menolak file terlalu besar', () => {
    const big = ' '.repeat(LIMITS.maxFileBytes + 1);
    expect(validateBundleText(big).ok).toBe(false);
  });

  it('validasi kartu tunggal (editor JSON)', () => {
    expect(validateCardJson('{"front":"a","back":"b"}').ok).toBe(true);
    expect(validateCardJson('{"front":"a"}').ok).toBe(false);
    expect(validateCardJson('{"front":"a","back":"b","x":1}').ok).toBe(false);
  });
});

describe('berkas contoh', () => {
  it('docs/examples/sample.deck.json lolos validasi', () => {
    const text = readFileSync(new URL('../docs/examples/sample.deck.json', import.meta.url), 'utf8');
    const r = validateBundleText(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stats).toEqual({ decks: 2, cards: 5, withSchedule: 1 });
  });

  it('JSON Schema memakai konstanta yang sama dengan Zod', () => {
    const js = JSON.parse(readFileSync(new URL('../docs/schema/deck-bundle.v1.schema.json', import.meta.url), 'utf8'));
    expect(js.properties.schema.const).toBe(BUNDLE_SCHEMA_ID);
    expect(js.properties.version.const).toBe(BUNDLE_VERSION);
    expect(js.$defs.card.properties.front.maxLength).toBe(LIMITS.front);
    expect(js.$defs.card.properties.back.maxLength).toBe(LIMITS.back);
    expect(js.$defs.deck.properties.cards.maxItems).toBe(LIMITS.maxCardsPerDeck);
  });
});

describe('FSRS', () => {
  const f = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
  const t0 = new Date('2026-10-27T08:00:00Z');

  it('interval Easy ≥ Good ≥ Hard ≥ Again pada kartu baru', () => {
    const rec = f.repeat(newFsrsCard(t0), t0);
    const due = GRADES.map((g) => rec[g].card.due.getTime());
    expect(due).toEqual([...due].sort((a, b) => a - b));
  });

  it('Good berulang menaikkan stabilitas dan jarak jatuh tempo', () => {
    let card = newFsrsCard(t0);
    let now = t0;
    let prevGap = 0;
    for (let i = 0; i < 4; i++) {
      const { next } = reviewCard(f, card, Rating.Good, now);
      const gap = next.due.getTime() - now.getTime();
      expect(gap).toBeGreaterThan(prevGap);
      prevGap = gap;
      card = next;
      now = next.due;
    }
    expect(card.reps).toBe(4);
  });

  it('Again pada kartu review menambah lapses', () => {
    let card = newFsrsCard(t0);
    let now = t0;
    for (let i = 0; i < 3; i++) {
      card = reviewCard(f, card, Rating.Good, now).next;
      now = card.due;
    }
    const lapsed = reviewCard(f, card, Rating.Again, now).next;
    expect(lapsed.lapses).toBe(card.lapses + 1);
  });

  it('pratinjau & format interval', () => {
    const p = previewIntervals(f, newFsrsCard(t0), t0);
    expect(Object.keys(p)).toHaveLength(4);
    expect(formatInterval(0, 20_000)).toBe('<1 mnt');
    expect(formatInterval(0, 10 * 60_000)).toBe('10 mnt');
    expect(formatInterval(0, 3 * 86_400_000)).toBe('3 hr');
  });
});

describe('antrean harian', () => {
  const now = Date.now();
  const mk = (n: number, deckId = 'd1') =>
    Array.from({ length: n }, (_, i) => makeCard(deckId, { front: `f${i}`, back: 'b', hint: '', tags: [] }, `c${deckId}${i}`, now - 1000 - i));

  it('membatasi kartu baru per deck', () => {
    const { fresh } = planQueue(mk(30), new Map(), { newPerDay: 20, maxReviewsPerDay: 200 }, now);
    expect(fresh).toHaveLength(20);
  });

  it('memperhitungkan yang sudah dikerjakan hari ini', () => {
    const { fresh } = planQueue(mk(30), new Map([['d1', { fresh: 15, review: 0 }]]), { newPerDay: 20, maxReviewsPerDay: 200 }, now);
    expect(fresh).toHaveLength(5);
  });

  it('mengabaikan kartu suspended dan kartu belum jatuh tempo', () => {
    const cards = mk(3);
    cards[0]!.suspended = 1;
    cards[1]!.state = 2;
    cards[1]!.due = now + 86_400_000;
    cards[2]!.state = 2;
    cards[2]!.due = now - 1;
    const { due, fresh } = planQueue(cards, new Map(), { newPerDay: 20, maxReviewsPerDay: 200 }, now);
    expect(due).toHaveLength(1);
    expect(fresh).toHaveLength(0);
  });
});
