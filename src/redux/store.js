import { configureStore, combineReducers } from "@reduxjs/toolkit";
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

const persistConfig = (key, extra = {}) => ({
  key,
  storage,
  ...extra,
});

// Each slice gets its own persistReducer wrapper so the state shape (state.languages,
// state.settings) stays unchanged for every existing useSelector call site.
const languagePersistedReducer = persistReducer(
  persistConfig("languages"),
  languagesReducer
);

const settingsPersistedReducer = persistReducer(
  persistConfig("settings", {
    version: 2,
    migrate: (state) =>
      Promise.resolve({
        ...(state && typeof state === "object" ? state : {}),
        keyboardShortcuts: state?.keyboardShortcuts !== false,
        captions: state?.captions !== false,
      }),
  }),
  settingsReducer
);

// Dispatch this to wipe all in-memory Redux state back to each slice's initial state.
export const RESET_STORE = "store/reset";

const combinedReducer = combineReducers({
  player: playerReducer,
  loadingBar: loadingBarReducer,
  languages: languagePersistedReducer,
  settings: settingsPersistedReducer,
});

// Passing undefined state makes every slice fall back to its initial state.
const rootReducer = (state, action) =>
  combinedReducer(action.type === RESET_STORE ? undefined : state, action);

export const store = configureStore({
  reducer: rootReducer,
  middleware: [thunk],
});

export const persistor = persistStore(store);
