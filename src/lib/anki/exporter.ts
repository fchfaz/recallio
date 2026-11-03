import JSZip from 'jszip';
import { getSqlJs } from '@/lib/anki/parser';
import { db } from '@/lib/db/database';
import type { Deck, Card, Note } from '@/types';

/**
 * Export selected deck (or all decks) to Anki .apkg file
 */
export async function exportDeckToAnki(deckId?: string): Promise<Blob> {
  const SQL = await getSqlJs();
  const sqliteDb = new SQL.Database();

  // Create Anki 2.0 schema
  sqliteDb.run(`
    CREATE TABLE col (
      id integer primary key,
      crt integer not null,
      mod integer not null,
      scm integer not null,
      ver integer not null,
      dty integer not null,
      usn integer not null,
      ls integer not null,
      conf text not null,
      models text not null,
      decks text not null,
      dconf text not null,
      tags text not null
    );
    CREATE TABLE notes (
      id integer primary key,
      guid text not null,
      mid integer not null,
      mod integer not null,
      usn integer not null,
      tags text not null,
      flds text not null,
      sfld text not null,
      csum integer not null,
      flags integer not null,
      data text not null
    );
    CREATE TABLE cards (
      id integer primary key,
      nid integer not null,
      did integer not null,
      ord integer not null,
      mod integer not null,
      usn integer not null,
      type integer not null,
      queue integer not null,
      due integer not null,
      ivl integer not null,
      factor integer not null,
      reps integer not null,
      lapses integer not null,
      left integer not null,
      odue integer not null,
      odid integer not null,
      flags integer not null,
      data text not null
    );
    CREATE TABLE revlog (
      id integer primary key,
      cid integer not null,
      usn integer not null,
      ease integer not null,
      ivl integer not null,
      lastIvl integer not null,
      factor integer not null,
      time integer not null,
      type integer not null
    );
    CREATE INDEX ix_notes_usn on notes (usn);
    CREATE INDEX ix_cards_usn on cards (usn);
    CREATE INDEX ix_cards_nid on cards (nid);
    CREATE INDEX ix_cards_sched on cards (did, queue, due);
    CREATE INDEX ix_revlog_usn on revlog (usn);
    CREATE INDEX ix_revlog_cid on revlog (cid);
  `);

  const nowSec = Math.floor(Date.now() / 1000);

  // Retrieve data from Dexie
  const decks = deckId ? [await db.decks.get(deckId)].filter(Boolean) as Deck[] : await db.decks.toArray();
  const deckIds = new Set(decks.map((d) => d.id));
  
  const allCards = await db.cards.toArray();
  const cards = allCards.filter((c) => deckIds.has(c.deckId));
  const cardNoteIds = new Set(cards.map((c) => c.noteId));

  const allNotes = await db.notes.toArray();
  const notes = allNotes.filter((n) => cardNoteIds.has(n.id));

  // Define Basic Note Model
  const basicModelId = 1600000000001;
  const modelsDict = {
    [basicModelId]: {
      id: basicModelId,
      name: 'Recallio Basic',
      type: 0,
      mod: nowSec,
      usn: -1,
      sortf: 0,
      did: 1,
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}',
          afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
          bqfmt: '',
          bafmt: '',
          did: null,
        },
      ],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20 },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20 },
      ],
      css: '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }',
    },
  };

  // Build decks dict
  const decksDict: Record<string, any> = {
    '1': {
      id: 1,
      name: 'Default',
      desc: '',
      mod: nowSec,
      usn: 0,
      collapsed: false,
      browserCollapsed: false,
    },
  };

  const deckNumericIdMap = new Map<string, number>();
  let nextNumericDeckId = 1700000000000;

  for (const d of decks) {
    const numId = nextNumericDeckId++;
    deckNumericIdMap.set(d.id, numId);
    decksDict[String(numId)] = {
      id: numId,
      name: d.name,
      desc: d.description || '',
      mod: nowSec,
      usn: -1,
      collapsed: false,
      browserCollapsed: false,
    };
  }

  // Insert collection row
  sqliteDb.run(
    `INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      nowSec,
      Date.now(),
      Date.now(),
      11,
      0,
      0,
      0,
      '{}',
      JSON.stringify(modelsDict),
      JSON.stringify(decksDict),
      '{}',
      '{}',
    ]
  );

  // Insert Notes
  const noteNumericIdMap = new Map<string, number>();
  let nextNumericNoteId = 1800000000000;

  for (const n of notes) {
    const numId = nextNumericNoteId++;
    noteNumericIdMap.set(n.id, numId);

    const fFront = n.fields.front || '';
    const fBack = n.fields.back || '';
    const flds = `${fFront}\x1f${fBack}`;
    const sfld = fFront.replace(/<[^>]*>/g, '').slice(0, 30);
    const tagsStr = n.tags ? ` ${n.tags.join(' ')} ` : '';

    sqliteDb.run(
      `INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numId,
        `rec_${numId}`,
        basicModelId,
        nowSec,
        -1,
        tagsStr,
        flds,
        sfld,
        0,
        0,
        '',
      ]
    );
  }

  // Insert Cards
  let nextNumericCardId = 1900000000000;
  for (const c of cards) {
    const numCardId = nextNumericCardId++;
    const numNoteId = noteNumericIdMap.get(c.noteId) || nextNumericNoteId++;
    const numDeckId = deckNumericIdMap.get(c.deckId) || 1;

    sqliteDb.run(
      `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numCardId,
        numNoteId,
        numDeckId,
        0, // ord
        nowSec,
        -1,
        c.reps > 0 ? 2 : 0, // type: 2=review, 0=new
        c.reps > 0 ? 2 : 0, // queue
        0, // due
        Math.max(1, Math.round(c.stability || 1)), // ivl
        2500, // factor
        c.reps || 0,
        c.lapses || 0,
        0,
        0,
        0,
        0,
        '',
      ]
    );
  }

  // Export SQLite database binary
  const binaryDb = sqliteDb.export();
  sqliteDb.close();

  // Create .apkg ZIP archive
  const zip = new JSZip();
  zip.file('collection.anki2', binaryDb);
  zip.file('media', '{}');

  const apkgBlob = await zip.generateAsync({ type: 'blob' });
  return apkgBlob;
}

/**
 * Export full database JSON backup
 */
export async function exportJsonBackup(): Promise<Blob> {
  const decks = await db.decks.toArray();
  const notes = await db.notes.toArray();
  const cards = await db.cards.toArray();
  const reviews = await db.reviews.toArray();
  const settings = await db.settings.get('user_settings');

  const backupData = {
    version: 1,
    appName: 'Recallio',
    exportedAt: new Date().toISOString(),
    decks,
    notes,
    cards,
    reviews,
    settings,
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  return new Blob([jsonStr], { type: 'application/json' });
}

/**
 * Restore from JSON backup
 */
export async function restoreJsonBackup(jsonStr: string): Promise<{
  decksRestored: number;
  notesRestored: number;
  cardsRestored: number;
}> {
  const parsed = JSON.parse(jsonStr);
  if (!parsed.decks || !parsed.cards) {
    throw new Error('Invalid Recallio backup format: Missing decks or cards.');
  }

  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, db.settings, async () => {
    if (Array.isArray(parsed.decks) && parsed.decks.length > 0) {
      await db.decks.bulkPut(parsed.decks);
    }
    if (Array.isArray(parsed.notes) && parsed.notes.length > 0) {
      await db.notes.bulkPut(parsed.notes);
    }
    if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
      await db.cards.bulkPut(parsed.cards);
    }
    if (Array.isArray(parsed.reviews) && parsed.reviews.length > 0) {
      await db.reviews.bulkPut(parsed.reviews);
    }
    if (parsed.settings) {
      await db.settings.put(parsed.settings);
    }
  });

  return {
    decksRestored: parsed.decks?.length || 0,
    notesRestored: parsed.notes?.length || 0,
    cardsRestored: parsed.cards?.length || 0,
  };
}

/**
 * Helper to download any Blob
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
