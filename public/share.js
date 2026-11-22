// Instagram may send a URL as its own field or include it in the shared text.
export function sharedInstagramUrl(params) {
  for (const field of ['url', 'text', 'title']) {
    const value = params.get(field) || '';
    for (const match of value.matchAll(/https:\/\/[^\s<>"'()\[\]{}「」]+/gi)) {
      let url;
      try { url = new URL(match[0].replace(/[.,!?;。…]+$/, '')); } catch { continue; }
      if (url.username || url.password || url.port) continue;
      if (!/^(?:(?:www|m)\.)?instagram\.com$/i.test(url.hostname)) continue;
      const post = url.pathname.match(/^\/((?:p|reel|reels|tv)\/[A-Za-z0-9_-]+|share\/(?:(?:p|reel)\/)?[A-Za-z0-9_-]+)\/?$/);
      if (post) return 'https://www.instagram.com/'+post[1]+'/';
    }
  }
  return null;
}
