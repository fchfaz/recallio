import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { LIMITS, validateBundleText } from '../core/schema';
import { SAMPLE_JSON } from '../core/sample';
import { applyBundle, buildExport, downloadText, type ImportReport } from '../db/transfer';
import { navigate } from '../router';
import { Icon } from './Icon';
import { useDebounced } from './hooks';
import { useToast } from './toast';

export function Transfer() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [withSchedule, setWithSchedule] = useState(true);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const debounced = useDebounced(text, 250);
  const result = useMemo(() => (debounced.trim() ? validateBundleText(debounced) : null), [debounced]);
  const stale = debounced !== text;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > LIMITS.maxFileBytes) {
      toast(`File terlalu besar (maks ${LIMITS.maxFileBytes / 1048576} MB)`, 'error');
      return;
    }
    setText(await file.text());
    setReport(null);
  }

  function prettify() {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      toast('JSON belum valid, tidak bisa dirapikan', 'error');
    }
  }

  function jump(line?: number, col?: number) {
    const el = area.current;
    if (!el || !line) return;
    const lines = text.split('\n');
    const offset = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + Math.max(0, (col ?? 1) - 1);
    el.focus();
    el.setSelectionRange(offset, offset);
  }

  async function doImport() {
    if (!result?.ok) return;
    setBusy(true);
    try {
      const r = await applyBundle(result.data);
      setReport(r);
      toast('Impor selesai', 'success');
    } catch (e) {
      toast(`Impor gagal: ${e instanceof Error ? e.message : 'kesalahan tak dikenal'}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function exportAll(mode: 'download' | 'editor' | 'copy') {
    const json = JSON.stringify(await buildExport({ includeSchedule: withSchedule }), null, 2);
    if (mode === 'download') downloadText(`recallio-${new Date().toISOString().slice(0, 10)}.json`, json);
    else if (mode === 'editor') {
      setText(json);
      setReport(null);
      toast('Dimuat ke editor');
    } else {
      try {
        await navigator.clipboard.writeText(json);
        toast('Disalin ke clipboard', 'success');
      } catch {
        toast('Clipboard tidak tersedia', 'error');
      }
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Impor &amp; Ekspor</h1>
          <p className="muted">Edit seluruh deck sebagai JSON, validasi langsung, lalu impor.</p>
        </div>
      </header>

      <section className="card pad">
        <div className="row wrap between">
          <h2 className="section-title tight">Editor JSON</h2>
          <div className="row wrap">
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFile} />
            <button className="btn btn-sm" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={14} /> Buka file
            </button>
            <button className="btn btn-sm" onClick={() => setText(SAMPLE_JSON)}>
              Isi contoh
            </button>
            <button className="btn btn-sm" disabled={!text.trim()} onClick={prettify}>
              Rapikan
            </button>
          </div>
        </div>

        <textarea
          ref={area}
          className={`input mono editor${result && !result.ok && !stale ? ' invalid' : ''}`}
          rows={16}
          spellCheck={false}
          placeholder={'Tempel JSON di sini, atau klik "Isi contoh".\nFormat: { "schema": "recallio.deck-bundle", "version": 1, "decks": [...] }'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setReport(null);
          }}
        />

        <div className={`validation${stale ? ' stale' : ''}`} aria-live="polite">
          {!result ? (
            <span className="muted">Menunggu input…</span>
          ) : result.ok ? (
            <>
              <div className="ok-line">
                <Icon name="check" size={16} /> Valid: {result.stats.decks} deck, {result.stats.cards} kartu
                {result.stats.withSchedule > 0 && `, ${result.stats.withSchedule} dengan jadwal`}
              </div>
              {result.warnings.length > 0 && (
                <ul className="issues warn">
                  {result.warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>
                      <code>{w.path}</code>: {w.message}
                    </li>
                  ))}
                  {result.warnings.length > 8 && <li>…dan {result.warnings.length - 8} peringatan lain</li>}
                </ul>
              )}
            </>
          ) : (
            <ul className="issues">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <code>{e.path}</code>
                  {e.line ? (
                    <button className="link" onClick={() => jump(e.line, e.column)}>
                      {' '}
                      baris {e.line}
                      {e.column ? `, kolom ${e.column}` : ''}
                    </button>
                  ) : null}
                  : {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="row end">
          <button className="btn btn-primary" disabled={!result?.ok || stale || busy} onClick={doImport}>
            {busy ? 'Mengimpor…' : 'Impor ke perangkat'}
          </button>
        </div>

        {report && (
          <div className="report">
            <strong>Hasil impor</strong>
            <span>
              Deck: {report.decksCreated} baru, {report.decksMatched} cocok
            </span>
            <span>
              Kartu: {report.cardsCreated} baru, {report.cardsUpdated} diperbarui, {report.cardsSkipped} dilewati (duplikat)
            </span>
            <button className="btn btn-sm" onClick={() => navigate('/')}>
              Lihat deck
            </button>
          </div>
        )}
      </section>

      <section className="card pad">
        <h2 className="section-title tight">Ekspor / backup</h2>
        <p className="muted">
          Data hanya tersimpan di perangkat ini. Ekspor berkala sebagai cadangan, atau untuk memindahkan ke perangkat lain.
        </p>
        <label className="check">
          <input type="checkbox" checked={withSchedule} onChange={(e) => setWithSchedule(e.target.checked)} />
          Sertakan jadwal FSRS (stabilitas, kesulitan, tanggal jatuh tempo)
        </label>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => exportAll('download')}>
            <Icon name="download" size={16} /> Unduh JSON
          </button>
          <button className="btn" onClick={() => exportAll('editor')}>
            Muat ke editor
          </button>
          <button className="btn" onClick={() => exportAll('copy')}>
            Salin
          </button>
        </div>
      </section>
    </>
  );
}
