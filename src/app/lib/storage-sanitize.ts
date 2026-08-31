export function sanitizeForStorage<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return null as T;
  }
  return JSON.parse(serialized) as T;
}
