import { ApiRouteError } from "./apiResponseCore.mjs";

export async function mutateDocument(model, id, transform, guard = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await model.findById(id).lean();
    if (!current) throw new ApiRouteError("NOT_FOUND");
    const changes = transform(current);
    if (!changes) return current;
    const expected = ["__v", ...Object.keys(changes)].map((field) => ({
      [field]: current[field] === undefined ? { $exists: false } : { $eq: current[field] },
    }));
    const updated = await model.findOneAndUpdate(
      { _id: id, $and: [guard, ...expected] },
      { $set: changes, $inc: { __v: 1 } },
      { new: true, runValidators: true },
    ).lean();
    if (updated) return updated;
  }
  throw new ApiRouteError("CONFLICT", { message: "Your library changed. Please try again." });
}

export function boundedMembership(values, id, enabled, limit) {
  const items = Array.isArray(values) ? values : [];
  const present = items.some((value) => String(value) === String(id));
  if (!enabled) return items.filter((value) => String(value) !== String(id));
  if (present) return items;
  if (items.length >= limit) throw new ApiRouteError("VALIDATION_ERROR", { message: `This collection can contain up to ${limit} items.` });
  return [...items, id];
}

export function dateMapForMembers(values, previous = {}, addedId, now = new Date()) {
  return Object.fromEntries(values.map(String).filter(isSafeMemberMapKey).map((id) => [
    id, memberMapValue(previous, id) || (id === String(addedId) ? now : null),
  ]));
}

// Mongoose maps reject these keys. Track IDs remain valid collection members;
// occurrence metadata stores their dates without putting them in legacy maps.
export function isSafeMemberMapKey(key) {
  return !["constructor", "prototype", "__proto__"].includes(key)
    && !key.startsWith("$") && !key.includes(".");
}

export function memberMapValue(values, key) {
  if (values instanceof Map) return values.get(key);
  return values && Object.hasOwn(values, key) ? values[key] : undefined;
}
