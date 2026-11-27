import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { initNativeShell, isNativeApp } from '../native/capacitorApp';

/** Shows a compact offline strip (native Network plugin + browser online event). */
export default function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    if (isNativeApp()) {
      void initNativeShell((isOffline) => setOffline(isOffline));
    } else {
      void initNativeShell();
    }

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[100] bg-amber-600 text-white text-center text-sm font-semibold py-2 px-3 shadow-lg"
    >
      <span className="inline-flex items-center gap-2 justify-center">
        <WifiOff size={16} />
        {t('common.offline_banner')}
      </span>
    </div>
  );
}
