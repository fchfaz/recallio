import { db } from '@/lib/db/database';
import type { AnkiImportPreview, Deck, Note, Card, MediaItem, ImportHistory } from '@/types';

export interface ImportResultSummary {
  primaryDatabase: 'collection.anki21' | 'collection.anki2';
  decksImported: number;
  notesImported: number;
  cardsImported: number;
  mediaImported: number;
  skippedCards: number;
  warnings: string[];
}

export async function executeAnkiImport(
  preview: AnkiImportPreview,
  selectedDeckIds: string[],
  onProgress?: (progress: number, stage: string) => void
): Promise<ImportResultSummary> {
  const now = Date.now();
  onProgress?.(10, 'Preparing database transaction...');

  const activeDecks = preview.decks.filter((d) => selectedDeckIds.includes(d.id));
  const selectedDeckIdSet = new Set(selectedDeckIds);

  let decksImported = 0;
  let notesImported = 0;
  let cardsImported = 0;
  let mediaImported = 0;
  let skippedCards = 0;

  // 1. Prepare decks preserving subdeck hierarchy
  const decksToSave: Deck[] = [];
  for (const pDeck of activeDecks) {
    let parentId: string | undefined;
    if (pDeck.name.includes('::')) {
      const parentName = pDeck.name.substring(0, pDeck.name.lastIndexOf('::'));
      const parentDeck = preview.decks.find((d) => d.name === parentName);
      if (parentDeck) {
        parentId = parentDeck.id;
      }
    }

    decksToSave.push({
      id: pDeck.id,
      name: pDeck.name,
      description: pDeck.description || `Imported from ${preview.filename}`,
      parentId,
      settings: {
        newCardsPerDay: 20,
        maxReviewsPerDay: 100,
        desiredRetention: 0.9,
      },
      createdAt: now,
      updatedAt: now,
    });
    decksImported++;
  }

  onProgress?.(30, 'Saving decks and media assets...');
  // 2. Save media items preserving original filenames
  const mediaToSave: MediaItem[] = [];
  for (const [filename, dataUrl] of Object.entries(preview.rawMedia)) {
    const mediaId = `media_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const mimeMatch = dataUrl.match(/^data:(.*?);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

    mediaToSave.push({
      id: mediaId,
      filename,
      mimeType,
      data: dataUrl,
      size: Math.round((dataUrl.length * 3) / 4),
      createdAt: now,
    });
    mediaImported++;
  }

  // 3. Filter cards belonging to selected decks
  const filteredCards: Card[] = [];
  const selectedNoteIds = new Set<string>();

  for (const card of preview.rawCards) {
    if (selectedDeckIdSet.has(card.deckId)) {
      filteredCards.push(card);
      selectedNoteIds.add(card.noteId);
      cardsImported++;
    } else {
      skippedCards++;
    }
  }

  onProgress?.(60, 'Saving notes with all 38+ fields preserved...');
  // 4. Save notes preserving all fields and model metadata
  const notesToSave: Note[] = [];
  for (const rawNote of preview.rawNotes) {
    if (selectedNoteIds.has(rawNote.id)) {
      notesToSave.push({
        id: rawNote.id,
        deckId: rawNote.deckId,
        modelType: rawNote.modelType,
        modelName: rawNote.modelName,
        fields: rawNote.fields, // ALL 38 fields preserved!
        tags: rawNote.tags || [],
        createdAt: now,
        updatedAt: now,
      });
      notesImported++;
    }
  }

  onProgress?.(80, 'Writing data to IndexedDB storage...');

  await db.transaction('rw', db.decks, db.notes, db.cards, db.media, db.importHistory, async () => {
    if (decksToSave.length > 0) {
      await db.decks.bulkPut(decksToSave);
    }
    if (mediaToSave.length > 0) {
      await db.media.bulkPut(mediaToSave);
    }
    if (notesToSave.length > 0) {
      await db.notes.bulkPut(notesToSave);
    }
    if (filteredCards.length > 0) {
      await db.cards.bulkPut(filteredCards);
    }

    // Save import history log
    const historyEntry: ImportHistory = {
      id: `imp_${now}`,
      filename: preview.filename,
      deckCount: decksImported,
      noteCount: notesImported,
      cardCount: cardsImported,
      mediaCount: mediaImported,
      warningCount: preview.warnings.length,
      importedAt: now,
    };
    await db.importHistory.add(historyEntry);
  });

  onProgress?.(100, 'Import finished!');

  return {
    primaryDatabase: preview.primaryDatabase,
    decksImported,
    notesImported,
    cardsImported,
    mediaImported,
    skippedCards,
    warnings: preview.warnings,
  };
}
