export function mongoPoolSize(value) {
  const size = Number(value);
  return Number.isInteger(size) && size >= 1 && size <= 100 ? size : 5;
}