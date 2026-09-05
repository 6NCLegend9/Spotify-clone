"use client";

import { createClient } from "@supabase/supabase-js";

let client = null;

// Public client credentials (anon key is designed to ship to the browser).
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 5 } } },
    );
  }
  return client;
}
