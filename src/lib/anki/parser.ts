import JSZip from 'jszip';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { AnkiImportPreview, AnkiParsedDeck, Card, Note, MediaItem } from '@/types';
import { renderClozeFront, renderClozeBack, getUniqueClozeIndices } from '@/lib/cloze/parser';

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

// Initialize SQL.js with local WASM file
export async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      try {
        return await initSqlJs({
          locateFile: (file) => (file.endsWith('.wasm') ? '/sql-wasm.wasm' : file),
        });
      } catch (err) {
        console.warn('Local sql-wasm.wasm failed, attempting CDN fallback...', err);
        return await initSqlJs({
          locateFile: () => 'https://sql.js.org/dist/sql-wasm.wasm',
        });
      }
    })();
  }
  return sqlJsPromise;
}

// Media file map type from Anki package
type MediaMap = Record<string, string>; // e.g. { "0": "image.png", "1": "audio.mp3" }

// Helper to sanitize HTML and map media
function processCardHtml(
  html: string,
  mediaMap: Record<string, string>,
  mediaDataUrls: Record<string, string>
): string {
  if (!html) return '';

  let processed = html;

  // 1. Replace [sound:filename.mp3] with HTML5 audio tags
  processed = processed.replace(/\[sound:(.*?)\]/gi, (_match, filename) => {
    const cleanFilename = filename.trim();
    const dataUrl = mediaDataUrls[cleanFilename];
    if (dataUrl) {
      return `<div class="my-2"><audio controls class="w-full max-w-xs h-8" src="${dataUrl}"></audio></div>`;
    }
    return `<span class="inline-flex items-center gap-1 text-xs text-amber-500 font-mono px-1.5 py-0.5 rounded bg-amber-500/10">🎵 ${cleanFilename}</span>`;
  });

  // 2. Replace <img src="filename"> with Base64 data URLs
  processed = processed.replace(/<img([^>]+)src=["']([^"']+)["']([^>]*)>/gi, (match, prefix, src, suffix) => {
    const cleanSrc = decodeURIComponent(src.trim());
    const dataUrl = mediaDataUrls[cleanSrc];
    if (dataUrl) {
      return `<img${prefix}src="${dataUrl}"${suffix} class="max-w-full h-auto rounded-lg my-2 shadow-sm border border-slate-700/50" loading="lazy" />`;
    }
    return match;
  });

  return processed;
}

// Render Anki template with note field values
function renderTemplate(
  template: string,
  fields: Record<string, string>,
  frontSideHtml?: string,
  clozeIndex?: number
): string {
  let output = template;

  if (frontSideHtml !== undefined) {
    output = output.replace(/\{\{FrontSide\}\}/g, frontSideHtml);
  }

  // Handle Cloze placeholders: {{cloze:FieldName}}
  output = output.replace(/\{\{cloze:(.*?)\}\}/g, (_match, fieldName) => {
    const rawVal = fields[fieldName.trim()] || '';
    if (clozeIndex !== undefined) {
      if (frontSideHtml === undefined) {
        // Front rendering of cloze
        return renderClozeFront(rawVal, clozeIndex);
      } else {
        // Back rendering of cloze
        return renderClozeBack(rawVal, clozeIndex);
      }
    }
    return rawVal;
  });

  // Replace standard {{FieldName}} placeholders
  for (const [key, val] of Object.entries(fields)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    output = output.replace(regex, val);
  }

  // Remove any unmatched Anki conditional blocks or unmatched tags
  output = output.replace(/\{\{#[^}]+\}\}/g, '');
  output = output.replace(/\{\{\/[^}]+\}\}/g, '');
  output = output.replace(/\{\{\^[^}]+\}\}/g, '');
  output = output.replace(/\{\{[^}]+\}\}/g, '');

  return output.trim();
}

/**
 * Main parser: takes an Anki .apkg File, extracts ZIP, reads collection.anki2 with SQL.js,
 * processes media, models, notes, cards and returns a preview ready for import.
 */
export async function parseAnkiPackage(
  file: File,
  onProgress?: (percent: number, message: string) => void
): Promise<AnkiImportPreview> {
  onProgress?.(10, 'Unpacking Anki .apkg archive...');
  const zip = await JSZip.loadAsync(file);

  // 1. Locate Anki SQLite database inside zip
  const dbFile =
    zip.file('collection.anki2') ||
    zip.file('collection.anki21') ||
    zip.file('collection.anki21b');

  if (!dbFile) {
    throw new Error('Invalid Anki package: collection.anki2 database not found.');
  }

  onProgress?.(25, 'Extracting media files...');
  // 2. Read media JSON mapping if present
  const mediaJsonFile = zip.file('media');
  let mediaMap: MediaMap = {};
  if (mediaJsonFile) {
    try {
      const mediaJsonStr = await mediaJsonFile.async('text');
      mediaMap = JSON.parse(mediaJsonStr);
    } catch (e) {
      console.warn('Failed to parse media index JSON:', e);
    }
  }

  // Extract all media blobs into Base64 data URLs
  const mediaDataUrls: Record<string, string> = {};
  const mediaCount = Object.keys(mediaMap).length;
  let mediaExtracted = 0;

  for (const [zipKey, originalFilename] of Object.entries(mediaMap)) {
    const zipEntry = zip.file(zipKey);
    if (zipEntry) {
      try {
        const blob = await zipEntry.async('blob');
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        mediaDataUrls[originalFilename] = dataUrl;
        mediaExtracted++;
      } catch (err) {
        console.warn(`Failed reading media item ${originalFilename}:`, err);
      }
    }
  }

  onProgress?.(45, 'Loading SQLite engine and opening database...');
  const SQL = await getSqlJs();
  const dbBytes = await dbFile.async('uint8array');
  const sqliteDb: Database = new SQL.Database(dbBytes);

  onProgress?.(60, 'Reading collection metadata, decks and card templates...');
  const warnings: string[] = [];

  // Query `col` table for models and decks
  const colRes = sqliteDb.exec('SELECT models, decks, conf FROM col LIMIT 1');
  if (!colRes || colRes.length === 0 || !colRes[0].values.length) {
    throw new Error('Anki collection table is empty or corrupt.');
  }

  const [modelsRaw, decksRaw] = colRes[0].values[0];
  const modelsDict = JSON.parse(modelsRaw as string);
  const decksDict = JSON.parse(decksRaw as string);

  // Extract all decks
  const parsedDecks: AnkiParsedDeck[] = [];
  const deckIdMap = new Map<string, string>(); // Anki did -> Deck name

  for (const [did, dVal] of Object.entries(decksDict) as [string, any][]) {
    // Filter out internal default empty root if applicable
    const deckName = dVal.name || 'Default';
    deckIdMap.set(did, deckName);
    parsedDecks.push({
      id: did,
      name: deckName,
      description: dVal.desc || '',
      noteCount: 0,
      cardCount: 0,
      selected: true,
    });
  }

  onProgress?.(75, 'Extracting notes and fields...');
  // Query notes table
  const notesRes = sqliteDb.exec('SELECT id, mid, flds, tags FROM notes');
  const rawNotesList: any[] = [];
  const noteById = new Map<number, { mid: string; fieldsDict: Record<string, string>; tags: string[]; rawFlds: string }>();

  if (notesRes.length > 0 && notesRes[0].values.length > 0) {
    for (const row of notesRes[0].values) {
      const nid = row[0] as number;
      const mid = String(row[1]);
      const fldsStr = (row[2] as string) || '';
      const tagsStr = (row[3] as string) || '';

      // Fields in Anki notes are delimited by 0x1F (\u001f)
      const fieldValues = fldsStr.split('\x1f');
      const model = modelsDict[mid];
      const fieldsDict: Record<string, string> = {};

      if (model && model.flds) {
        model.flds.forEach((f: any, idx: number) => {
          fieldsDict[f.name] = fieldValues[idx] || '';
        });
      } else {
        // Fallback fields
        fieldsDict['Front'] = fieldValues[0] || '';
        fieldsDict['Back'] = fieldValues[1] || '';
      }

      const tags = tagsStr
        .split(' ')
        .map((t) => t.trim())
        .filter(Boolean);

      noteById.set(nid, { mid, fieldsDict, tags, rawFlds: fldsStr });
      rawNotesList.push({ id: nid, mid, fieldsDict, tags });
    }
  }

  onProgress?.(88, 'Synthesizing flashcards and rendering templates...');
  // Query cards table
  const cardsRes = sqliteDb.exec(
    'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards'
  );

  const rawCardsList: Card[] = [];
  const now = Date.now();
  const todayIso = new Date(now).toISOString();

  if (cardsRes.length > 0 && cardsRes[0].values.length > 0) {
    for (const row of cardsRes[0].values) {
      const cid = String(row[0]);
      const nid = row[1] as number;
      const did = String(row[2]);
      const ord = row[3] as number; // Template index or cloze ordinal
      const reps = (row[9] as number) || 0;
      const lapses = (row[10] as number) || 0;

      const noteData = noteById.get(nid);
      if (!noteData) continue;

      const model = modelsDict[noteData.mid];
      const isCloze = model?.type === 1 || (model?.name && model.name.toLowerCase().includes('cloze'));

      let frontHtml = '';
      let backHtml = '';
      let hint: string | undefined;

      if (isCloze) {
        const clozeIndex = ord + 1; // Cloze indices are 1-based
        const firstFieldVal = Object.values(noteData.fieldsDict)[0] || '';
        frontHtml = renderClozeFront(firstFieldVal, clozeIndex);
        backHtml = renderClozeBack(firstFieldVal, clozeIndex);
        
        // Add extra field if exists
        const extraField = noteData.fieldsDict['Extra'] || noteData.fieldsDict['Back'] || '';
        if (extraField) {
          backHtml += `<div class="mt-4 pt-3 border-t border-slate-700/50">${extraField}</div>`;
        }
      } else if (model && model.tmpls && model.tmpls[ord]) {
        const tmpl = model.tmpls[ord];
        frontHtml = renderTemplate(tmpl.qfmt || '', noteData.fieldsDict);
        backHtml = renderTemplate(tmpl.afmt || '', noteData.fieldsDict, frontHtml);
      } else {
        // Fallback default
        const fieldVals = Object.values(noteData.fieldsDict);
        frontHtml = fieldVals[0] || 'Card Front';
        backHtml = fieldVals[1] || 'Card Back';
      }

      // Process media and sounds
      frontHtml = processCardHtml(frontHtml, mediaMap, mediaDataUrls);
      backHtml = processCardHtml(backHtml, mediaMap, mediaDataUrls);

      // Create Recallio card
      const card: Card = {
        id: `anki_${cid}`,
        noteId: `anki_n_${nid}`,
        deckId: did,
        front: frontHtml,
        back: backHtml,
        hint,
        cardType: isCloze ? 'cloze' : 'basic',
        clozeIndex: isCloze ? ord + 1 : undefined,
        tags: noteData.tags,
        due: todayIso,
        stability: reps > 0 ? 5 : 0,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 0,
        reps,
        lapses,
        state: reps > 0 ? 'review' : 'new',
        createdAt: now,
        updatedAt: now,
      };

      rawCardsList.push(card);

      // Update deck counts
      const targetDeck = parsedDecks.find((d) => d.id === did);
      if (targetDeck) {
        targetDeck.cardCount++;
      }
    }
  }

  // Count notes per deck
  for (const rawNote of rawNotesList) {
    const cardForNote = rawCardsList.find((c) => c.noteId === `anki_n_${rawNote.id}`);
    if (cardForNote) {
      const targetDeck = parsedDecks.find((d) => d.id === cardForNote.deckId);
      if (targetDeck) {
        targetDeck.noteCount++;
      }
    }
  }

  sqliteDb.close();

  onProgress?.(100, 'Import processing complete.');

  if (warnings.length === 0) {
    warnings.push('All Anki note fields, media assets, and cards parsed successfully.');
  }

  return {
    filename: file.name,
    decks: parsedDecks,
    totalNotes: rawNotesList.length,
    totalCards: rawCardsList.length,
    mediaCount: mediaExtracted,
    warnings,
    rawNotes: rawNotesList,
    rawCards: rawCardsList,
    rawMedia: mediaDataUrls,
  };
}
