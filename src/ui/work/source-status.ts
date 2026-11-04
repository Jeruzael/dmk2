// Display classification only. The stored source value is never rewritten.
export function compactSourceStatus(value: string): string {
  const source = value.trim();
  if (!source) return "Not set";
  const match =
    /^(DONE|PARTIAL|BLOCKED|FUTURE|UNKNOWN|BACKLOG|IN[-_ ]PROGRESS)(?:$|\s*(?:[—–:]|\s-\s|\())/i.exec(
      source,
    );
  return match ? match[1]!.toUpperCase().replace(/[-_]/g, " ") : "Unrecognized";
}
