import { useEffect, useRef, useState } from 'react';
import { validateCardJson, type CardInput, type ValidationIssue } from '../core/schema';
import type { CardRecord } from '../core/types';
import { saveCard } from '../db/repo';
import { Modal } from './Modal';
import { useToast } from './toast';

type Tab = 'form' | 'json';

interface Draft {
  front: string;
  back: string;
  hint: string;
  tags: string;
}

const toDraft = (c?: Pick<CardInput, 'front' | 'back' | 'hint' | 'tags'>): Draft => ({
  front: c?.front ?? '',
  back: c?.back ?? '',
  hint: c?.hint ?? '',
  tags: (c?.tags ?? []).join(', '),
});

const draftToObject = (d: Draft) => ({
  front: d.front,
  back: d.back,
  hint: d.hint,
  tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
});

export function CardEditor({ deckId, card, onClose }: { deckId: string; card?: CardRecord; onClose: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('form');
  const [draft, setDraft] = useState<Draft>(toDraft(card));
  const [json, setJson] = useState('');
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const err = (path: string) => errors.find((e) => e.path === path)?.message;
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  function switchTab(next: Tab) {
    if (next === tab) return;
    if (next === 'json') {
      setJson(JSON.stringify(draftToObject(draft), null, 2));
      setErrors([]);
      setTab('json');
      return;
    }
    // JSON → formulir: harus valid agar tidak ada data hilang diam-diam.
    const r = validateCardJson(json);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setDraft(toDraft(r.data));
    setErrors([]);
    setTab('form');
  }

  async function save(again = false) {
    const r = validateCardJson(tab === 'json' ? json : JSON.stringify(draftToObject(draft)));
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setSaving(true);
    try {
      await saveCard(deckId, r.data, card?.id);
      toast(card ? 'Kartu diperbarui' : 'Kartu ditambahkan', 'success');
      if (again && !card) {
        setDraft(toDraft());
        setJson(JSON.stringify({ front: '', back: '', hint: '', tags: r.data.tags }, null, 2));
        setErrors([]);
        setTimeout(() => frontRef.current?.focus(), 0);
      } else onClose();
    } catch {
      toast('Gagal menyimpan kartu', 'error');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void save(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal title={card ? 'Edit kartu' : 'Kartu baru'} onClose={onClose} wide>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'form'} className={tab === 'form' ? 'on' : ''} onClick={() => switchTab('form')}>
          Formulir
        </button>
        <button role="tab" aria-selected={tab === 'json'} className={tab === 'json' ? 'on' : ''} onClick={() => switchTab('json')}>
          JSON
        </button>
      </div>

      {tab === 'form' ? (
        <div className="form">
          <label>
            Depan
            <textarea ref={frontRef} className={`input${err('front') ? ' invalid' : ''}`} rows={3} value={draft.front} onChange={set('front')} autoFocus />
            {err('front') && <small className="error">{err('front')}</small>}
          </label>
          <label>
            Belakang
            <textarea className={`input${err('back') ? ' invalid' : ''}`} rows={4} value={draft.back} onChange={set('back')} />
            {err('back') && <small className="error">{err('back')}</small>}
          </label>
          <label>
            Petunjuk (opsional)
            <input className={`input${err('hint') ? ' invalid' : ''}`} value={draft.hint} onChange={set('hint')} />
            {err('hint') && <small className="error">{err('hint')}</small>}
          </label>
          <label>
            Tag (pisahkan dengan koma)
            <input className="input" value={draft.tags} onChange={set('tags')} placeholder="n5, kata-kerja" />
            {errors.filter((e) => e.path.startsWith('tags')).map((e) => (
              <small key={e.path} className="error">
                {e.path}: {e.message}
              </small>
            ))}
          </label>
        </div>
      ) : (
        <div className="form">
          <label>
            Kartu dalam JSON
            <textarea
              className={`input mono${errors.length ? ' invalid' : ''}`}
              rows={10}
              spellCheck={false}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
          </label>
          <small className="muted">
            Field: <code>front</code> (wajib), <code>back</code> (wajib), <code>hint</code>, <code>tags</code> (array).
          </small>
          {errors.length > 0 && (
            <ul className="issues">
              {errors.map((e, i) => (
                <li key={i}>
                  <code>{e.path}</code>
                  {e.line ? ` (baris ${e.line}${e.column ? `, kolom ${e.column}` : ''})` : ''}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="row end modal-foot">
        <span className="muted hide-sm">Ctrl/⌘ + Enter untuk simpan</span>
        <button className="btn btn-ghost" onClick={onClose}>
          Batal
        </button>
        {!card && (
          <button className="btn" disabled={saving} onClick={() => save(true)}>
            Simpan &amp; tambah lagi
          </button>
        )}
        <button className="btn btn-primary" disabled={saving} onClick={() => save(false)}>
          Simpan
        </button>
      </div>
    </Modal>
  );
}
