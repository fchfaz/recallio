import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { activity, createDeck } from '../db/repo';
import { useDeckCounts } from './hooks';
import { applyBundle } from '../db/transfer';
import { validateBundleText } from '../core/schema';
import { SAMPLE_JSON } from '../core/sample';
import { navigate } from '../router';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useToast } from './toast';

export function Dashboard() {
  const decks = useLiveQuery(() => db.decks.orderBy('updatedAt').reverse().toArray(), []);
  const counts = useDeckCounts();
  const act = useLiveQuery(() => activity(), []);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const totalDue = Object.values(counts).reduce((n, c) => n + c.due, 0);
  const totalNew = Object.values(counts).reduce((n, c) => n + c.fresh, 0);
  const max = Math.max(1, ...(act?.week.map((w) => w.count) ?? [1]));

  async function loadSample() {
    const r = validateBundleText(SAMPLE_JSON);
    if (r.ok) {
      await applyBundle(r.data);
      toast('Deck contoh ditambahkan', 'success');
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Hari ini</h1>
          <p className="muted">Ulangi tepat waktu. FSRS mengatur jadwalnya.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Deck baru
        </button>
      </header>

      <section className="hero card" style={{ ['--i' as string]: 0 }}>
        <div className="hero-main">
          <div className="hero-num">{totalDue + totalNew}</div>
          <div>
            <strong>kartu menunggu</strong>
            <div className="muted">
              {totalDue} ulasan · {totalNew} baru
            </div>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" disabled={totalDue + totalNew === 0} onClick={() => navigate('/study')}>
          <Icon name="play" size={18} /> Mulai belajar
        </button>
      </section>

      <section className="stats">
        <div className="card stat" style={{ ['--i' as string]: 1 }}>
          <span className="stat-ico flame">
            <Icon name="flame" />
          </span>
          <div>
            <div className="stat-val">{act?.streak ?? 0} hari</div>
            <div className="muted">Beruntun</div>
          </div>
        </div>
        <div className="card stat" style={{ ['--i' as string]: 2 }}>
          <span className="stat-ico ok">
            <Icon name="check" />
          </span>
          <div>
            <div className="stat-val">{act?.today ?? 0}</div>
            <div className="muted">Dijawab hari ini</div>
          </div>
        </div>
        <div className="card week" style={{ ['--i' as string]: 3 }} aria-label="Aktivitas 7 hari">
          {(act?.week ?? []).map((w) => (
            <div key={w.label} className="bar-col" title={`${w.count} kartu`}>
              <div className="bar" style={{ height: `${Math.max(6, (w.count / max) * 100)}%` }} />
              <span>{w.label}</span>
            </div>
          ))}
        </div>
      </section>

      <h2 className="section-title">Deck Anda</h2>
      {decks && decks.length === 0 ? (
        <div className="empty card">
          <h3>Belum ada deck</h3>
          <p className="muted">Buat deck pertama, impor dari JSON, atau coba deck contoh.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              Buat deck
            </button>
            <button className="btn" onClick={loadSample}>
              Muat deck contoh
            </button>
          </div>
        </div>
      ) : (
        <div className="grid">
          {decks?.map((d, i) => {
            const c = counts[d.id] ?? { total: 0, due: 0, fresh: 0 };
            return (
              <article key={d.id} className="card deck" style={{ ['--i' as string]: i + 4 }}>
                <a className="deck-link" href={`#/deck/${d.id}`}>
                  <h3>{d.name}</h3>
                  <p className="muted clamp">{d.description || 'Tanpa deskripsi'}</p>
                </a>
                <div className="chips">
                  <span className="chip chip-due">{c.due} ulasan</span>
                  <span className="chip chip-new">{c.fresh} baru</span>
                  <span className="chip">{c.total} total</span>
                </div>
                <button className="btn btn-sm" disabled={c.due + c.fresh === 0} onClick={() => navigate(`/study/${d.id}`)}>
                  <Icon name="play" size={14} /> Belajar
                </button>
              </article>
            );
          })}
        </div>
      )}

      {creating && <NewDeck onClose={() => setCreating(false)} />}
    </>
  );
}

function NewDeck({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const d = await createDeck(name, desc);
    toast('Deck dibuat', 'success');
    onClose();
    navigate(`/deck/${d.id}`);
  }

  return (
    <Modal title="Deck baru" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>
          Nama
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus required />
        </label>
        <label>
          Deskripsi (opsional)
          <textarea className="input" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
        </label>
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" disabled={!name.trim()}>
            Buat
          </button>
        </div>
      </form>
    </Modal>
  );
}
