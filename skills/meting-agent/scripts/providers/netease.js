import { createCipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { Provider, Songs, Track, unavailable } from "./common.js";

const catalogTypes = new Map([
  [10, "album"],
  [100, "artist"],
  [1000, "playlist"],
]);

function Format(song) {
  const album = song.al ?? {};
  const picId = album.picUrl?.match(/\/(\d+)\./)?.[1] || album.pic_str || album.pic;
  return Track(
    "netease",
    song.id,
    song.name,
    (song.ar ?? []).map((artist) => artist.name),
    album.name,
    picId,
  );
}

export default class Netease extends Provider {
  static title = "NetEase Cloud Music";

  constructor(cookie) {
    const device = randomBytes(16).toString("hex").toUpperCase();
    const request = `${Date.now()}_${String(randomInt(1000)).padStart(4, "0")}`;
    super(
      {
        Referer: "music.163.com",
        Cookie: `osver=android; appver=8.7.01; os=android; deviceId=${device}; channel=netease; requestId=${request}; __remember_me=true;`,
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 11; M2007J3SC Build/RKQ1.200826.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 MQQBrowser/6.2 TBS/045714 Mobile Safari/537.36 NeteaseMusic/8.7.01",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cookie,
    );
  }

  async Eapi(route, body) {
    const path = `/api/${route}`;
    const text = JSON.stringify(body);
    const digest = createHash("md5").update(`nobody${path}use${text}md5forencrypt`).digest("hex");
    const payload = [path, text, digest].join("-36cd479b6b5-");
    const cipher = createCipheriv("aes-128-ecb", "e82ckenh8dichen8", null);
    const params = (cipher.update(payload, "utf8", "hex") + cipher.final("hex")).toUpperCase();
    const result = await this.Request(`https://music.163.com/eapi/${route}`, { body: { params } });
    if (result?.code !== 200) {
      const message = result?.message || result?.msg;
      throw new Error(
        `NetEase returned code ${result?.code ?? "(missing)"}${message ? ": " + message : ""}`,
      );
    }
    return result;
  }

  async Search({ keyword, type = 1, limit = 30, page = 1 }) {
    const catalogType = catalogTypes.get(type);
    if (!catalogType && type !== 1 && type !== 1006) {
      throw new Error(`Unsupported NetEase search type: ${type}`);
    }
    const result = await this.Eapi("cloudsearch/pc", {
      s: keyword,
      type,
      limit,
      total: "true",
      offset: (page - 1) * limit,
    });
    if (catalogType) {
      const matches = result.result?.[catalogType + "s"] ?? [];
      return matches.map(({ id, name }) => ({
        id: String(id),
        name,
        type: catalogType,
        source: "netease",
      }));
    }
    return Songs(result.result?.songs, Format);
  }

  async Song({ id }) {
    if (!/^\d+$/.test(id)) {
      throw new Error("NetEase song IDs must be numeric");
    }
    const result = await this.Eapi("v3/song/detail/", { c: `[{"id":${id},"v":0}]` });
    return Songs(result.songs, Format);
  }

  async Album({ id }) {
    const result = await this.Eapi(`v1/album/${encodeURIComponent(id)}`, {
      total: "true",
      offset: "0",
      id,
      limit: "1000",
      ext: "true",
      private_cloud: "true",
    });
    return Songs(result.songs, Format);
  }

  async Artist({ id, limit = 50 }) {
    const result = await this.Eapi(`v1/artist/${encodeURIComponent(id)}`, {
      ext: "true",
      private_cloud: "true",
      top: limit,
      id,
    });
    return Songs(result.hotSongs, Format);
  }

  async Playlist({ id }) {
    const result = await this.Eapi("v6/playlist/detail", { s: "0", id, n: "1000", t: "0" });
    return Songs(result.playlist?.tracks, Format);
  }

  async Url({ id, br = 320 }) {
    const result = await this.Eapi("song/enhance/player/url", { ids: [id], br: br * 1000 });
    const file = result.data?.[0];
    const url = file?.uf?.url || file?.url;
    return url ? { url, size: file.size, br: file.br / 1000 } : unavailable;
  }

  async Lyric({ id }) {
    const result = await this.Eapi("song/lyric", { id, os: "linux", lv: -1, kv: -1, tv: -1 });
    return { lyric: result.lrc?.lyric || "", tlyric: result.tlyric?.lyric || "" };
  }

  Pic({ id, size = 300 }) {
    const salt = Buffer.from("3go8&$8*3*3h0k(2)2");
    const bytes = Buffer.from(String(id), "latin1");
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] ^= salt[index % salt.length];
    }
    const key = createHash("md5")
      .update(bytes)
      .digest("base64")
      .replaceAll("/", "_")
      .replaceAll("+", "-");
    return {
      url: `https://p3.music.126.net/${key}/${encodeURIComponent(id)}.jpg?param=${size}y${size}`,
    };
  }
}
