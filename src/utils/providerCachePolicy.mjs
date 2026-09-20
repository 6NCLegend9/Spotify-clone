import { createHash } from 'node:crypto';

export function providerCacheKey(endpoint, params = {}, options = {}, configured = false) {
  // Never share an authenticated, customized, aborted or explicitly uncached call.
  if (!['search', 'videos'].includes(endpoint) || options.signal || options.credentials || options.headers || options.body || options.method || options.cache === 'no-store' || options.next?.revalidate === 0) return null;
  const entries = Object.entries(params).filter(([, value]) => value != null).sort(([a], [b]) => a.localeCompare(b));
  if (entries.some(([key, value]) => /key|token|auth|cookie/i.test(key) || !['string', 'number', 'boolean'].includes(typeof value))) return null;
  return createHash('sha256').update(JSON.stringify([endpoint, entries, Boolean(options.requireOfficial), configured])).digest('hex');
}

export function cacheableProviderResult(result) {
  return result?.ok === true && Array.isArray(result.data?.items) && result.data.items.length > 0
    && result.data.items.every(item => typeof item?.snippet?.title === 'string' && item.snippet.title.trim());
}

// Cache failures and placeholder metadata must not replace usable results.
export function createProviderCache(cache, report = () => {}) {
  const pending = new Map();
  return async (key, load, ttl = 900) => {
    if (!key) return load();
    if (pending.has(key)) { report({ cache: 'coalesced' }); return pending.get(key); }
    const run = async () => {
      let loaded = false, result;
      try {
        const read = cache(async () => {
          loaded = true;
          result = await load();
          if (!cacheableProviderResult(result)) throw Object.assign(new Error('Uncacheable provider response'), { providerResult: result });
          return result;
        }, ['youtube-public-v1', key], { revalidate: ttl });
        const value = await read();
        report({ cache: loaded ? 'miss' : 'hit' });
        return value;
      } catch (error) {
        report({ cache: 'bypass' });
        if (Object.prototype.hasOwnProperty.call(error, 'providerResult')) return error.providerResult;
        // Cache infrastructure failure should not make music search unavailable.
        if (loaded) { if (result !== undefined) return result; throw error; }
        return load();
      }
    };
    const operation = run();
    if (pending.size < 100) pending.set(key, operation);
    try { return await operation; } finally { if (pending.get(key) === operation) pending.delete(key); }
  };
}
