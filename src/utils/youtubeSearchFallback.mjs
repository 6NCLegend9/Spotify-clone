// Each provider attempt is independent: a transport failure must not prevent
// the next configured search implementation from running.
export async function firstSuccessfulSearch(attempts) {
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result?.ok) return { ...result, source: "fallback" };
    } catch {
      // No provider response bodies or credentials belong in client diagnostics.
    }
  }
  return { ok: false, status: 502, source: "fallback", data: null };
}
