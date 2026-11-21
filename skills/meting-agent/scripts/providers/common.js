// Adapted from Meting (MIT), copyright 2019 METO Sheel <i@i-meto.com>.
export class Provider {
  constructor(headers, cookie) {
    this.headers = cookie ? { ...headers, Cookie: cookie } : headers;
  }

  async Request(address, { query, body, headers, text = false, attempts = 3 } = {}) {
    const url = new URL(address);
    if (query) {
      url.search = new URLSearchParams(query).toString();
    }
    const options = {
      method: body === undefined ? "GET" : "POST",
      headers: { ...this.headers, ...headers },
      body: typeof body === "object" ? new URLSearchParams(body) : body,
    };
    if (url.protocol === "http:") {
      delete options.headers.Cookie;
    }

    for (let attempt = 1; ; attempt++) {
      let response;
      let content;
      try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
        content = await response.text();
      } catch (cause) {
        if (attempt < attempts) {
          continue;
        }
        throw new Error(`Request to ${url.hostname} failed`, { cause });
      }
      if (!response.ok) {
        throw new Error(`${url.hostname} returned HTTP ${response.status}`);
      }
      return text ? content : ParseJson(content, url.hostname);
    }
  }
}

export function ParseJson(content, hostname) {
  try {
    return JSON.parse(content);
  } catch (cause) {
    throw new Error(`${hostname} returned invalid JSON`, { cause });
  }
}

export function Songs(records, format) {
  const items = Array.isArray(records) ? records : [records];
  return items
    .filter(Boolean)
    .map(format)
    .filter((song) => song.id !== undefined && song.id !== "");
}

export function Track(source, id, name, artist, album, picId) {
  return { id, name, artist, album, pic_id: picId, url_id: id, lyric_id: id, source };
}

export const unavailable = Object.freeze({ url: "", size: 0, br: -1 });
