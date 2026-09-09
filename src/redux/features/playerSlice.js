import { createSlice } from '@reduxjs/toolkit';
import { decodeTrackFields } from '@/utils/text';

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
};

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    setActiveSong: (state, action) => {
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

    setYoutubeQueue: (state, action) => {
      state.youtubeQueue = (action.payload || []).map((track) => decodeTrackFields(track));
    },

    addToQueue: (state, action) => {
      const track = decodeTrackFields(action.payload);
      if (track?.id && !state.youtubeQueue.some((item) => item.id === track.id)) {
        state.youtubeQueue.push(track);
      }
    },

    appendToQueue: (state, action) => {
      const tracks = action.payload || [];
      const existingIds = new Set(state.youtubeQueue.map((item) => item.id));
      tracks.forEach((track) => {
        const decoded = decodeTrackFields(track);
        if (decoded?.id && !existingIds.has(decoded.id)) {
          state.youtubeQueue.push(decoded);
          existingIds.add(decoded.id);
        }
      });
    },

    playNextToQueue: (state, action) => {
      const track = decodeTrackFields(action.payload);
      if (!track?.id) return;
      const queue = state.youtubeQueue || [];
      const currentId = state.youtubeVideo?.id;
      const index = currentId ? queue.findIndex((item) => item.id === currentId) : -1;
      const filtered = queue.filter((item) => item.id !== track.id);
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
  setActiveSong,
  nextSong,
  prevSong,
  playPause,
  setYoutubeVideo,
  setYoutubeQueue,
  addToQueue,
  appendToQueue,
  playNextToQueue,
  setFullScreen,
  setAutoAdd,
} = playerSlice.actions;

export default playerSlice.reducer;
