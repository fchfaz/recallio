import { BUNDLE_SCHEMA_ID, BUNDLE_VERSION } from './schema';

/** Deck contoh untuk onboarding & template di editor JSON. */
export const SAMPLE_BUNDLE = {
  schema: BUNDLE_SCHEMA_ID,
  version: BUNDLE_VERSION,
  decks: [
    {
      name: 'Contoh: Kosakata Jepang Dasar',
      description: 'Deck contoh untuk mencoba alur belajar.',
      cards: [
        { front: 'こんにちは', back: 'Halo / selamat siang', hint: 'Sapaan siang hari', tags: ['sapaan', 'n5'] },
        { front: 'ありがとう', back: 'Terima kasih', tags: ['sapaan', 'n5'] },
        { front: '水 (みず)', back: 'Air', tags: ['benda', 'n5'] },
        { front: '食べる (たべる)', back: 'Makan', hint: 'Kata kerja golongan 2', tags: ['kata-kerja', 'n5'] },
        { front: '学生 (がくせい)', back: 'Pelajar / mahasiswa', tags: ['orang', 'n5'] },
        { front: 'いくらですか', back: 'Berapa harganya?', tags: ['belanja', 'n5'] },
      ],
    },
  ],
};

export const SAMPLE_JSON = JSON.stringify(SAMPLE_BUNDLE, null, 2);

export const SAMPLE_CARD_JSON = JSON.stringify(
  { front: 'Pertanyaan', back: 'Jawaban', hint: '', tags: ['contoh'] },
  null,
  2,
);
