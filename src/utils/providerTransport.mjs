// Only safe reads are retried. All attempts share one deadline.
export function createProviderTransport({ fetchImpl = (...args) => fetch(...args), now = Date.now, random = Math.random, timeoutMs = 6000, threshold = 4, cooldownMs = 30_000, report = () => {} } = {}) {
  const circuits = new Map();
  return async function providerFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const key = `${url.origin}:${url.pathname.split('/').slice(0, 4).join('/')}`;
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const safe = method === 'GET' || method === 'HEAD';
    const caller = init.signal || input?.signal;
    caller?.throwIfAborted();
    let state = circuits.get(key);
    if (!state) {
      if (circuits.size >= 64) circuits.delete(circuits.keys().next().value);
      state = { failures: 0, until: 0, probing: false }; circuits.set(key, state);
    }
    if (state.until > now() || state.probing) {
      report({ code: 'CIRCUIT_OPEN' });
      throw Object.assign(new Error('Provider temporarily unavailable'), { code: 'CIRCUIT_OPEN' });
    }
    const probe = state.until > 0;
    if (probe) state.probing = true;
    const controller = new AbortController();
    const abort = () => controller.abort(caller.reason);
    caller?.addEventListener('abort', abort, { once: true });
    const started = now();
    const timer = setTimeout(() => controller.abort(new DOMException('Provider deadline exceeded', 'TimeoutError')), timeoutMs);
    let failed = false;
    let status;
    let attempts = 0;
    const wait = (ms) => new Promise((resolve, reject) => {
      controller.signal.throwIfAborted();
      const stop = () => { clearTimeout(delay); reject(controller.signal.reason); };
      const delay = setTimeout(() => { controller.signal.removeEventListener('abort', stop); resolve(); }, ms);
      controller.signal.addEventListener('abort', stop, { once: true });
    });
    try {
      for (;;) {
        controller.signal.throwIfAborted();
        attempts++;
        let response;
        try { response = await fetchImpl(input, { ...init, signal: controller.signal }); }
        catch (error) {
          if (controller.signal.aborted || !safe || attempts >= 2 || probe) throw error;
          await wait(150 + Math.floor(random() * 150));
          continue;
        }
        status = response.status;
        const transient = status === 429 || [500, 502, 503, 504].includes(status);
        failed = transient;
        if (!safe || !transient || attempts >= 2 || probe) return response;
        const retryAfter = response.headers.get('retry-after');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now();
        const delay = Math.max(150 + Math.floor(random() * 150), Number.isFinite(requested) ? requested : 0);
        // Do not retry sooner than Retry-After or beyond this request's budget.
        if (delay + 100 >= timeoutMs - (now() - started)) return response;
        await response.body?.cancel();
        await wait(delay);
      }
    } catch (error) {
      failed = !caller?.aborted;
      throw error;
    } finally {
      clearTimeout(timer); caller?.removeEventListener('abort', abort);
      state.probing = false;
      if (!caller?.aborted) {
        if (failed) {
          state.failures++;
          if (probe || state.failures >= threshold) state.until = now() + cooldownMs;
        } else { state.failures = 0; state.until = 0; }
      }
      report({ code: caller?.aborted ? 'CANCELLED' : controller.signal.aborted ? 'TIMEOUT' : failed ? 'NETWORK_ERROR' : 'OK', status, attempts, durationMs: now() - started });
    }
  };
}
