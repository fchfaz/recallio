import JSZip from 'jszip';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { AnkiImportPreview, AnkiParsedDeck, Card, Note, CardState } from '@/types';
import { renderClozeFront, renderClozeBack } from '@/lib/cloze/parser';

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

// Initialize SQL.js with local WASM binary and fallback
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
type MediaMap = Record<string, string>; // e.g. { "0": "yomitan_audio.mp3" }

/**
 * Japanese Furigana converters for Anki Japanese models (e.g. JP Mining Note)
 * Anki furigana notation: "漢字[かんじ]" or " 日本[にほん]語[ご]"
 */
export function formatFuriganaRuby(text: string): string {
  if (!text) return '';
  // Match word[ruby] or space+word[ruby]
  return text.replace(/(?:^|\s)?([^\s>\[\]]+)\[([^\s>\[\]]+)\]/g, (_match, kanji, kana) => {
    return `<ruby>${kanji}<rt>${kana}</rt></ruby>`;
  });
}

export function formatFuriganaKanaOnly(text: string): string {
  if (!text) return '';
  return text.replace(/(?:^|\s)?([^\s>\[\]]+)\[([^\s>\[\]]+)\]/g, '$2');
}

export function formatFuriganaKanjiOnly(text: string): string {
  if (!text) return '';
  return text.replace(/(?:^|\s)?([^\s>\[\]]+)\[([^\s>\[\]]+)\]/g, '$1');
}

export function stripHtml(text: string): string {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Helper to process media references in HTML:
 * - [sound:filename.mp3] -> HTML5 <audio> tag
 * - <img src="filename.png"> -> resolved Base64 data URL
 */
export function processCardHtml(
  html: string,
  mediaDataUrls: Record<string, string>
): string {
  if (!html) return '';

  let processed = html;

  // 1. Replace [sound:filename] with audio player
  processed = processed.replace(/\[sound:(.*?)\]/gi, (_match, rawFilename) => {
    const cleanFilename = decodeURIComponent(rawFilename.trim());
    const dataUrl = mediaDataUrls[cleanFilename] || mediaDataUrls[rawFilename.trim()];
    if (dataUrl) {
      return `<div class="my-2 inline-block"><audio controls class="h-8 max-w-[220px]" src="${dataUrl}"></audio></div>`;
    }
    return `<span class="inline-flex items-center gap-1 text-xs text-amber-500 font-mono px-2 py-0.5 rounded bg-amber-500/10">🎵 ${cleanFilename}</span>`;
  });

  // 2. Replace <img src="..."> references
  processed = processed.replace(
    /<img([^>]+)src=["']([^"']+)["']([^>]*)>/gi,
    (match, prefix, src, suffix) => {
      const cleanSrc = decodeURIComponent(src.trim());
      const dataUrl = mediaDataUrls[cleanSrc] || mediaDataUrls[src.trim()];
      if (dataUrl) {
        return `<img${prefix}src="${dataUrl}"${suffix} class="max-w-full h-auto rounded-lg my-2 shadow-sm border border-slate-700/30 inline-block" loading="lazy" />`;
      }
      return match;
    }
  );

  return processed;
}

/**
 * Check if a field value is non-empty for Anki conditionals {{#Field}}...{{/Field}}
 */
function isFieldNonEmpty(val: string | undefined): boolean {
  if (!val) return false;
  const stripped = val.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
  return stripped.length > 0;
}

/**
 * Anki Template Renderer:
 * Handles:
 * - {{#FieldName}}...{{/FieldName}} (conditional block)
 * - {{^FieldName}}...{{/FieldName}} (inverted conditional block)
 * - {{furigana:FieldName}}
 * - {{kanji:FieldName}}
 * - {{kana:FieldName}}
 * - {{text:FieldName}}
 * - {{hint:FieldName}}
 * - {{cloze:FieldName}}
 * - {{FrontSide}}
 * - {{FieldName}}
 */
export function renderAnkiTemplate(
  template: string,
  fields: Record<string, string>,
  frontSideHtml?: string,
  clozeIndex?: number
): string {
  if (!template) return '';
  let output = template;

  // 1. Substitute FrontSide on back template
  if (frontSideHtml !== undefined) {
    output = output.replace(/\{\{FrontSide\}\}/g, frontSideHtml);
  }

  // 2. Handle conditional sections: {{#FieldName}}...{{/FieldName}}
  const sectionRegex = /\{\{#([^\}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  output = output.replace(sectionRegex, (_match, fieldName, innerContent) => {
    const val = fields[fieldName.trim()];
    return isFieldNonEmpty(val) ? innerContent : '';
  });

  // 3. Handle inverted conditional sections: {{^FieldName}}...{{/FieldName}}
  const invertedRegex = /\{\{\^([^\}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  output = output.replace(invertedRegex, (_match, fieldName, innerContent) => {
    const val = fields[fieldName.trim()];
    return !isFieldNonEmpty(val) ? innerContent : '';
  });

  // 4. Handle Cloze placeholders: {{cloze:FieldName}}
  output = output.replace(/\{\{cloze:([^\}]+)\}\}/g, (_match, fieldName) => {
    const rawVal = fields[fieldName.trim()] || '';
    if (clozeIndex !== undefined) {
      if (frontSideHtml === undefined) {
        return renderClozeFront(rawVal, clozeIndex);
      } else {
        return renderClozeBack(rawVal, clozeIndex);
      }
    }
    return rawVal;
  });

  // 5. Handle Furigana and Japanese filters
  output = output.replace(/\{\{furigana:([^\}]+)\}\}/g, (_match, fieldName) => {
    const rawVal = fields[fieldName.trim()] || '';
    return formatFuriganaRuby(rawVal);
  });

  output = output.replace(/\{\{kana:([^\}]+)\}\}/g, (_match, fieldName) => {
    const rawVal = fields[fieldName.trim()] || '';
    return formatFuriganaKanaOnly(rawVal);
  });

  output = output.replace(/\{\{kanji:([^\}]+)\}\}/g, (_match, fieldName) => {
    const rawVal = fields[fieldName.trim()] || '';
    return formatFuriganaKanjiOnly(rawVal);
  });

  output = output.replace(/\{\{text:([^\}]+)\}\}/g, (_match, fieldName) => {
    const rawVal = fields[fieldName.trim()] || '';
    return stripHtml(rawVal);
  });

  output = output.replace(/\{\{hint:([^\}]+)\}\}/g, (_match, fieldName) => {
    const rawVal = fields[fieldName.trim()] || '';
    if (!rawVal.trim()) return '';
    return `<details class="my-2 p-2 rounded bg-slate-100 dark:bg-slate-800 text-xs"><summary class="cursor-pointer font-bold text-indigo-500">Hint</summary><div class="mt-1">${rawVal}</div></details>`;
  });

  // 6. Replace standard {{FieldName}} tags
  for (const [key, val] of Object.entries(fields)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    output = output.replace(regex, val);
  }

  // 7. Strip leftover unhandled mustache blocks e.g. {{type:...}}
  output = output.replace(/\{\{#[^}]+\}\}/g, '');
  output = output.replace(/\{\{\/[^}]+\}\}/g, '');
  output = output.replace(/\{\{\^[^}]+\}\}/g, '');
  output = output.replace(/\{\{[^}]+\}\}/g, '');

  return output.trim();
}

// Helper to determine MIME type from filename
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
      return 'audio/mp4';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

// Convert Uint8Array to Base64 data URL cleanly in any environment
export function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Main parser: takes an Anki .apkg File, extracts ZIP, reads collection.anki21 or collection.anki2,
 * processes media, models, notes, cards and returns a preview ready for import.
 */
export async function parseAnkiPackage(
  file: File | Uint8Array | ArrayBuffer,
  onProgress?: (percent: number, message: string) => void,
  fileName: string = 'package.apkg'
): Promise<AnkiImportPreview> {
  const actualFileName = file instanceof File ? file.name : fileName;

  onProgress?.(5, 'Opening and verifying .apkg archive...');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err: any) {
    throw new Error(`Invalid ZIP archive: The file "${actualFileName}" is not a valid Anki package or is corrupted.`);
  }

  // ============================================================================
  // Requirement 1: Database Detection Logic
  // Prioritize `collection.anki21` whenever it exists.
  // Fall back to `collection.anki2` only if `collection.anki21` is NOT present.
  // If neither exists, return a descriptive unsupported-format error.
  // Never silently fall back to legacy if collection.anki21 fails to parse.
  // ============================================================================
  const anki21Entry = zip.file('collection.anki21');
  const anki2Entry = zip.file('collection.anki2');

  let dbFile: JSZip.JSZipObject;
  let primaryDatabase: 'collection.anki21' | 'collection.anki2';

  if (anki21Entry) {
    dbFile = anki21Entry;
    primaryDatabase = 'collection.anki21';
  } else if (anki2Entry) {
    dbFile = anki2Entry;
    primaryDatabase = 'collection.anki2';
  } else {
    throw new Error(
      `Unsupported Anki package format: Neither "collection.anki21" nor "collection.anki2" was found in "${actualFileName}".`
    );
  }

  onProgress?.(15, `Extracting primary database (${primaryDatabase})...`);
  const dbBytes = await dbFile.async('uint8array');

  // ============================================================================
  // Requirement 2: SQLite Header & Format Validation
  // Validate standard SQLite 3 header ("SQLite format 3\0")
  // ============================================================================
  if (dbBytes.length < 16) {
    throw new Error(
      `Corrupted database: The selected database "${primaryDatabase}" is truncated (${dbBytes.length} bytes).`
    );
  }

  const headerStr = String.fromCharCode(...dbBytes.subarray(0, 16));
  if (headerStr !== 'SQLite format 3\0') {
    throw new Error(
      `Unsupported database format: "${primaryDatabase}" does not have a valid SQLite 3 header. Found: "${headerStr}".`
    );
  }

  onProgress?.(25, 'Extracting media mapping and assets...');
  // ============================================================================
  // Requirement 6: Media Extraction
  // Read "media" JSON map, mapping numeric archive filenames (e.g. "23")
  // to original media filenames (e.g. "yomitan_audio_...mp3")
  // ============================================================================
  const mediaJsonFile = zip.file('media');
  let mediaMap: MediaMap = {};
  let mediaMappingEntries = 0;

  if (mediaJsonFile) {
    try {
      const mediaJsonStr = await mediaJsonFile.async('text');
      mediaMap = JSON.parse(mediaJsonStr);
      mediaMappingEntries = Object.keys(mediaMap).length;
    } catch (e: any) {
      throw new Error(`Invalid media mapping: Failed to parse media index JSON: ${e.message}`);
    }
  }

  const mediaDataUrls: Record<string, string> = {};
  let mediaExtracted = 0;

  for (const [zipKey, originalFilename] of Object.entries(mediaMap)) {
    const zipEntry = zip.file(zipKey);
    if (zipEntry) {
      try {
        const bytes = await zipEntry.async('uint8array');
        const mime = getMimeType(originalFilename);
        const dataUrl = uint8ArrayToDataUrl(bytes, mime);
        mediaDataUrls[originalFilename] = dataUrl;
        mediaExtracted++;
      } catch (err) {
        console.warn(`Could not extract media asset ${originalFilename} (${zipKey}):`, err);
      }
    }
  }

  onProgress?.(40, 'Initializing SQLite WebAssembly engine...');
  let SQL: SqlJsStatic;
  try {
    SQL = await getSqlJs();
  } catch (err: any) {
    throw new Error(`SQLite initialization failure: Could not load sql.js engine: ${err.message}`);
  }

  let sqliteDb: Database;
  try {
    sqliteDb = new SQL.Database(dbBytes);
  } catch (err: any) {
    throw new Error(
      `Failed to open SQLite database "${primaryDatabase}": ${err.message}. The database may be corrupt.`
    );
  }

  // Verify essential SQLite tables
  const masterRes = sqliteDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const existingTables = new Set(
    masterRes[0]?.values.map((row) => String(row[0]).toLowerCase()) || []
  );

  const requiredTables = ['col', 'notes', 'cards'];
  for (const table of requiredTables) {
    if (!existingTables.has(table)) {
      sqliteDb.close();
      throw new Error(
        `Corrupted database: Missing required table "${table}" in "${primaryDatabase}".`
      );
    }
  }

  onProgress?.(55, 'Parsing collection metadata, decks and models...');
  const colRes = sqliteDb.exec('SELECT id, crt, mod, scm, ver, models, decks, conf FROM col LIMIT 1');
  if (!colRes || colRes.length === 0 || !colRes[0].values.length) {
    sqliteDb.close();
    throw new Error(`Corrupted database: Table "col" is empty in "${primaryDatabase}".`);
  }

  const colRow = colRes[0].values[0];
  const colVersion = colRow[4];
  const modelsRaw = colRow[5] as string;
  const decksRaw = colRow[6] as string;

  let modelsDict: Record<string, any> = {};
  let decksDict: Record<string, any> = {};

  try {
    modelsDict = JSON.parse(modelsRaw);
  } catch (e: any) {
    sqliteDb.close();
    throw new Error(`Corrupted database: Failed to parse models JSON in "col": ${e.message}`);
  }

  try {
    decksDict = JSON.parse(decksRaw);
  } catch (e: any) {
    sqliteDb.close();
    throw new Error(`Corrupted database: Failed to parse decks JSON in "col": ${e.message}`);
  }

  const noteTypeCount = Object.keys(modelsDict).length;
  let maxFieldsInModel = 0;
  let totalTemplatesCount = 0;

  for (const m of Object.values(modelsDict) as any[]) {
    if (m.flds && Array.isArray(m.flds)) {
      if (m.flds.length > maxFieldsInModel) {
        maxFieldsInModel = m.flds.length;
      }
    }
    if (m.tmpls && Array.isArray(m.tmpls)) {
      totalTemplatesCount += m.tmpls.length;
    }
  }

  // ============================================================================
  // Requirement 5: Deck Hierarchy
  // Preserve deck names, IDs, and parent-child hierarchy (e.g. KANJI JFT -> KANJI JFT::...)
  // ============================================================================
  const parsedDecks: AnkiParsedDeck[] = [];
  const deckNameMap = new Map<string, string>(); // deckId -> deckName
  const deckByNameMap = new Map<string, string>(); // deckName -> deckId

  for (const [did, dVal] of Object.entries(decksDict) as [string, any][]) {
    const deckName = dVal.name || 'Default';
    deckNameMap.set(did, deckName);
    deckByNameMap.set(deckName, did);

    parsedDecks.push({
      id: did,
      name: deckName,
      description: dVal.desc || '',
      noteCount: 0,
      cardCount: 0,
      selected: true,
    });
  }

  onProgress?.(70, 'Extracting notes and preserving all 38+ fields...');
  // ============================================================================
  // Requirement 3: Note Parsing
  // Split flds by ASCII unit separator '\x1f'
  // Preserve ALL fields defined in model (e.g. all 38 fields of JP Mining Note)
  // ============================================================================
  const notesRes = sqliteDb.exec('SELECT id, guid, mid, mod, usn, tags, flds FROM notes');
  const rawNotesList: Note[] = [];
  const noteById = new Map<number, { mid: string; fieldsDict: Record<string, string>; tags: string[]; model: any }>();

  const now = Date.now();

  if (notesRes.length > 0 && notesRes[0].values.length > 0) {
    for (const row of notesRes[0].values) {
      const nid = row[0] as number;
      const mid = String(row[2]);
      const tagsStr = (row[5] as string) || '';
      const fldsStr = (row[6] as string) || '';

      const fieldValues = fldsStr.split('\x1f');
      const model = modelsDict[mid];
      const fieldsDict: Record<string, string> = {};

      if (model && model.flds && Array.isArray(model.flds)) {
        model.flds.forEach((f: any, idx: number) => {
          const ord = typeof f.ord === 'number' ? f.ord : idx;
          fieldsDict[f.name] = fieldValues[ord] ?? '';
        });
        // Preserve any remaining fields if fieldValues length exceeds model.flds
        if (fieldValues.length > model.flds.length) {
          for (let i = model.flds.length; i < fieldValues.length; i++) {
            fieldsDict[`Field_${i + 1}`] = fieldValues[i] ?? '';
          }
        }
      } else {
        // Fallback fields
        fieldValues.forEach((val, idx) => {
          fieldsDict[`Field_${idx + 1}`] = val;
        });
      }

      const tags = tagsStr
        .split(' ')
        .map((t) => t.trim())
        .filter(Boolean);

      noteById.set(nid, { mid, fieldsDict, tags, model });

      rawNotesList.push({
        id: `anki_n_${nid}`,
        deckId: 'default',
        modelType: (model?.type === 1 || model?.name?.toLowerCase().includes('cloze')) ? 'cloze' : 'basic',
        modelName: model?.name || 'Standard Note',
        fields: fieldsDict,
        tags,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  onProgress?.(85, 'Generating flashcards from templates & scheduling...');
  // ============================================================================
  // Requirement 4: Card Generation
  // Link each card to note using nid, did for deck assignment, ord for template index
  // Preserve reps, lapses, interval, type/queue state
  // ============================================================================
  const cardsRes = sqliteDb.exec(
    'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards'
  );

  const rawCardsList: Card[] = [];
  const todayIso = new Date(now).toISOString();

  if (cardsRes.length > 0 && cardsRes[0].values.length > 0) {
    for (const row of cardsRes[0].values) {
      const cid = String(row[0]);
      const nid = row[1] as number;
      const did = String(row[2]);
      const ord = (row[3] as number) || 0;
      const type = (row[4] as number) || 0;
      const queue = (row[5] as number) || 0;
      const dueVal = (row[6] as number) || 0;
      const ivl = (row[7] as number) || 0;
      const reps = (row[9] as number) || 0;
      const lapses = (row[10] as number) || 0;

      const noteData = noteById.get(nid);
      if (!noteData) continue;

      const model = noteData.model;
      const isCloze =
        model?.type === 1 || (model?.name && model.name.toLowerCase().includes('cloze'));

      let frontHtml = '';
      let backHtml = '';

      if (isCloze) {
        const clozeIndex = ord + 1;
        const firstFieldVal = Object.values(noteData.fieldsDict)[0] || '';
        frontHtml = renderClozeFront(firstFieldVal, clozeIndex);
        backHtml = renderClozeBack(firstFieldVal, clozeIndex);

        const extraField = noteData.fieldsDict['Extra'] || noteData.fieldsDict['Back'] || '';
        if (extraField) {
          backHtml += `<div class="mt-4 pt-3 border-t border-slate-700/40">${extraField}</div>`;
        }
      } else if (model && model.tmpls && model.tmpls[ord]) {
        const tmpl = model.tmpls[ord];
        frontHtml = renderAnkiTemplate(tmpl.qfmt || '', noteData.fieldsDict);
        backHtml = renderAnkiTemplate(tmpl.afmt || '', noteData.fieldsDict, frontHtml);
      } else {
        // Fallback default
        const fieldVals = Object.values(noteData.fieldsDict);
        frontHtml = fieldVals[0] || 'Card Front';
        backHtml = fieldVals[1] || 'Card Back';
      }

      // Resolve media assets in HTML
      frontHtml = processCardHtml(frontHtml, mediaDataUrls);
      backHtml = processCardHtml(backHtml, mediaDataUrls);

      // Determine card state
      let cardState: CardState = 'new';
      if (queue === 0 || type === 0) {
        cardState = 'new';
      } else if (queue === 1 || type === 1) {
        cardState = 'learning';
      } else if (queue === 2 || type === 2) {
        cardState = 'review';
      } else if (queue === 3 || type === 3) {
        cardState = 'relearning';
      }

      const card: Card = {
        id: `anki_${cid}`,
        noteId: `anki_n_${nid}`,
        deckId: did,
        front: frontHtml,
        back: backHtml,
        cardType: isCloze ? 'cloze' : 'basic',
        clozeIndex: isCloze ? ord + 1 : undefined,
        tags: noteData.tags,
        due: todayIso,
        stability: reps > 0 ? Math.max(1, ivl) : 0,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: Math.max(0, ivl),
        reps,
        lapses,
        state: cardState,
        createdAt: now,
        updatedAt: now,
      };

      rawCardsList.push(card);

      // Link note's deckId to card's deckId
      const targetNote = rawNotesList.find((n) => n.id === `anki_n_${nid}`);
      if (targetNote && targetNote.deckId === 'default') {
        targetNote.deckId = did;
      }

      // Update deck card count
      const targetDeck = parsedDecks.find((d) => d.id === did);
      if (targetDeck) {
        targetDeck.cardCount++;
      }
    }
  }

  // Update note counts per deck
  for (const rawNote of rawNotesList) {
    const targetDeck = parsedDecks.find((d) => d.id === rawNote.deckId);
    if (targetDeck) {
      targetDeck.noteCount++;
    }
  }

  sqliteDb.close();

  onProgress?.(100, 'Import inspection complete!');

  // Diagnostic warnings & verification
  const warnings: string[] = [];

  // Check expected metrics if KANJI_JFT package
  const isKanjiJft = actualFileName.toUpperCase().includes('KANJI_JFT');
  if (isKanjiJft) {
    if (primaryDatabase !== 'collection.anki21') {
      warnings.push(`Warning: Expected primary database "collection.anki21", but used "${primaryDatabase}".`);
    }
    if (rawNotesList.length !== 450) {
      warnings.push(`Warning: Expected 450 notes, but parsed ${rawNotesList.length}.`);
    }
    if (rawCardsList.length !== 450) {
      warnings.push(`Warning: Expected 450 cards, but parsed ${rawCardsList.length}.`);
    }
    if (maxFieldsInModel !== 38) {
      warnings.push(`Warning: Expected 38 fields in note type, but found ${maxFieldsInModel}.`);
    }
    if (mediaMappingEntries !== 1044) {
      warnings.push(`Warning: Expected 1,044 media mapping entries, but found ${mediaMappingEntries}.`);
    }
  }

  if (warnings.length === 0) {
    warnings.push(
      `Primary database "${primaryDatabase}" validated successfully with ${rawNotesList.length} notes, ${rawCardsList.length} cards, and ${mediaExtracted} media items.`
    );
  }

  return {
    filename: actualFileName,
    primaryDatabase,
    decks: parsedDecks,
    totalNotes: rawNotesList.length,
    totalCards: rawCardsList.length,
    noteTypeCount,
    fieldsInNoteType: maxFieldsInModel,
    templateCount: totalTemplatesCount,
    mediaCount: mediaExtracted,
    mediaMappingEntries,
    warnings,
    diagnosticInfo: {
      primaryDatabase,
      ankiVersion: colVersion,
      noteTypeCount,
      fieldsInNoteType: maxFieldsInModel,
      templateCount: totalTemplatesCount,
      mediaMappingEntries,
      mediaExtracted,
      deckCount: parsedDecks.length,
    },
    rawNotes: rawNotesList,
    rawCards: rawCardsList,
    rawMedia: mediaDataUrls,
  };
}
