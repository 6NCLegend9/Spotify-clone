import { createSlice } from '@reduxjs/toolkit';
import { decodeTrackFields } from '../../utils/text.js';
import { normalizePlaybackSnapshot } from '../../utils/playbackSnapshot.mjs';
import { editUpcomingQueue } from '../../utils/playerQueue.mjs';
import { canonicalSongIdentity } from '../../utils/songIdentity.mjs';

const initialState = {
  currentSongs: [],
  currentIndex: 0,
  isActive: false,
  isPlaying: false,
  activeSong: {},
  youtubeVideo: null,
  youtubeQueue: [],
  fullScreen: false,
  autoAdd: false,
  position: 0,
  restorePosition: null,
  playbackOwner: null,
  queueUndo: null,
  queueMode: 'radio',
  queueManualEnd: false,
  playbackContext: null,
  userQueue: [],
  history: [],
  queueSequence: 0,
};

function normalizeContext(value) {
  if (!value || typeof value !== 'object') return null;
  const type = typeof value.type === 'string' ? value.type.slice(0, 40) : '';
  const id = typeof value.id === 'string' ? value.id.slice(0, 160) : '';
  const name = typeof value.name === 'string' ? value.name.slice(0, 160) : '';
  if (!type && !id && !name) return null;
  return { type: type || 'unknown', ...(id ? { id } : {}), ...(name ? { name } : {}) };
}

function syncLegacyQueueMode(state) {
  state.queueManualEnd = state.queueMode === 'collection';
}

function nextQueueEntry(state, rawTrack, source = 'context') {
  const decoded = decodeTrackFields(rawTrack);
  if (!decoded?.id) return null;
  state.queueSequence += 1;
  return {
    ...decoded,
    queueSource: decoded.queueSource === 'user' ? 'user' : source,
    queueEntryId: decoded.queueEntryId || `${source}:${state.queueSequence}:${decoded.id}`,
  };
}

function normalizeQueueEntry(state, rawTrack, source = 'context') {
  const decoded = decodeTrackFields(rawTrack);
  if (!decoded?.id) return null;
  if (decoded.queueEntryId) {
    return {
      ...decoded,
      queueSource: decoded.queueSource === 'user' ? 'user' : source,
    };
  }
  return nextQueueEntry(state, decoded, source);
}

function sameOccurrence(left, right) {
  if (!left || !right) return false;
  if (left.queueEntryId && right.queueEntryId) return left.queueEntryId === right.queueEntryId;
  return left.id === right.id;
}

function pushHistory(state, track) {
  if (!track?.id) return;
  const last = state.history[state.history.length - 1];
  if (last && sameOccurrence(last, track)) return;
  state.history.push({ ...track });
  if (state.history.length > 50) state.history.splice(0, state.history.length - 50);
}

function syncUserQueue(state) {
  state.userQueue = state.youtubeQueue.filter(
    (entry) => entry?.queueSource === 'user' && !sameOccurrence(entry, state.youtubeVideo),
  );
}

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    restorePlayback: (_state, action) => {
      const snapshot = normalizePlaybackSnapshot(action.payload?.snapshot);
      const queueMode = snapshot.queueMode || (snapshot.queueManualEnd ? 'collection' : 'radio');
      return {
        ...initialState,
        ...snapshot,
        queueMode,
        queueManualEnd: queueMode === 'collection',
        playbackOwner: action.payload?.owner || null,
        restorePosition: snapshot.youtubeVideo ? snapshot.position : null,
      };
    },

    setPlaybackPosition: (state, action) => {
      if (action.payload?.id !== state.youtubeVideo?.id) return;
      if (Number.isFinite(action.payload.position)) {
        state.position = Math.max(0, action.payload.position);
      }
    },

    setActiveSong: (state, action) => {
      state.queueUndo = null;
      state.position = 0;
      state.restorePosition = null;
      state.youtubeVideo = null;
      state.youtubeQueue = [];
      state.userQueue = [];
      state.playbackContext = null;
      state.queueMode = 'collection';
      syncLegacyQueueMode(state);
      if (action.payload.song) state.activeSong = decodeTrackFields(action.payload.song);
      if (action.payload.data) state.currentSongs = action.payload.data.map((song) => decodeTrackFields(song));
      if (action.payload.i !== undefined && action.payload.i !== null) state.currentIndex = action.payload.i;
      state.isActive = true;
      state.isPlaying = true;
    },

    nextSong: (state, action) => {
      if (state.currentSongs.length > 0) {
        state.activeSong = decodeTrackFields(state.currentSongs[action.payload]);
        state.currentIndex = action.payload;
        state.isActive = true;
        state.isPlaying = true;
      }
    },

    prevSong: (state, action) => {
      if (state.currentSongs.length > 0) {
        state.activeSong = decodeTrackFields(state.currentSongs[action.payload]);
        state.currentIndex = action.payload;
        state.isActive = true;
        state.isPlaying = true;
      }
    },

    playPause: (state, action) => {
      state.isPlaying = action.payload;
    },

    setYoutubeVideo: (state, action) => {
      state.queueUndo = null;
      state.position = 0;
      state.restorePosition = null;
      let nextVideo = decodeTrackFields(action.payload);

      if (nextVideo?.id && state.youtubeVideo?.id && state.queueMode === 'radio'
        && !state.youtubeQueue.some((item) => item?.id === nextVideo.id)
        && canonicalSongIdentity(nextVideo)
        && canonicalSongIdentity(nextVideo) === canonicalSongIdentity(state.youtubeVideo)) {
        const currentIndex = state.youtubeQueue.findIndex((item) => sameOccurrence(item, state.youtubeVideo));
        const replacement = state.youtubeQueue
          .slice(currentIndex < 0 ? 0 : currentIndex + 1)
          .find((item) => item?.id && canonicalSongIdentity(item) !== canonicalSongIdentity(state.youtubeVideo));
        if (replacement) nextVideo = replacement;
      }

      if (state.youtubeVideo?.id && nextVideo?.id && !sameOccurrence(state.youtubeVideo, nextVideo)) {
        pushHistory(state, state.youtubeVideo);
      }

      const queuedOccurrence = state.youtubeQueue.find((item) => sameOccurrence(item, nextVideo))
        || state.youtubeQueue.find((item) => item?.id === nextVideo?.id);
      state.youtubeVideo = queuedOccurrence || nextVideo;
      if (state.youtubeVideo) {
        state.activeSong = {};
        state.currentSongs = [];
        state.isActive = false;
        state.isPlaying = true;
      } else {
        state.isPlaying = false;
      }
      syncUserQueue(state);
    },

    setYoutubeQueue: (state, action) => {
      state.queueUndo = null;
      const rawQueue = Array.isArray(action.payload) ? action.payload : [];
      const nextQueue = rawQueue
        .map((track) => normalizeQueueEntry(state, track, track?.queueSource === 'user' ? 'user' : 'context'))
        .filter(Boolean);
      const currentIds = new Set(state.youtubeQueue.map((track) => track?.queueEntryId || track?.id).filter(Boolean));
      const sameMembership = nextQueue.length === state.youtubeQueue.length
        && nextQueue.every((track) => currentIds.has(track.queueEntryId || track.id));
      if (!sameMembership) state.queueMode = 'collection';
      state.youtubeQueue = nextQueue;
      syncLegacyQueueMode(state);
      syncUserQueue(state);
    },

    startYoutubePlayback: (state, action) => {
      const rawTrack = decodeTrackFields(action.payload?.track);
      if (!rawTrack?.id) return;
      const rawQueue = Array.isArray(action.payload?.queue) ? action.payload.queue : [];
      let queue = rawQueue
        .map((item) => nextQueueEntry(state, item, 'context'))
        .filter(Boolean);
      let track = queue.find((item) => item.id === rawTrack.id);
      if (!track) {
        track = nextQueueEntry(state, rawTrack, 'context');
        if (track) queue.unshift(track);
      }
      if (!track) return;

      state.queueUndo = null;
      state.queueMode = action.payload?.queueMode === 'collection' || action.payload?.autoExtend === false
        ? 'collection'
        : 'radio';
      syncLegacyQueueMode(state);
      state.playbackContext = normalizeContext(action.payload?.context);
      state.userQueue = [];
      state.youtubeQueue = queue;
      state.youtubeVideo = track;
      state.activeSong = {};
      state.currentSongs = [];
      state.currentIndex = Math.max(0, queue.findIndex((item) => sameOccurrence(item, track)));
      state.isActive = false;
      state.isPlaying = true;
      state.position = 0;
      state.restorePosition = null;
      state.history = [];
    },

    editQueue: (state, action) => {
      const currentId = state.youtubeVideo?.queueEntryId || state.youtubeVideo?.id;
      let next;
      if (action.payload?.kind === 'clear') {
        if (!state.userQueue.length || !Number.isFinite(action.payload.now)) return;
        const explicitEntries = new Set(state.userQueue.map((item) => item.queueEntryId).filter(Boolean));
        next = state.youtubeQueue.filter((item) => !explicitEntries.has(item.queueEntryId));
      } else {
        next = editUpcomingQueue(state.youtubeQueue, currentId, action.payload);
      }
      if (next === state.youtubeQueue || !Number.isFinite(action.payload.now)) return;
      state.queueUndo = {
        queue: state.youtubeQueue,
        userQueue: state.userQueue,
        queueMode: state.queueMode,
        currentId,
        expiresAt: action.payload.now + 10_000,
      };
      state.youtubeQueue = next;
      syncLegacyQueueMode(state);
      syncUserQueue(state);
    },

    undoQueueEdit: (state, action) => {
      const undo = state.queueUndo;
      state.queueUndo = null;
      if (!undo || !Number.isFinite(action.payload?.now) || action.payload.now >= undo.expiresAt
        || undo.currentId !== (state.youtubeVideo?.queueEntryId || state.youtubeVideo?.id)) return;
      state.youtubeQueue = undo.queue;
      state.userQueue = undo.userQueue || [];
      state.queueMode = undo.queueMode || 'collection';
      syncLegacyQueueMode(state);
    },

    expireQueueUndo: (state) => { state.queueUndo = null; },

    addToQueue: (state, action) => {
      const track = nextQueueEntry(state, action.payload, 'user');
      if (!track?.id) return;
      state.queueUndo = null;
      state.youtubeQueue.push(track);
      state.userQueue.push(track);
    },

    appendToQueue: (state, action) => {
      const tracks = action.payload || [];
      const existingIds = new Set(state.youtubeQueue.map((item) => item.id));
      const radioMode = state.queueMode === 'radio';
      const existingSongIdentities = new Set(
        radioMode
          ? state.youtubeQueue.map((item) => canonicalSongIdentity(item)).filter(Boolean)
          : [],
      );

      tracks.forEach((track) => {
        const decoded = decodeTrackFields(track);
        if (!decoded?.id || existingIds.has(decoded.id)) return;
        const songIdentity = radioMode ? canonicalSongIdentity(decoded) : '';
        if (radioMode && songIdentity && existingSongIdentities.has(songIdentity)) return;
        const entry = nextQueueEntry(state, decoded, 'context');
        if (!entry) return;
        state.queueUndo = null;
        state.youtubeQueue.push(entry);
        existingIds.add(entry.id);
        if (songIdentity) existingSongIdentities.add(songIdentity);
      });
    },

    playNextToQueue: (state, action) => {
      const track = nextQueueEntry(state, action.payload, 'user');
      if (!track?.id) return;
      state.queueUndo = null;
      const currentEntryId = state.youtubeVideo?.queueEntryId;
      const index = currentEntryId
        ? state.youtubeQueue.findIndex((item) => item.queueEntryId === currentEntryId)
        : state.youtubeQueue.findIndex((item) => item.id === state.youtubeVideo?.id);
      const insertIndex = index >= 0 ? index + 1 : 0;
      state.youtubeQueue.splice(insertIndex, 0, track);
      state.userQueue.unshift(track);
    },

    clearUserQueue: (state) => {
      if (!state.userQueue.length) return;
      const userIds = new Set(state.userQueue.map((item) => item.queueEntryId).filter(Boolean));
      state.youtubeQueue = state.youtubeQueue.filter((item) => !userIds.has(item.queueEntryId));
      state.userQueue = [];
      state.queueUndo = null;
    },

    setPlaybackContext: (state, action) => {
      state.playbackContext = normalizeContext(action.payload);
    },

    setQueueMode: (state, action) => {
      state.queueMode = action.payload === 'collection' ? 'collection' : 'radio';
      syncLegacyQueueMode(state);
    },

    setFullScreen: (state, action) => {
      state.fullScreen = action.payload;
    },

    setAutoAdd: (state, action) => {
      state.autoAdd = action.payload;
    },
  },
});

export const {
  restorePlayback,
  setPlaybackPosition,
  setActiveSong,
  nextSong,
  prevSong,
  playPause,
  setYoutubeVideo,
  setYoutubeQueue,
  startYoutubePlayback,
  editQueue,
  undoQueueEdit,
  expireQueueUndo,
  addToQueue,
  appendToQueue,
  playNextToQueue,
  clearUserQueue,
  setPlaybackContext,
  setQueueMode,
  setFullScreen,
  setAutoAdd,
} = playerSlice.actions;

export default playerSlice.reducer;
