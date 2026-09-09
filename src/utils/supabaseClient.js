"use client";

let client = null;
let clientPromise = null;

function supabaseUrl() {
  return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
}

function supabaseAnonKey() {
  return String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

// Public client credentials (anon key is designed to ship to the browser).
export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

// Loads @supabase/supabase-js on demand so the ~68 kB realtime client stays out
// of the initial bundle and only downloads when a Jam is actually started.
export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
      client = createClient(supabaseUrl(), supabaseAnonKey(), {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 10 } },
      });
      return client;
    });
  }
  return clientPromise;
}
