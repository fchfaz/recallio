import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { applyReview, buildQueue } from '../db/repo';
import { makeScheduler, previewIntervals, Rating, type Grade } from '../core/scheduler';
import type { CardRecord } from '../core/types';
import { navigate } from '../router';
import { Icon } from './Icon';
import { useSettings } from './hooks';

const GRADE_UI: { grade: Grade; label: string; cls: string }[] = [
  { grade: Rating.Again, label: 'Lagi', cls: 'again' },
  { grade: Rating.Hard, label: 'Sulit', cls: 'hard' },
  { grade: Rating.Good, label: 'Baik', cls: 'good' },
  { grade: Rating.Easy, label: 'Mudah', cls: 'easy' },
];

const LEARN_WINDOW_MS = 20 * 60_000;

export function Study({ deckId }: { deckId?: string }) {
  const settings = useSettings();
  const f = useMemo(
    () => makeScheduler({ requestRetention: settings.requestRetention, enableFuzz: settings.enableFuzz }),
    [settings.requestRetention, settings.enableFuzz],
  );
  const deck = useLiveQuery(async () => ({ d: deckId ? await db.decks.get(deckId) : undefined }), [deckId]);

  const [queue, setQueue] = useState<CardRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [tally, setTally] = useState<Record<number, number>>({});
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    buildQueue(deckId).then((q) => {
      if (!alive) return;
      setQueue(q);
      setTotal(q.length);
    });
    return () => {
      alive = false;
    };
  }, [deckId]);

  const current = queue?.[0];
  const previews = useMemo(
    () => (current && revealed ? previewIntervals(f, current.fsrs, new Date()) : null),
    [current, revealed, f],
  );

  const exit = useCallback(() => navigate(deckId ? `/deck/${deckId}` : '/'), [deckId]);

  const answer = useCallback(
    async (grade: Grade) => {
      if (!current || !revealed || busy.current) return;
      busy.current = true;
      try {
        const updated = await applyReview(current, grade, f);
        setTally((t) => ({ ...t, [grade]: (t[grade] ?? 0) + 1 }));
        // Kartu yang masih dalam (re)learning dan jatuh tempo <20 mnt muncul lagi di sesi ini.
        const requeue = updated.state !== 2 && updated.due <= Date.now() + LEARN_WINDOW_MS;
        setQueue((q) => {
          const rest = (q ?? []).slice(1);
          if (requeue) rest.splice(Math.min(rest.length, 4), 0, updated);
          return rest;
        });
        if (!requeue) setDone((d) => d + 1);
        setRevealed(false);
        setShowHint(false);
      } finally {
        busy.current = false;
      }
    },
    [current, revealed, f],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') return exit();
      if (!current) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        void answer(Number(e.key) as Grade);
      } else if (revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        void answer(Rating.Good);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, answer, exit]);

  const pct = total ? Math.round((done / total) * 100) : 0;
  const title = deck?.d?.name ?? 'Semua deck';

  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" onClick={exit} aria-label="Keluar (Esc)">
          <Icon name="x" />
        </button>
        <div className="study-meta">
          <span className="clamp">{title}</span>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="muted num">
          {done}/{total}
        </span>
      </header>

      {queue === null ? (
        <div className="study-body center muted">Memuat…</div>
      ) : current ? (
        <>
          <div className="study-body">
            <div key={current.id} className={`flip${revealed ? ' is-flipped' : ''}`} onClick={() => !revealed && setRevealed(true)}>
              <div className="flip-inner">
                <div className="face front">
                  <span className="face-label">Pertanyaan</span>
                  <div className="face-text">{current.front}</div>
                  {current.hint &&
                    (showHint ? (
                      <div className="hint">Petunjuk: {current.hint}</div>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                      >
                        Lihat petunjuk
                      </button>
                    ))}
                  <span className="tap-hint muted">Ketuk atau tekan Spasi</span>
                </div>
                <div className="face back">
                  <span className="face-label">Jawaban</span>
                  <div className="face-sub">{current.front}</div>
                  <div className="face-text">{current.back}</div>
                </div>
              </div>
            </div>
          </div>

          <footer className="study-actions">
            {!revealed ? (
              <button className="btn btn-primary btn-lg wide" onClick={() => setRevealed(true)}>
                Tampilkan jawaban
              </button>
            ) : (
              <div className="grades">
                {GRADE_UI.map((g, i) => (
                  <button key={g.grade} className={`grade ${g.cls}`} onClick={() => answer(g.grade)}>
                    <span className="grade-int">{previews?.[g.grade]}</span>
                    <span className="grade-label">{g.label}</span>
                    <kbd>{i + 1}</kbd>
                  </button>
                ))}
              </div>
            )}
          </footer>
        </>
      ) : (
        <div className="study-body center">
          <div className="card summary">
            <div className="summary-ico">
              <Icon name="check" size={28} />
            </div>
            <h2>{total === 0 ? 'Tidak ada kartu untuk dipelajari' : 'Sesi selesai!'}</h2>
            {total > 0 ? (
              <>
                <p className="muted">{total} kartu diselesaikan.</p>
                <div className="tally">
                  {GRADE_UI.map((g) => (
                    <div key={g.grade} className={`tally-item ${g.cls}`}>
                      <strong>{tally[g.grade] ?? 0}</strong>
                      <span>{g.label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Semua sudah diulang atau batas harian tercapai. Kembali lagi nanti.</p>
            )}
            <button className="btn btn-primary" onClick={exit}>
              Kembali
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
