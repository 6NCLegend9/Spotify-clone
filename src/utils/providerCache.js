import { unstable_cache } from 'next/cache';
import { createProviderCache, providerCacheKey } from './providerCachePolicy.mjs';
import { reportProvider } from './providerRequestContext.mjs';

const cachedRead = createProviderCache(unstable_cache, reportProvider);
export function cachedYoutubeRead(endpoint, params, options, load) {
  if (process.env.YOUTUBE_SHARED_CACHE === '0') return load();
  const key = providerCacheKey(endpoint, params, options, Boolean(process.env.YOUTUBE_API_KEY?.trim()));
  return cachedRead(key, load, endpoint === 'videos' ? 3600 : 900);
}
