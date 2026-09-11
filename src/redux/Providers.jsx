"use client";

import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { store, persistor } from "./store";
import { PersistGate } from "redux-persist/integration/react";
import { RefreshCw } from "lucide-react";

function StartupFallback() {
  const [canRetry, setCanRetry] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setCanRetry(true), 10_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main id="main-content" className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-[var(--text)]">
      <img src="/icon-192x192.png" width={64} height={64} alt="HeyKasa" className="h-16 w-16 rounded-lg" />
      <div role="status" aria-label="Loading HeyKasa" className="flex items-center gap-3 text-sm text-[var(--muted)]">
        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
        Loading HeyKasa
      </div>
      {canRetry && <button type="button" className="btn-ghost min-h-12 gap-2 px-4" onClick={() => window.location.reload()}><RefreshCw size={18} aria-hidden="true" />Reload</button>}
      <noscript>JavaScript is required to play music.</noscript>
    </main>
  );
}

export default function Providers({ children }) {
  return (
    <Provider store={store}>
      <PersistGate loading={<StartupFallback />} persistor={persistor}>
        {children}
      </PersistGate>
    </Provider>
  );
}
