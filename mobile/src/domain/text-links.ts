export interface TextLinkSegment {
  text: string;
  url?: string;
}

/** Preserve the original message; only recognized web addresses gain a destination. */
export function textLinkSegments(text: string): TextLinkSegment[] {
  const pattern =
    /(?:https?:\/\/|www\.|(?:m\.|music\.)?youtube\.com\/|youtu\.be\/)[^\s<>"“”‘’]+/giu;
  const segments: TextLinkSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > 0 && /[\p{L}\p{N}_@/.]/u.test(text[start - 1]!)) continue;
    let label = match[0].replace(/[.,!?;:…。，！？、；：']+$/u, '');
    for (;;) {
      const last = label.at(-1);
      const opening = last === ')' ? '(' : last === ']' ? '[' : last === '}' ? '{' : null;
      if (!opening || label.split(last!).length <= label.split(opening).length) break;
      label = label.slice(0, -1).replace(/[.,!?;:…。，！？、；：']+$/u, '');
    }
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(label) ? label : `https://${label}`);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        !url.hostname.includes('.') ||
        url.username ||
        url.password
      )
        continue;
    } catch {
      continue;
    }
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: label, url: url.href });
    cursor = start + label.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments.length ? segments : [{ text }];
}
