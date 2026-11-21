import { randomInt } from "node:crypto";
import { ParseJson, Provider, Songs, Track, unavailable } from "./common.js";

const api = "https://c.y.qq.com";
const qualities = [
  ["size_flac", 999, "F000", "flac"],
  ["size_320mp3", 320, "M800", "mp3"],
  ["size_192aac", 192, "C600", "m4a"],
  ["size_128mp3", 128, "M500", "mp3"],
  ["size_96aac", 96, "C400", "m4a"],
  ["size_48aac", 48, "C200", "m4a"],
  ["size_24aac", 24, "C100", "m4a"],
];

function Format(entry) {
  const song = entry.musicData ?? entry;
  const album = song.album?.title === undefined ? song.albumname : song.album.title;
  return Track(
    "tencent",
    song.songmid || song.mid,
    song.songname || song.name,
    (song.singer ?? []).map((artist) => artist.name),
    String(album || "").trim(),
    song.album?.mid || song.albummid,
  );
}

const entities = { apos: "'", quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " " };
function DecodeLyric(value = "") {
  return Buffer.from(value, "base64")
    .toString()
    .replace(/&(apos|quot|amp|lt|gt|nbsp);/g, (match, name) => entities[name])
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, number) => {
      const point =
        number[0].toLowerCase() === "x" ? Number.parseInt(number.slice(1), 16) : Number(number);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    });
}

export default class Tencent extends Provider {
  static title = "Tencent Music";

  constructor(cookie) {
    super(
      {
        Referer: "http://y.qq.com",
        Cookie:
          "pgv_pvi=22038528; pgv_si=s3156287488; pgv_pvid=5535248600; yplayer_open=1; ts_last=y.qq.com/portal/player.html; ts_uid=4847550686; yq_index=0; qqmusic_fromtag=66; player_exist=1",
        "User-Agent": "QQ%E9%9F%B3%E4%B9%90/54409 CFNetwork/901.1 Darwin/17.6.0 (x86_64)",
        "Accept-Language": "zh-CN,zh;q=0.8,gl;q=0.6,zh-TW;q=0.4",
      },
      cookie,
    );
  }

  Single(id) {
    return this.Request(`${api}/v8/fcg-bin/fcg_play_single_song.fcg`, {
      query: { songmid: id, platform: "yqq", format: "json" },
    });
  }

  async Search({ keyword, page = 1, limit = 30 }) {
    const result = await this.Request(`${api}/soso/fcgi-bin/search_for_qq_cp`, {
      query: { format: "json", p: page, n: limit, w: keyword },
    });
    return Songs(result.data?.song?.list, Format);
  }

  async Song({ id }) {
    const result = await this.Single(id);
    return Songs(result.data, Format);
  }

  async Album({ id }) {
    const result = await this.Request(`${api}/v8/fcg-bin/fcg_v8_album_detail_cp.fcg`, {
      query: { albummid: id, platform: "mac", format: "json", newsong: 1 },
    });
    return Songs(result.data?.getSongInfo, Format);
  }

  async Artist({ id, limit = 50 }) {
    const result = await this.Request(`${api}/v8/fcg-bin/fcg_v8_singer_track_cp.fcg`, {
      query: { singermid: id, begin: 0, num: limit, order: "listen", platform: "mac", newsong: 1 },
    });
    return Songs(result.data?.list, Format);
  }

  async Playlist({ id }) {
    const result = await this.Request(`${api}/v8/fcg-bin/fcg_v8_playlist_cp.fcg`, {
      query: { id, format: "json", newsong: 1, platform: "jqspaframe.json" },
    });
    return Songs(result.data?.cdlist?.[0]?.songlist, Format);
  }

  async Url({ id, br = 320 }) {
    const details = await this.Single(id);
    const song = details.data?.[0];
    if (!song?.file) {
      return unavailable;
    }
    const param = {
      guid: String(randomInt(10_000_000_000)),
      songmid: qualities.map(() => song.mid),
      filename: qualities.map(([, , prefix, ext]) => `${prefix}${song.file.media_mid}.${ext}`),
      songtype: qualities.map(() => song.type),
      uin: this.headers.Cookie.match(/uin=(\d+)/)?.[1] ?? "0",
      loginflag: 1,
      platform: "20",
    };
    const response = await this.Request("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      query: {
        format: "json",
        platform: "yqq.json",
        needNewCode: 0,
        data: JSON.stringify({
          req_0: { module: "vkey.GetVkeyServer", method: "CgiGetVkey", param },
        }),
      },
    });
    const keys = response.req_0?.data;
    for (const [index, [sizeKey, bitrate]] of qualities.entries()) {
      const entry = keys?.midurlinfo?.[index];
      if (bitrate <= br && song.file[sizeKey] && entry?.vkey && entry.purl && keys.sip?.[0]) {
        return { url: keys.sip[0] + entry.purl, size: song.file[sizeKey], br: bitrate };
      }
    }
    return unavailable;
  }

  async Lyric({ id }) {
    const text = await this.Request(`${api}/lyric/fcgi-bin/fcg_query_lyric_new.fcg`, {
      query: { songmid: id, g_tk: "5381" },
      text: true,
    });
    const payload = text.trim().replace(/^[\w.]+\((.*)\);?$/s, "$1");
    const data = ParseJson(payload, "c.y.qq.com");
    return { lyric: DecodeLyric(data.lyric || ""), tlyric: DecodeLyric(data.trans || "") };
  }

  Pic({ id, size = 300 }) {
    return {
      url: `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${encodeURIComponent(id)}.jpg?max_age=2592000`,
    };
  }
}
