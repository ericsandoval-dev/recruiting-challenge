export function parsePositiveIntegerQuery(
  value: unknown,
  defaultValue: number,
): number | null {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!/^[1-9]\d*$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}
