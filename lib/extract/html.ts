// 아주 작은 HTML 메타 태그 파서 (외부 라이브러리 없이).

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** <meta property|name="key" content="..."> 값을 모은다 (속성 순서 무관) */
export function readMetaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const a of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? "";
    }
    const key = (attrs.property ?? attrs.name)?.toLowerCase();
    if (key && attrs.content !== undefined && !(key in out)) {
      out[key] = decodeEntities(attrs.content);
    }
  }
  return out;
}
