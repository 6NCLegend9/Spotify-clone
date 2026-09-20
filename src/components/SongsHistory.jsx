'use client';
import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useSession } from 'next-auth/react';
import { requestJson } from '@/services/http';
import { accountOwner, readAccountCache, writeAccountCache } from '@/utils/accountCache.mjs';
import { HISTORY_CACHE, HISTORY_CHANGED, prependHistory } from '@/utils/recentActivity.mjs';

export default function SongsHistory() {
  const { activeSong, youtubeVideo, playbackOwner, isPlaying, position } = useSelector((state) => state.player || {});
  const privateSession = useSelector((state) => state.settings.privateSession);
  const { data: session, status } = useSession();
  const owner = accountOwner(session, status);
  const recorded = useRef(null);
  const previous = useRef({ key: null, position: 0 });
  const track = youtubeVideo?.id ? youtubeVideo : activeSong;
  const key = `${owner}:${youtubeVideo?.id ? 'youtube' : 'audio'}:${track?.id || ''}`;

  useEffect(() => {
    if (previous.current.key !== key || (position < 5 && previous.current.position >= 5)) recorded.current = null;
    previous.current = { key, position };
    if (status !== 'authenticated' || !owner || owner !== playbackOwner || !isPlaying || privateSession || !track?.id || !(track.title || track.name)) return;
    if (youtubeVideo?.id && (!Number.isFinite(position) || position < 5)) return;
    if (recorded.current === key) return;
    recorded.current = key;
    const entry = youtubeVideo?.id ? {
      source: 'youtube', id: track.id, title: track.title, channel: track.channel,
      thumbnail: track.thumbnail, playedAt: new Date().toISOString(),
    } : { ...track, playedAt: new Date().toISOString() };
    try {
      const history = readAccountCache(localStorage, HISTORY_CACHE, owner, 30 * 86400_000);
      writeAccountCache(localStorage, HISTORY_CACHE, owner, prependHistory(history, entry));
    } catch {}
    window.dispatchEvent(new CustomEvent(HISTORY_CHANGED, { detail: { owner, entry } }));
    // The server history API accepts YouTube IDs. Local file history stays local.
    if (youtubeVideo?.id) void requestJson('/api/history', { method: 'POST', body: { entry } }).catch(() => {});
  }, [key, owner, playbackOwner, position, isPlaying, privateSession, status, track, youtubeVideo?.id]);
  return null;
}
