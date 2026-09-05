"use client";

let client = null;
let clientPromise = null;

// Public client credentials (anon key is designed to ship to the browser).
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Loads @supabase/supabase-js on demand so the ~68 kB realtime client stays out
// of the initial bundle and only downloads when a Jam is actually started.
export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
      client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 5 } } },
      );
      return client;
    });
  }
  return clientPromise;
}
