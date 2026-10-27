import { z } from 'zod';

export const BUNDLE_SCHEMA_ID = 'recallio.deck-bundle' as const;
export const BUNDLE_VERSION = 1 as const;

export const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxDecks: 100,
  maxCardsPerDeck: 5000,
  maxTags: 20,
  front: 2000,
  back: 4000,
  hint: 500,
  deckName: 80,
  deckDescription: 500,
  tag: 32,
} as const;

const id = z
  .string()
  .min(1, 'ID tidak boleh kosong')
  .max(64, 'ID maksimal 64 karakter')
  .regex(/^[A-Za-z0-9_-]+$/, 'ID hanya boleh huruf, angka, "_" dan "-"');

const required = (max: number) =>
  z.string().trim().min(1, 'Tidak boleh kosong').max(max, `Maksimal ${max} karakter`);

const tag = z
  .string()
  .trim()
  .min(1, 'Tag tidak boleh kosong')
  .max(LIMITS.tag, `Tag maksimal ${LIMITS.tag} karakter`)
  .regex(/^[^,]+$/, 'Tag tidak boleh mengandung koma')
  .transform((t) => t.toLowerCase());

const isoDate = z.iso.datetime({ offset: true, error: 'Harus berupa tanggal ISO 8601, mis. 2026-10-27T08:00:00Z' });

/** Status jadwal FSRS (opsional; dipakai untuk backup/restore penuh). */
export const scheduleSchema = z.strictObject({
  due: isoDate,
  stability: z.number().min(0),
  difficulty: z.number().min(0).max(10),
  state: z.number().int().min(0).max(3),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  scheduledDays: z.number().min(0).default(0),
  learningSteps: z.number().int().min(0).default(0),
  lastReview: isoDate.optional(),
});

/** Input kartu dari form / editor JSON kartu tunggal. */
export const cardInputSchema = z.strictObject({
  front: required(LIMITS.front),
  back: required(LIMITS.back),
  hint: z.string().trim().max(LIMITS.hint, `Maksimal ${LIMITS.hint} karakter`).optional().default(''),
  tags: z.array(tag).max(LIMITS.maxTags, `Maksimal ${LIMITS.maxTags} tag`).optional().default([]),
});

export const bundleCardSchema = cardInputSchema.extend({
  id: id.optional(),
  schedule: scheduleSchema.optional(),
});

export const bundleDeckSchema = z.strictObject({
  id: id.optional(),
  name: required(LIMITS.deckName),
  description: z.string().trim().max(LIMITS.deckDescription).optional().default(''),
  cards: z.array(bundleCardSchema).max(LIMITS.maxCardsPerDeck, `Maksimal ${LIMITS.maxCardsPerDeck} kartu per deck`).default([]),
});

export const bundleSchema = z
  .strictObject({
    schema: z.literal(BUNDLE_SCHEMA_ID, { error: `Field "schema" harus bernilai "${BUNDLE_SCHEMA_ID}"` }),
    version: z.literal(BUNDLE_VERSION, { error: `Versi tidak didukung; yang didukung: ${BUNDLE_VERSION}` }),
    exportedAt: isoDate.optional(),
    decks: z.array(bundleDeckSchema).min(1, 'Minimal 1 deck').max(LIMITS.maxDecks, `Maksimal ${LIMITS.maxDecks} deck`),
  })
  .superRefine((b, ctx) => {
    const deckIds = new Map<string, number>();
    const cardIds = new Map<string, string>();
    b.decks.forEach((d, di) => {
      if (d.id) {
        if (deckIds.has(d.id)) {
          ctx.addIssue({ code: 'custom', path: ['decks', di, 'id'], message: `ID deck duplikat dengan decks[${deckIds.get(d.id)}]` });
        }
        deckIds.set(d.id, di);
      }
      d.cards.forEach((c, ci) => {
        if (!c.id) return;
        const here = `decks[${di}].cards[${ci}]`;
        if (cardIds.has(c.id)) {
          ctx.addIssue({ code: 'custom', path: ['decks', di, 'cards', ci, 'id'], message: `ID kartu duplikat dengan ${cardIds.get(c.id)}` });
        }
        cardIds.set(c.id, here);
      });
    });
  });

export type CardInput = z.infer<typeof cardInputSchema>;
export type Bundle = z.infer<typeof bundleSchema>;
export type BundleDeck = z.infer<typeof bundleDeckSchema>;
export type BundleCard = z.infer<typeof bundleCardSchema>;

/* ---------- Validasi bertahap untuk teks impor ---------- */

export interface ValidationIssue {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ImportStats {
  decks: number;
  cards: number;
  withSchedule: number;
}

export type ValidationResult =
  | { ok: true; data: Bundle; warnings: ValidationIssue[]; stats: ImportStats }
  | { ok: false; errors: ValidationIssue[] };

export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const p of path) {
    out += typeof p === 'number' ? `[${p}]` : out ? `.${String(p)}` : String(p);
  }
  return out || '(root)';
}

const offsetToLineCol = (text: string, offset: number) => {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
};

/**
 * Pemindai tata bahasa JSON minimal untuk menemukan posisi galat pertama.
 * Dipakai karena pesan JSON.parse berbeda-beda per browser dan sering tanpa posisi.
 * Mengembalikan -1 jika teks sebenarnya valid.
 */
export function jsonErrorOffset(s: string): number {
  let i = 0;
  const ws = () => {
    while (i < s.length && ' \t\n\r'.includes(s[i]!)) i++;
  };
  const fail = (): never => {
    throw { at: i };
  };
  const str = () => {
    i++;
    while (i < s.length) {
      const c = s[i]!;
      if (c === '"') return void i++;
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c < ' ') fail();
      i++;
    }
    fail();
  };
  const value = (depth = 0): void => {
    if (depth > 100) fail();
    ws();
    const c = s[i];
    if (c === '{') {
      i++;
      ws();
      if (s[i] === '}') return void i++;
      for (;;) {
        ws();
        if (s[i] !== '"') fail();
        str();
        ws();
        if (s[i] !== ':') fail();
        i++;
        value(depth + 1);
        ws();
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i] === '}') return void i++;
        fail();
      }
    } else if (c === '[') {
      i++;
      ws();
      if (s[i] === ']') return void i++;
      for (;;) {
        value(depth + 1);
        ws();
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i] === ']') return void i++;
        fail();
      }
    } else if (c === '"') str();
    else if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) fail();
      i += m![0].length;
    } else if (s.startsWith('true', i)) i += 4;
    else if (s.startsWith('false', i)) i += 5;
    else if (s.startsWith('null', i)) i += 4;
    else fail();
  };
  try {
    value();
    ws();
    if (i < s.length) fail();
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'at' in e) return (e as { at: number }).at;
    throw e;
  }
  return -1;
}

/** Cari baris/kolom galat JSON: pakai pesan browser bila ada, jika tidak pindai sendiri. */
export function locateJsonError(text: string, message: string): { line?: number; column?: number } {
  const lc = /line (\d+) column (\d+)/i.exec(message);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/i.exec(message);
  if (pos) return offsetToLineCol(text, Number(pos[1]));
  const off = jsonErrorOffset(text);
  return off >= 0 ? offsetToLineCol(text, off) : {};
}

/**
 * Tahap validasi: (1) ukuran → (2) sintaks JSON → (3) struktur & tipe (Zod) → (4) peringatan semantik.
 * Tidak pernah melempar; selalu mengembalikan hasil terstruktur.
 */
export function validateBundleText(text: string): ValidationResult {
  const bytes = new Blob([text]).size;
  if (bytes === 0 || text.trim() === '') {
    return { ok: false, errors: [{ path: '(root)', message: 'Konten kosong' }] };
  }
  if (bytes > LIMITS.maxFileBytes) {
    return { ok: false, errors: [{ path: '(root)', message: `Ukuran ${(bytes / 1048576).toFixed(1)} MB melebihi batas ${LIMITS.maxFileBytes / 1048576} MB` }] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [{ path: '(sintaks JSON)', message, ...locateJsonError(text, message) }] };
  }

  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 50).map((i) => ({
      path: formatPath(i.path),
      message: i.code === 'unrecognized_keys' ? `Field tidak dikenal: ${i.keys.join(', ')}` : i.message,
    }));
    const extra = parsed.error.issues.length - errors.length;
    if (extra > 0) errors.push({ path: '…', message: `dan ${extra} galat lain` });
    return { ok: false, errors };
  }

  const warnings: ValidationIssue[] = [];
  let cards = 0;
  let withSchedule = 0;
  parsed.data.decks.forEach((d, di) => {
    const seen = new Map<string, number>();
    d.cards.forEach((c, ci) => {
      cards++;
      if (c.schedule) withSchedule++;
      const key = c.front.toLowerCase();
      if (seen.has(key)) {
        warnings.push({ path: `decks[${di}].cards[${ci}].front`, message: `Sisi depan sama dengan kartu ke-${seen.get(key)! + 1}; akan dilewati saat impor jika tanpa ID` });
      } else seen.set(key, ci);
    });
    if (d.cards.length === 0) warnings.push({ path: `decks[${di}].cards`, message: 'Deck tanpa kartu' });
  });

  return { ok: true, data: parsed.data, warnings, stats: { decks: parsed.data.decks.length, cards, withSchedule } };
}

/** Validasi satu kartu dari editor JSON. */
export function validateCardJson(text: string): { ok: true; data: CardInput } | { ok: false; errors: ValidationIssue[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [{ path: '(sintaks JSON)', message, ...locateJsonError(text, message) }] };
  }
  const r = cardInputSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({
      path: formatPath(i.path),
      message: i.code === 'unrecognized_keys' ? `Field tidak dikenal: ${i.keys.join(', ')}` : i.message,
    })),
  };
}
