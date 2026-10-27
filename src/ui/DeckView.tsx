import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { deleteCard, deleteDeck, toggleSuspend, updateDeck } from '../db/repo';
import { useDeckCounts } from './hooks';
import { buildExport, downloadText } from '../db/transfer';
import { formatInterval } from '../core/scheduler';
import type { CardRecord } from '../core/types';
import { navigate } from '../router';
import { CardEditor } from './CardEditor';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useToast } from './toast';

function statusOf(c: CardRecord): { text: string; cls: string } {
  if (c.suspended) return { text: 'Ditangguhkan', cls: '' };
  if (c.state === 0) return { text: 'Baru', cls: 'chip-new' };
  const now = Date.now();
  if (c.due <= now) return { text: 'Jatuh tempo', cls: 'chip-due' };
  return { text: `dalam ${formatInterval(now, c.due)}`, cls: '' };
}

export function DeckView({ id }: { id: string }) {
  const toast = useToast();
  const loaded = useLiveQuery(async () => ({ deck: await db.decks.get(id) }), [id]);
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(id).sortBy('createdAt'), [id]);
  const counts = useDeckCounts();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<CardRecord | 'new' | null>(null);
  const [renaming, setRenaming] = useState(false);

  const allTags = useMemo(() => [...new Set((cards ?? []).flatMap((c) => c.tags))].sort(), [cards]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (cards ?? [])
      .filter((c) => !tag || c.tags.includes(tag))
      .filter((c) => !needle || c.front.toLowerCase().includes(needle) || c.back.toLowerCase().includes(needle))
      .reverse();
  }, [cards, q, tag]);

  if (!loaded) return null;
  const deck = loaded.deck;
  if (!deck) {
    return (
      <div className="empty card">
        <h3>Deck tidak ditemukan</h3>
        <button className="btn" onClick={() => navigate('/')}>
          Kembali
        </button>
      </div>
    );
  }
  const c = counts[id] ?? { total: 0, due: 0, fresh: 0 };

  async function exportDeck() {
    const b = await buildExport({ deckId: id, includeSchedule: true });
    downloadText(`${deck!.name.replace(/[^\w-]+/g, '_')}.recallio.json`, JSON.stringify(b, null, 2));
  }

  async function removeDeck() {
    if (!confirm(`Hapus deck "${deck!.name}" beserta ${c.total} kartunya? Tindakan ini tidak bisa dibatalkan.`)) return;
    await deleteDeck(id);
    toast('Deck dihapus');
    navigate('/');
  }

  async function removeCard(card: CardRecord) {
    if (!confirm('Hapus kartu ini?')) return;
    await deleteCard(card.id);
    toast('Kartu dihapus');
  }

  return (
    <>
      <a href="#/" className="back-link">
        <Icon name="back" size={16} /> Semua deck
      </a>
      <header className="page-head">
        <div>
          <h1>{deck.name}</h1>
          <p className="muted">{deck.description || 'Tanpa deskripsi'}</p>
          <div className="chips">
            <span className="chip chip-due">{c.due} ulasan</span>
            <span className="chip chip-new">{c.fresh} baru</span>
            <span className="chip">{c.total} kartu</span>
          </div>
        </div>
        <div className="row wrap">
          <button className="btn btn-primary" disabled={c.due + c.fresh === 0} onClick={() => navigate(`/study/${id}`)}>
            <Icon name="play" size={16} /> Belajar
          </button>
          <button className="btn" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> Kartu
          </button>
          <button className="icon-btn" title="Ubah nama/deskripsi" aria-label="Ubah deck" onClick={() => setRenaming(true)}>
            <Icon name="edit" />
          </button>
          <button className="icon-btn" title="Ekspor deck" aria-label="Ekspor deck" onClick={exportDeck}>
            <Icon name="download" />
          </button>
          <button className="icon-btn danger" title="Hapus deck" aria-label="Hapus deck" onClick={removeDeck}>
            <Icon name="trash" />
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Cari kartu…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {allTags.length > 0 && (
          <div className="chips scroll-x">
            <button className={`chip btn-chip${tag === null ? ' on' : ''}`} onClick={() => setTag(null)}>
              Semua
            </button>
            {allTags.map((t) => (
              <button key={t} className={`chip btn-chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {cards && cards.length === 0 ? (
        <div className="empty card">
          <h3>Deck masih kosong</h3>
          <p className="muted">Tambahkan kartu lewat formulir, atau impor banyak sekaligus dari JSON.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              Tambah kartu
            </button>
            <button className="btn" onClick={() => navigate('/import')}>
              Impor JSON
            </button>
          </div>
        </div>
      ) : (
        <ul className="card-list">
          {shown.map((card, i) => {
            const st = statusOf(card);
            return (
              <li key={card.id} className="card row-card" style={{ ['--i' as string]: Math.min(i, 12) }}>
                <button className="row-main" onClick={() => setEditing(card)}>
                  <strong className="clamp">{card.front}</strong>
                  <span className="muted clamp">{card.back}</span>
                  <span className="chips">
                    <span className={`chip ${st.cls}`}>{st.text}</span>
                    {card.tags.map((t) => (
                      <span key={t} className="chip">
                        #{t}
                      </span>
                    ))}
                  </span>
                </button>
                <div className="row-actions">
                  <button
                    className="icon-btn"
                    aria-label={card.suspended ? 'Aktifkan kembali' : 'Tangguhkan'}
                    title={card.suspended ? 'Aktifkan kembali' : 'Tangguhkan'}
                    onClick={() => toggleSuspend(card.id, !card.suspended)}
                  >
                    <Icon name={card.suspended ? 'play' : 'pause'} size={16} />
                  </button>
                  <button className="icon-btn danger" aria-label="Hapus kartu" onClick={() => removeCard(card)}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <p className="muted center">Tidak ada kartu yang cocok.</p>}
        </ul>
      )}

      {editing && <CardEditor deckId={id} card={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {renaming && <RenameDeck id={id} name={deck.name} description={deck.description} onClose={() => setRenaming(false)} />}
    </>
  );
}

function RenameDeck({ id, name, description, onClose }: { id: string; name: string; description: string; onClose: () => void }) {
  const [n, setN] = useState(name);
  const [d, setD] = useState(description);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!n.trim()) return;
    await updateDeck(id, n, d);
    onClose();
  }
  return (
    <Modal title="Ubah deck" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nama
          <input className="input" value={n} onChange={(e) => setN(e.target.value)} maxLength={80} autoFocus />
        </label>
        <label>
          Deskripsi
          <textarea className="input" rows={3} value={d} onChange={(e) => setD(e.target.value)} maxLength={500} />
        </label>
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" disabled={!n.trim()}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
