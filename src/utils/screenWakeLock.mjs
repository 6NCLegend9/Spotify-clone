export function createScreenWakeLock(wakeLock, isVisible) {
  let disposed = false;
  let pending = false;
  let sentinel = null;

  const release = async (lock) => {
    try {
      await lock?.release();
    } catch {}
  };

  return {
    async acquire() {
      if (disposed || pending || sentinel || !isVisible()) return;
      pending = true;
      try {
        const acquired = await wakeLock.request("screen");
        if (disposed || !isVisible()) {
          await release(acquired);
          return;
        }
        if (acquired.released) return;
        sentinel = acquired;
        acquired.addEventListener("release", () => {
          if (sentinel === acquired) sentinel = null;
        }, { once: true });
      } catch {} finally {
        pending = false;
      }
    },
    dispose() {
      disposed = true;
      const acquired = sentinel;
      sentinel = null;
      void release(acquired);
    },
  };
}