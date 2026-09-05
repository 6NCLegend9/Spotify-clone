"use client";

import { createContext, useContext } from "react";
import useJamSession from "@/hooks/useJamSession";

const JamContext = createContext(null);

// One shared jam session for the whole app so the controller drawer and any
// "Add to Jam queue" buttons act on the same Supabase channel.
export function JamProvider({ children }) {
  const jam = useJamSession();
  return <JamContext.Provider value={jam}>{children}</JamContext.Provider>;
}

export function useJam() {
  return useContext(JamContext);
}
