import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { navigate, useRoute } from './router';
import { useSettings } from './ui/hooks';
import { Icon, type IconName } from './ui/Icon';
import { Dashboard } from './ui/Dashboard';
import { DeckView } from './ui/DeckView';
import { Study } from './ui/Study';
import { Transfer } from './ui/Transfer';
import { SettingsPage } from './ui/SettingsPage';

const NAV: { to: string; label: string; icon: IconName; match: (r: string) => boolean }[] = [
  { to: '/', label: 'Deck', icon: 'layers', match: (r) => r === '/' || r.startsWith('/deck/') },
  { to: '/import', label: 'Impor/Ekspor', icon: 'upload', match: (r) => r.startsWith('/import') },
  { to: '/settings', label: 'Pengaturan', icon: 'sliders', match: (r) => r.startsWith('/settings') },
];

export function App() {
  const route = useRoute();
  const settings = useSettings();

  // Tema: 'system' mengikuti OS; pilihan eksplisit disimpan juga di localStorage agar tidak berkedip saat load.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    try {
      if (settings.theme === 'system') localStorage.removeItem('recallio-theme');
      else localStorage.setItem('recallio-theme', settings.theme);
    } catch {
      /* penyimpanan diblokir: abaikan */
    }
  }, [settings.theme]);

  // Minta penyimpanan persisten agar browser tidak menghapus IndexedDB saat ruang menipis.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const study = /^\/study(\/(.+))?$/.exec(route);
  if (study) return <Study deckId={study[2]} />;

  const deckMatch = /^\/deck\/(.+)$/.exec(route);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/icons/favicon.svg" alt="" width={32} height={32} />
          <span>Recallio</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <a key={n.to} href={`#${n.to}`} className={n.match(route) ? 'active' : ''}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <button className="btn btn-primary sidebar-cta" onClick={() => navigate('/study')}>
          <Icon name="play" size={16} /> Belajar
        </button>
      </aside>

      <main className="content">
        <div className="page" key={deckMatch ? 'deck' : route}>
          {deckMatch ? (
            <DeckView id={deckMatch[1]!} />
          ) : route.startsWith('/import') ? (
            <Transfer />
          ) : route.startsWith('/settings') ? (
            <SettingsPage />
          ) : (
            <Dashboard />
          )}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navigasi utama">
        {NAV.map((n) => (
          <a key={n.to} href={`#${n.to}`} className={n.match(route) ? 'active' : ''}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>

      {(offlineReady || needRefresh) && (
        <div className="pwa-banner" role="status">
          <span>{needRefresh ? 'Versi baru tersedia.' : 'Siap dipakai offline.'}</span>
          {needRefresh && (
            <button className="btn btn-primary btn-sm" onClick={() => updateServiceWorker(true)}>
              Muat ulang
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setOfflineReady(false);
              setNeedRefresh(false);
            }}
          >
            Tutup
          </button>
        </div>
      )}
    </div>
  );
}
