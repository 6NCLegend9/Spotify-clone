import { createSlice } from '@reduxjs/toolkit';
import { decodeTrackFields } from '../../utils/text.js';
import { normalizePlaybackSnapshot } from '../../utils/playbackSnapshot.mjs';
import { editUpcomingQueue } from '../../utils/playerQueue.mjs';

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
  queueManualEnd: false,
};

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    restorePlayback: (_state, action) => {
      const snapshot = normalizePlaybackSnapshot(action.payload?.snapshot);
      return {
        ...initialState,
        ...snapshot,
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
      if(action.payload.song){
      state.activeSong = decodeTrackFields(action.payload.song);
      }

      if(action.payload.data){
      state.currentSongs = action.payload.data.map((song) => decodeTrackFields(song));
      }

      if (action.payload.i !== undefined && action.payload.i !== null) {
        state.currentIndex = action.payload.i;
      }
      state.isActive = true;
      state.isPlaying = true;
    },

    nextSong: (state, action) => {

      if(state.currentSongs.length>0){
      state.activeSong = decodeTrackFields(state.currentSongs[action.payload]);
    
      state.currentIndex = action.payload;
      state.isActive = true;
      state.isPlaying = true;
      }
    },

    prevSong: (state, action) => {

      if(state.currentSongs.length>0){
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
      state.youtubeVideo = decodeTrackFields(action.payload);
      if (action.payload) {
        state.activeSong = {};
        state.currentSongs = [];
        state.isActive = false;
        // Selecting a track always starts playback. YouTube can emit PAUSED/ENDED
        // during a fade; leaving isPlaying false here is what stalled song two.
        state.isPlaying = true;
      } else {
        state.isPlaying = false;
      }
    },

    // Reordering an existing queue (shuffle, mood, queue editor) must not change
    // whether it is a finite collection or an auto-extending radio queue.
    setYoutubeQueue: (state, action) => {
      state.queueUndo = null;
      state.youtubeQueue = (action.payload || []).map((track) => decodeTrackFields(track));
    },

    startYoutubePlayback: (state, action) => {
      const track = decodeTrackFields(action.payload?.track);
      if (!track?.id) return;
      const queue = Array.isArray(action.payload?.queue)
        ? action.payload.queue.map((item) => decodeTrackFields(item)).filter((item) => item?.id)
        : [];
      if (!queue.some((item) => item.id === track.id)) queue.unshift(track);
      state.queueUndo = null;
      // `autoExtend: false` marks a finite collection such as a playlist or
      // Liked Songs. Home/Search starts omit it and become track-seeded radio.
      state.queueManualEnd = action.payload?.autoExtend === false;
      state.youtubeQueue = queue;
      state.youtubeVideo = track;
      state.activeSong = {};
      state.currentSongs = [];
      state.currentIndex = Math.max(0, queue.findIndex((item) => item.id === track.id));
      state.isActive = false;
      state.isPlaying = true;
      state.position = 0;
      state.restorePosition = null;
    },


    editQueue: (state, action) => {
      const currentId = state.youtubeVideo?.id;
      const next = editUpcomingQueue(state.youtubeQueue, currentId, action.payload);
      if (next === state.youtubeQueue || !Number.isFinite(action.payload.now)) return;
      state.queueUndo = {
        queue: state.youtubeQueue,
        manualEnd: state.queueManualEnd,
        currentId,
        expiresAt: action.payload.now + 10_000,
      };
      state.youtubeQueue = next;
      if (action.payload.kind === "clear") state.queueManualEnd = true;
    },

    undoQueueEdit: (state, action) => {
      const undo = state.queueUndo;
      state.queueUndo = null;
      if (!undo || !Number.isFinite(action.payload?.now) || action.payload.now >= undo.expiresAt
        || undo.currentId !== state.youtubeVideo?.id) return;
      state.youtubeQueue = undo.queue;
      state.queueManualEnd = undo.manualEnd;
    },

    expireQueueUndo: (state) => { state.queueUndo = null; },

    addToQueue: (state, action) => {
      const track = decodeTrackFields(action.payload);
      if (track?.id && !state.youtubeQueue.some((item) => item.id === track.id)) {
        state.queueUndo = null;
        state.youtubeQueue.push(track);
      }
    },

    appendToQueue: (state, action) => {
      const tracks = action.payload || [];
      const existingIds = new Set(state.youtubeQueue.map((item) => item.id));
      tracks.forEach((track) => {
        const decoded = decodeTrackFields(track);
        if (decoded?.id && !existingIds.has(decoded.id)) {
          state.queueUndo = null;
          state.youtubeQueue.push(decoded);
          existingIds.add(decoded.id);
        }
      });
    },

    playNextToQueue: (state, action) => {
      const track = decodeTrackFields(action.payload);
      if (!track?.id) return;
      if (track.id === state.youtubeVideo?.id) return;
      state.queueUndo = null;
      const queue = state.youtubeQueue || [];
      const currentId = state.youtubeVideo?.id;
      const filtered = queue.filter((item) => item.id !== track.id);
      const index = currentId ? filtered.findIndex((item) => item.id === currentId) : -1;
      const insertIndex = index >= 0 ? index + 1 : 0;
      filtered.splice(insertIndex, 0, track);
      state.youtubeQueue = filtered;
    },

    setFullScreen: (state, action) => {
      state.fullScreen = action.payload;
    },

    setAutoAdd: (state, action) => {
      state.autoAdd = action.payload;
    }
   
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
  setFullScreen,
  setAutoAdd,
} = playerSlice.actions;

export default playerSlice.reducer;
