import { createSlice } from '@reduxjs/toolkit';

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
      state.activeSong = action.payload.song;
      }

      if(action.payload.data){
      state.currentSongs = action.payload.data;
      }

      if (action.payload.i !== undefined && action.payload.i !== null) {
        state.currentIndex = action.payload.i;
      }
      state.isActive = true;
      state.isPlaying = true;
    },

    nextSong: (state, action) => {

      if(state.currentSongs.length>0){
      state.activeSong = state.currentSongs[action.payload];
    
      state.currentIndex = action.payload;
      state.isActive = true;
      state.isPlaying = true;
      }
    },

    prevSong: (state, action) => {

      if(state.currentSongs.length>0){
      state.activeSong = state.currentSongs[action.payload];
      state.currentIndex = action.payload;
      state.isActive = true;
      state.isPlaying = true;
      }
    },

    playPause: (state, action) => {
      state.isPlaying = action.payload;
    },

    setYoutubeVideo: (state, action) => {
      state.youtubeVideo = action.payload;
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
      state.youtubeQueue = action.payload || [];
    },

    addToQueue: (state, action) => {
      const track = action.payload;
      if (track?.id && !state.youtubeQueue.some((item) => item.id === track.id)) {
        state.youtubeQueue.push(track);
      }
    },

    appendToQueue: (state, action) => {
      const tracks = action.payload || [];
      const existingIds = new Set(state.youtubeQueue.map((item) => item.id));
      tracks.forEach((track) => {
        if (track?.id && !existingIds.has(track.id)) {
          state.youtubeQueue.push(track);
          existingIds.add(track.id);
        }
      });
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
  setFullScreen,
  setAutoAdd,
} = playerSlice.actions;

export default playerSlice.reducer;
