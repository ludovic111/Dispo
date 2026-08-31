/** Replaces the printf placeholders inherited from the Swift string catalog. */
export function formatSwiftPlaceholders(
  template: string,
  ...values: readonly (number | string)[]
): string {
  const positional = template.replace(/%(\d+)\$@/g, (_match, rawIndex: string) => {
    const value = values[Number(rawIndex) - 1];
    return value === undefined ? '' : String(value);
  });
  let index = 0;
  return positional.replace(/%@|%lld|%d/g, () => {
    const value = values[index];
    index += 1;
    return value === undefined ? '' : String(value);
  });
}
