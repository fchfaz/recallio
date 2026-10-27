import { useEffect, useState } from 'react';
import { saveSettings, wipeAll } from '../db/repo';
import type { Settings } from '../core/types';
import { useInstallPrompt, useSettings } from './hooks';
import { useToast } from './toast';

function NumberField({ label, hint, value, min, max, onCommit }: { label: string; hint: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || text.trim() === '') return setText(String(value));
    const clamped = Math.min(max, Math.max(min, n));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <label className="setting">
      <span>
        <strong>{label}</strong>
        <small className="muted">{hint}</small>
      </span>
      <input
        className="input num-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

export function SettingsPage() {
  const s = useSettings();
  const toast = useToast();
  const install = useInstallPrompt();
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setStorage({ usage: est?.usage, quota: est?.quota, persisted });
    })().catch(() => {});
  }, []);

  const update = (patch: Partial<Settings>) => saveSettings(patch);
  const fmt = (n?: number) => (n === undefined ? '—' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

  async function wipe() {
    if (!confirm('Hapus SEMUA deck, kartu, riwayat, dan pengaturan dari perangkat ini? Tindakan ini tidak bisa dibatalkan.')) return;
    await wipeAll();
    toast('Semua data dihapus');
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Pengaturan</h1>
          <p className="muted">Tersimpan otomatis di perangkat ini.</p>
        </div>
      </header>

      <section className="card pad">
        <h2 className="section-title tight">Belajar</h2>
        <NumberField label="Kartu baru per hari" hint="Per deck" value={s.newPerDay} min={0} max={500} onCommit={(n) => update({ newPerDay: n })} />
        <NumberField label="Maks. ulasan per hari" hint="Per deck; kartu learning tidak dibatasi" value={s.maxReviewsPerDay} min={0} max={5000} onCommit={(n) => update({ maxReviewsPerDay: n })} />
        <label className="setting col">
          <span className="between row">
            <span>
              <strong>Target retensi (FSRS)</strong>
              <small className="muted">Makin tinggi = lebih sering mengulang</small>
            </span>
            <strong className="num">{Math.round(s.requestRetention * 100)}%</strong>
          </span>
          <input
            type="range"
            min={0.7}
            max={0.97}
            step={0.01}
            value={s.requestRetention}
            onChange={(e) => update({ requestRetention: Number(e.target.value) })}
          />
        </label>
        <label className="setting">
          <span>
            <strong>Fuzz interval</strong>
            <small className="muted">Acak kecil agar kartu tidak jatuh tempo bersamaan</small>
          </span>
          <input type="checkbox" className="switch" checked={s.enableFuzz} onChange={(e) => update({ enableFuzz: e.target.checked })} />
        </label>
      </section>

      <section className="card pad">
        <h2 className="section-title tight">Tampilan</h2>
        <div className="segmented" role="radiogroup" aria-label="Tema">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={s.theme === t} className={s.theme === t ? 'on' : ''} onClick={() => update({ theme: t })}>
              {t === 'system' ? 'Sistem' : t === 'light' ? 'Terang' : 'Gelap'}
            </button>
          ))}
        </div>
      </section>

      <section className="card pad">
        <h2 className="section-title tight">Aplikasi &amp; penyimpanan</h2>
        <div className="kv">
          <span className="muted">Penyimpanan terpakai</span>
          <span>
            {fmt(storage.usage)} / {fmt(storage.quota)}
          </span>
          <span className="muted">Penyimpanan persisten</span>
          <span>{storage.persisted === undefined ? '—' : storage.persisted ? 'Aktif' : 'Belum (browser dapat menghapus saat ruang menipis)'}</span>
          <span className="muted">Status pemasangan</span>
          <span>{install.installed ? 'Terpasang' : install.canInstall ? 'Dapat dipasang' : 'Gunakan menu browser › Tambahkan ke layar utama'}</span>
        </div>
        {install.canInstall && (
          <button className="btn btn-primary" onClick={install.install}>
            Pasang aplikasi
          </button>
        )}
      </section>

      <section className="card pad danger-zone">
        <h2 className="section-title tight">Zona berbahaya</h2>
        <p className="muted">Ekspor cadangan terlebih dahulu di halaman Impor/Ekspor.</p>
        <button className="btn btn-danger" onClick={wipe}>
          Hapus semua data
        </button>
      </section>
    </>
  );
}
