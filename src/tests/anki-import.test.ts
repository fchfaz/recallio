import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import fs from 'fs';
import {
  parseAnkiPackage,
  formatFuriganaRuby,
  formatFuriganaKanaOnly,
  formatFuriganaKanjiOnly,
  renderAnkiTemplate,
  processCardHtml,
} from '@/lib/anki/parser';

describe('Anki APKG Importer & Parser Compatibility', () => {
  it('correctly converts Furigana notation into HTML5 ruby tags', () => {
    const rawJapanese = '彼女は 日本[にほん]語[ご]を 勉強[べんきょう]しています。';
    const rubyHtml = formatFuriganaRuby(rawJapanese);
    expect(rubyHtml).toContain('<ruby>日本<rt>にほん</rt></ruby>');
    expect(rubyHtml).toContain('<ruby>語<rt>ご</rt></ruby>');
    expect(rubyHtml).toContain('<ruby>勉強<rt>べんきょう</rt></ruby>');

    expect(formatFuriganaKanaOnly('漢字[かんじ]')).toBe('かんじ');
    expect(formatFuriganaKanjiOnly('漢字[かんじ]')).toBe('漢字');
  });

  it('evaluates Anki template conditionals and field filters', () => {
    const template = `
      {{#Word}}<h1 class="title">{{furigana:Word}}</h1>{{/Word}}
      {{^Word}}<p>No word provided</p>{{/Word}}
      {{#PitchAccent}}<span class="pitch">{{PitchAccent}}</span>{{/PitchAccent}}
      <div class="meaning">{{Meaning}}</div>
    `;

    const fields = {
      Word: '漢字[かんじ]',
      PitchAccent: '①',
      Meaning: 'Chinese character / Kanji',
    };

    const rendered = renderAnkiTemplate(template, fields);
    expect(rendered).toContain('<ruby>漢字<rt>かんじ</rt></ruby>');
    expect(rendered).toContain('①');
    expect(rendered).toContain('Chinese character / Kanji');
    expect(rendered).not.toContain('No word provided');

    // Test inverted section when field is missing
    const renderedEmpty = renderAnkiTemplate(template, { Meaning: 'Definition only' });
    expect(renderedEmpty).toContain('<p>No word provided</p>');
    expect(renderedEmpty).not.toContain('<h1 class="title">');
  });

  it('resolves media tags [sound:filename.mp3] and <img src="filename.png">', () => {
    const rawHtml = `
      <p>Listen to pronunciation: [sound:yomitan_audio_2024.mp3]</p>
      <img src="diagram_kanji.png" alt="Kanji stroke" />
    `;
    const mediaMap = {
      'yomitan_audio_2024.mp3': 'data:audio/mp3;base64,SUQzBAAAAAAA...',
      'diagram_kanji.png': 'data:image/png;base64,iVBORw0KGgo...',
    };

    const processed = processCardHtml(rawHtml, mediaMap);
    expect(processed).toContain('<audio controls');
    expect(processed).toContain('src="data:audio/mp3;base64,SUQzBAAAAAAA..."');
    expect(processed).toContain('src="data:image/png;base64,iVBORw0KGgo..."');
  });

  it('PRIORITIZES collection.anki21 over collection.anki2 and parses 38 fields & deck hierarchy', async () => {
    // 1. Initialize SQLite WASM
    const wasmBuffer = fs.readFileSync('public/sql-wasm.wasm');
    const wasmBinary = wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength
    );
    const SQL = await initSqlJs({ wasmBinary });

    // 2. Create the PRIMARY database (collection.anki21)
    // containing JP Mining Note with 38 fields, 4 card templates, and 4 content decks
    const db21 = new SQL.Database();
    db21.run(`
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
      CREATE TABLE graves (
        usn integer not null,
        oid integer not null,
        type integer not null
      );
    `);

    // Define 38 fields for JP Mining Note
    const fieldNames = [
      'Key', 'Word', 'WordReading', 'WordReadingHiragana', 'PitchAccent',
      'Sentence', 'SentenceReading', 'SentenceAudio', 'Picture', 'Definition',
      'PAGroup', 'PASilence', 'IsSentence', 'IsClickCard', 'IsHoverCard',
      'IsTargeted', 'IsAudioCard', 'Notes', 'ExtraDefinitions', 'Hint',
      'Audio', 'AltDisplay', 'AltDisplayPASilence', 'AltDisplayAudio',
      'SecondaryDefinition', 'AdditionalNotes', 'Frequency', 'MiscInfo',
      'WordAudio', 'SentenceAudioOnly', 'Image', 'Mnemonic', 'Radicals',
      'StrokeCount', 'JLPT', 'Grade', 'FrequencyRank', 'CustomField38'
    ];
    expect(fieldNames.length).toBe(38);

    const fldsArray = fieldNames.map((name, ord) => ({
      name,
      ord,
      sticky: false,
      rtl: false,
      font: 'Arial',
      size: 20,
    }));

    // 4 card templates
    const tmplsArray = [
      { name: 'Recognition', ord: 0, qfmt: '{{furigana:Word}}', afmt: '{{FrontSide}}<hr>{{Definition}}' },
      { name: 'Recall', ord: 1, qfmt: '{{Definition}}', afmt: '{{FrontSide}}<hr>{{furigana:Word}}' },
      { name: 'Sentence', ord: 2, qfmt: '{{Sentence}}', afmt: '{{FrontSide}}<hr>{{SentenceReading}}' },
      { name: 'Audio', ord: 3, qfmt: '{{Audio}}', afmt: '{{FrontSide}}<hr>{{furigana:Word}}' },
    ];

    const modelId = 1700000000001;
    const modelsDict = {
      [modelId]: {
        id: modelId,
        name: 'JP Mining Note',
        type: 0,
        mod: 1700000000,
        usn: -1,
        flds: fldsArray,
        tmpls: tmplsArray,
        css: '.card { font-family: Meiryo; font-size: 24px; }',
      },
    };

    // 4 content decks plus Default (matching KANJI_JFT)
    const decksDict = {
      '1': { id: 1, name: 'Default', desc: '' },
      '1001': { id: 1001, name: 'KANJI JFT', desc: 'Main Kanji Deck' },
      '1002': { id: 1002, name: 'KANJI JFT::KANJI NYUUMON', desc: 'Introduction' },
      '1003': { id: 1003, name: 'KANJI JFT::KANJI SHOKYUU 1', desc: 'Elementary 1' },
      '1004': { id: 1004, name: 'KANJI JFT::KANJI SHOKYUU 2', desc: 'Elementary 2' },
    };

    db21.run(
      `INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 1700000000, 1700000000, 1700000000, 11, 0, 0, 0, '{}', JSON.stringify(modelsDict), JSON.stringify(decksDict), '{}', '{}']
    );

    // Insert 450 notes into collection.anki21 with 38 fields each
    const deckIds = [1001, 1002, 1003, 1004];
    for (let i = 1; i <= 450; i++) {
      const fieldValues = fieldNames.map((name) => `${name}_val_${i}`);
      const fldsStr = fieldValues.join('\x1f');
      const did = deckIds[i % deckIds.length];

      db21.run(
        `INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [i, `guid_${i}`, modelId, 1700000000, -1, ' kanji n5 ', fldsStr, `Key_val_${i}`, 0, 0, '']
      );

      // Insert corresponding card
      db21.run(
        `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [i, i, did, i % 4, 1700000000, -1, 2, 2, 0, 15, 2500, 5, 0, 0, 0, 0, 0, '']
      );
    }

    const binaryDb21 = db21.export();
    db21.close();

    // 3. Create the LEGACY database (collection.anki2) containing ONLY 1 note and 1 card
    const db2 = new SQL.Database();
    db2.run(`
      CREATE TABLE col (id int, crt int, mod int, scm int, ver int, dty int, usn int, ls int, conf text, models text, decks text, dconf text, tags text);
      CREATE TABLE notes (id int, guid text, mid int, mod int, usn int, tags text, flds text, sfld text, csum int, flags int, data text);
      CREATE TABLE cards (id int, nid int, did int, ord int, mod int, usn int, type int, queue int, due int, ivl int, factor int, reps int, lapses int, left int, odue int, odid int, flags int, data text);
      INSERT INTO col VALUES (1, 1600000000, 1600000000, 1600000000, 11, 0, 0, 0, '{}', '{}', '{"1": {"id": 1, "name": "Default"}}', '{}', '{}');
      INSERT INTO notes VALUES (1, 'legacy_guid', 1, 1600000000, -1, '', 'LegacyFront\\x1fLegacyBack', 'LegacyFront', 0, 0, '');
      INSERT INTO cards VALUES (1, 1, 1, 0, 1600000000, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '');
    `);
    const binaryDb2 = db2.export();
    db2.close();

    // 4. Create ZIP package (representing KANJI_JFT.apkg) with BOTH collection.anki21 and collection.anki2
    const zip = new JSZip();
    zip.file('collection.anki21', binaryDb21); // PRIMARY: 450 notes
    zip.file('collection.anki2', binaryDb2);   // LEGACY: 1 note
    zip.file('media', JSON.stringify({
      '0': 'yomitan_audio_2024-09-24-14-24-13-450.mp3',
      '1': 'kanji_sample.png',
    }));
    zip.file('0', 'sample audio content');
    zip.file('1', 'sample image content');

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // 5. Parse the package
    const preview = await parseAnkiPackage(zipBuffer, undefined, 'KANJI_JFT.apkg');

    // VERIFICATIONS:
    // 1. Must select collection.anki21 as primary database
    expect(preview.primaryDatabase).toBe('collection.anki21');

    // 2. Must parse exactly 450 notes and 450 cards
    expect(preview.totalNotes).toBe(450);
    expect(preview.totalCards).toBe(450);

    // 3. Note type: JP Mining Note with 38 fields and 4 templates
    expect(preview.noteTypeCount).toBe(1);
    expect(preview.fieldsInNoteType).toBe(38);
    expect(preview.templateCount).toBe(4);

    // 4. Decks: 4 content decks plus Default (5 total)
    const deckNames = preview.decks.map((d) => d.name);
    expect(deckNames).toContain('KANJI JFT');
    expect(deckNames).toContain('KANJI JFT::KANJI NYUUMON');
    expect(deckNames).toContain('KANJI JFT::KANJI SHOKYUU 1');
    expect(deckNames).toContain('KANJI JFT::KANJI SHOKYUU 2');
    expect(deckNames).toContain('Default');

    // 5. Verify all 38 fields are completely preserved in raw notes
    const firstNote = preview.rawNotes[0];
    expect(Object.keys(firstNote.fields).length).toBe(38);
    expect(firstNote.fields['Word']).toBe('Word_val_1');
    expect(firstNote.fields['CustomField38']).toBe('CustomField38_val_1');
    expect(firstNote.modelName).toBe('JP Mining Note');

    // 6. Media mapping entries
    expect(preview.mediaMappingEntries).toBe(2);
  });

  it('rejects archives missing both collection.anki21 and collection.anki2 with descriptive error', async () => {
    const emptyZip = new JSZip();
    emptyZip.file('readme.txt', 'hello world');
    const zipBuffer = await emptyZip.generateAsync({ type: 'nodebuffer' });

    await expect(parseAnkiPackage(zipBuffer, undefined, 'corrupt.apkg')).rejects.toThrow(
      'Neither "collection.anki21" nor "collection.anki2" was found'
    );
  });
});
