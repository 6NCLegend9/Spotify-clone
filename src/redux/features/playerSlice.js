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

      if(action.payload.i){
      state.currentIndex = action.payload.i;
      }
      state.isActive = true;
    },

    nextSong: (state, action) => {

      if(state.currentSongs.length>0){
      state.activeSong = state.currentSongs[action.payload];
    
      state.currentIndex = action.payload;
      state.isActive = true;
      }
    },

    prevSong: (state, action) => {

      if(state.currentSongs.length>0){
      state.activeSong = state.currentSongs[action.payload];
      state.currentIndex = action.payload;
      state.isActive = true;
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
        state.isPlaying = false;
      }
    },

    setYoutubeQueue: (state, action) => {
      state.youtubeQueue = action.payload || [];
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
  setFullScreen,
  setAutoAdd,
} = playerSlice.actions;

export default playerSlice.reducer;
