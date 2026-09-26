function normalizedSchema(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function shouldResetRendererCache({ storedSchema, currentSchema } = {}) {
  const stored = normalizedSchema(storedSchema);
  const current = normalizedSchema(currentSchema);
  if (current === null || current < 1) return true;
  if (stored === null) return true;
  return stored !== current;
}
