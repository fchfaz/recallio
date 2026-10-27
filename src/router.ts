import { useEffect, useState } from 'react';

const read = () => location.hash.replace(/^#/, '') || '/';

/** Router hash minimal: tidak perlu konfigurasi server & aman untuk hosting statis/PWA. */
export function useRoute(): string {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const navigate = (to: string) => {
  location.hash = to;
};
