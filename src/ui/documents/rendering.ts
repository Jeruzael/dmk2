// A CommonMark soft break in plain prose renders as whitespace. Joining only
// those breaks avoids GFM's costly processing of very long wrapped paragraphs.
// Source bytes are untouched; structured Markdown and hard breaks stay exact.
export function prepareRepositoryMarkdown(content: string): string {
  let fence: { marker: string; length: number } | undefined;
  return content
    .split(/(\r?\n[\t ]*\r?\n)/)
    .map((part, index) => {
      if (index % 2) return part;
      const lines = part.split(/\r?\n/);
      let protectedBlock = !!fence;
      for (const line of lines) {
        const marker = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (marker) {
          protectedBlock = true;
          if (!fence)
            fence = { marker: marker[1]![0]!, length: marker[1]!.length };
          else if (
            marker[1]![0] === fence.marker &&
            marker[1]!.length >= fence.length &&
            !marker[2]!.trim()
          )
            fence = undefined;
        }
      }
      if (protectedBlock || part.length < 32768) return part;
      const ordinary = lines.every(
        (line) =>
          !/[|`*_~\[\]<>]/.test(line) &&
          !/^(?: {4}|\t)/.test(line) &&
          !/^[ \t]{0,3}(?:#{1,6}(?:\s|$)|>|[-+]\s|\d{1,9}[.)]\s|[-=]{3,}\s*$)/.test(
            line,
          ) &&
          !/(?: {2,}|\\)$/.test(line),
      );
      return ordinary ? lines.join(" ") : part;
    })
    .join("");
}
