export function splitMessage(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text];

  if (maxLength < 8) throw new Error("maxLength is too small for HTML-safe splitting");

  const tokens = text.match(/<[^>]+>|&(?:#\d+|#x[\da-f]+|[a-z][\w]+);|./gis) ?? [];
  const chunks: string[] = [];
  const openTags: string[] = [];
  let chunk = "";

  const serializeClosingTags = (tags: string[]) => [...tags].reverse().map((tag) => `</${tag}>`).join("");
  const closingTags = () => serializeClosingTags(openTags);
  const openingTags = () => openTags.map((tag) => `<${tag}>`).join("");

  for (const token of tokens) {
    const closingMatch = token.match(/^<\/([a-z][\w-]*)\s*>$/i);
    const openingMatch = token.match(/^<([a-z][\w-]*)(?:\s[^>]*)?>$/i);
    const nextOpenTags = [...openTags];
    if (closingMatch) {
      if (nextOpenTags.at(-1) === closingMatch[1].toLowerCase()) nextOpenTags.pop();
    } else if (openingMatch && !token.endsWith("/>")) {
      nextOpenTags.push(openingMatch[1].toLowerCase());
    }

    if (chunk && chunk.length + token.length + serializeClosingTags(nextOpenTags).length > maxLength) {
      chunks.push(chunk + closingTags());
      chunk = openingTags();
    }

    if (chunk.length + token.length + serializeClosingTags(nextOpenTags).length > maxLength) {
      throw new Error("HTML token exceeds configured Telegram message limit");
    }

    chunk += token;
    openTags.splice(0, openTags.length, ...nextOpenTags);
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}
