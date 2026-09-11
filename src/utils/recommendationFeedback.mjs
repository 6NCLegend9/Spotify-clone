export function activeSnoozedTracks(profile, now = Date.now()) {
  const dates = profile?.snoozedUntil instanceof Map ? Object.fromEntries(profile.snoozedUntil) : profile?.snoozedUntil || {};
  return (profile?.snoozedTracks || []).filter((id) => !dates[id] || new Date(dates[id]).getTime() > now);
}

export function updateFeedback(profile, field, id, remove, now = Date.now()) {
  const existing = field === "snoozedTracks" ? activeSnoozedTracks(profile, now) : profile[field] || [];
  const values = remove ? existing.filter((value) => value !== id)
    : [...existing.filter((value) => value !== id), id].slice(-200);
  if (field !== "snoozedTracks") return { [field]: values };
  const dates = profile.snoozedUntil instanceof Map ? Object.fromEntries(profile.snoozedUntil) : profile.snoozedUntil || {};
  return {
    snoozedTracks: values,
    snoozedUntil: Object.fromEntries(values.filter((value) => value === id && !remove || dates[value]).map((value) =>
      [value, value === id && !remove ? new Date(now + 7 * 86400_000) : dates[value]])),
  };
}