import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import instance from "../lib/axios";
import { setUser } from "./user";

export const getTrack = createAsyncThunk(
  "player/track",
  async ({ type, id, offset }, { getState, rejectWithValue, dispatch }) => {
    if (!getState().user) {
      return rejectWithValue({ status: 401, message: "User not logged" });
    }

    try {
      let response = await instance.get("/music/get-audio-tracks", {
        params: {
          id,
          type,
          offset,
        },
      });

      return response?.data?.data;
    } catch (error) {
      if ([401, 403, 405].includes(error?.response?.status)) {
        dispatch(setUser(null));
      }

      return rejectWithValue({
        status: error?.response?.status || 500,
        message: error?.response?.data?.message || "Unable to load track",
      });
    }
  }
);

const playerSlice = createSlice({
  name: "player",
  initialState: {
    data: {
      total: 0,
      offset: 0,
      type: null,
      id: null,
      track: null,
    },
    volume: localStorage.getItem("volume") || 1,
    time: { current: `00 : 00`, duration: `00 : 00` },
    status: false,
  },
  reducers: {
    setTime: (state, { payload }) => {
      if (payload?.current) {
        state.time.current = payload.current;
      }

      if (payload?.duration) {
        state.time.duration = payload.duration;
      }

      return state;
    },
    resetData: (state) => {
      state.data = {
        total: 0,
        offset: 0,
        type: null,
        id: null,
        track: null,
      };
      return state;
    },
    setVolume: (state, { payload }) => {
      state.volume = payload;
      return state;
    },
    setStatus: (state, { payload }) => {
      state.status = payload;
      return state;
    },
  },
  extraReducers: (callback) => {
    callback.addCase(getTrack.fulfilled, (state, { payload }) => {
      state.data = payload;

      state.status = true;
      return state;
    });

    callback.addCase(getTrack.rejected, (state) => {
      state.data.track = null;
      return state;
    });
  },
});

export const { setTime, resetData, setVolume, setStatus } = playerSlice.actions;
export default playerSlice.reducer;
