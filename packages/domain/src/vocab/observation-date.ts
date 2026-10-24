/** Validate a source calendar date without rolling invalid dates into another month. */
export function toIsoDate(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isFinite(value.getTime())
      ? value.toISOString().slice(0, 10)
      : null;
  const input = value.trim();
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      input,
    )
  )
    return null;
  const date = input.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}
