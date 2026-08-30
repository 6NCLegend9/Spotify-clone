import { configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";
import createWebStorage from "redux-persist/lib/storage/createWebStorage";
import thunk from "redux-thunk";

import playerReducer from "./features/playerSlice";
import loadingBarReducer from "./features/loadingBarSlice";
import languagesReducer from "./features/languagesSlice";
import settingsReducer from "./features/settingsSlice";

const createNoopStorage = () => {
  return {
    getItem(_key) {
      return Promise.resolve(null);
    },
    setItem(_key, value) {
      return Promise.resolve(value);
    },
    removeItem(_key) {
      return Promise.resolve();
    },
  };
};
const storage =
  typeof window !== "undefined"
    ? createWebStorage("local")
    : createNoopStorage();

const persistConfig = (key) => ({
  key,
  storage,
});

// Each slice gets its own persistReducer wrapper so the state shape (state.languages,
// state.settings) stays unchanged for every existing useSelector call site.
const languagePersistedReducer = persistReducer(
  persistConfig("languages"),
  languagesReducer
);

const settingsPersistedReducer = persistReducer(
  persistConfig("settings"),
  settingsReducer
);

export const store = configureStore({
  reducer: {
    player: playerReducer,
    loadingBar: loadingBarReducer,
    languages: languagePersistedReducer,
    settings: settingsPersistedReducer,
  },
  middleware: [thunk],
});

export const persistor = persistStore(store);
