import { createHash } from "node:crypto";
import { Provider, Songs, Track, unavailable } from "./common.js";

const cdn = "http://mobilecdn.kugou.com/api/v3";

function Format(song) {
  const filename = song.filename || song.fileName;
  let name = song.songName || filename;
  let artist = [];
  if (Array.isArray(song.authors)) {
    artist = song.authors.map((author) => author.author_name);
  } else if (filename?.includes(" - ")) {
    const separator = filename.indexOf(" - ");
    artist = filename.slice(0, separator).split("、");
    name = filename.slice(separator + 3);
  }
  return Track("kugou", song.hash, name, artist, song.album_name || "", song.hash);
}

function ParseCookie(text = "") {
  const values = new Map();
  for (const field of text.split(";")) {
    const separator = field.indexOf("=");
    if (separator > 0) {
      values.set(field.slice(0, separator).trim(), field.slice(separator + 1).trim());
    }
  }
  return values;
}

function Md5(text) {
  return createHash("md5").update(text).digest("hex");
}

export default class Kugou extends Provider {
  static title = "KuGou Music";

  constructor(cookie) {
    super(
      { "User-Agent": "IPhone-8990-searchSong", "UNI-UserAgent": "iOS11.4-Phone8990-1009-0-WiFi" },
      cookie,
    );
  }

  async List(path, query) {
    const result = await this.Request(`${cdn}/${path}`, {
      query: { area_code: 1, version: 8990, ...query },
    });
    return Songs(result.data?.info, Format);
  }

  Search({ keyword, page = 1, limit = 30 }) {
    return this.List("search/song", {
      api_ver: 1,
      correct: 1,
      pagesize: limit,
      plat: 2,
      tag: 1,
      sver: 5,
      showtype: 10,
      page,
      keyword,
    });
  }

  Album({ id }) {
    return this.List("album/song", { albumid: id, plat: 2, page: 1, pagesize: -1 });
  }

  Artist({ id, limit = 50 }) {
    return this.List("singer/song", { singerid: id, page: 1, plat: 0, pagesize: limit });
  }

  Playlist({ id }) {
    return this.List("special/song", { specialid: id, plat: 2, page: 1, pagesize: -1 });
  }

  Single(id) {
    return this.Request("https://m.kugou.com/app/i/getSongInfo.php", {
      body: { cmd: "playInfo", hash: id, from: "mkugou" },
    });
  }

  async Song({ id }) {
    return Songs(await this.Single(id), Format);
  }

  async Pic({ id }) {
    const result = await this.Single(id);
    return { url: result.album_img?.replace("{size}", "400") || "" };
  }

  async Lyric({ id }) {
    const result = await this.Request("https://krcs.kugou.com/search", {
      query: { keyword: "%20-%20", ver: 1, hash: id, client: "mobi", man: "yes" },
    });
    const candidate = result.candidates?.[0];
    if (!candidate) {
      return { lyric: "", tlyric: "" };
    }
    const data = await this.Request("https://lyrics.kugou.com/download", {
      query: {
        charset: "utf8",
        accesskey: candidate.accesskey,
        id: candidate.id,
        client: "mobi",
        fmt: "lrc",
        ver: 1,
      },
    });
    return { lyric: Buffer.from(data.content ?? "", "base64").toString(), tlyric: "" };
  }

  SongInfo(cookie, identifier) {
    const mid = cookie.get("mid") || cookie.get("kg_mid") || "";
    const params = {
      srcappid: "2919",
      clientver: "20000",
      clienttime: String(Date.now()),
      mid,
      uuid: cookie.get("uuid") || mid,
      dfid: cookie.get("dfid") || cookie.get("kg_dfid") || "",
      appid: "1014",
      platid: "4",
      ...identifier,
      token: cookie.get("t"),
      userid: cookie.get("KugooID"),
    };
    const secret = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
    const fields = Object.entries(params)
      .map(([name, value]) => `${name}=${value}`)
      .join("&")
      .split("&")
      .sort()
      .join("");
    const signature = Md5(secret + fields + secret);
    return this.Request("https://wwwapi.kugou.com/play/songinfo", {
      query: { ...params, signature },
    });
  }

  async Url({ id, br = 320 }) {
    const cookie = ParseCookie(this.headers.Cookie);
    if (cookie.get("t") && cookie.get("KugooID")) {
      const song = await this.SongInfo(cookie, { hash: id });
      const audioId = song.data?.encode_album_audio_id;
      if (!audioId) {
        return unavailable;
      }
      const result = await this.SongInfo(cookie, { encode_album_audio_id: audioId });
      const file = result.data;
      return {
        url: file?.play_url || file?.play_backup_url || "",
        size: file?.filesize || 0,
        br: file?.bitrate || -1,
      };
    }

    const result = await this.Request("http://media.store.kugou.com/v1/get_res_privilege", {
      body: JSON.stringify({
        relate: 1,
        userid: "0",
        vip: 0,
        appid: 1000,
        token: "",
        behavior: "download",
        area_code: "1",
        clientver: "8990",
        resource: [{ id: 0, type: "audio", hash: id }],
      }),
    });
    let best = unavailable;
    for (const item of result.data?.[0]?.relate_goods ?? []) {
      const bitrate = Number(item.info?.bitrate);
      if (!(bitrate > Math.max(0, best.br) && bitrate <= br)) {
        continue;
      }
      const file = await this.Request("https://trackercdn.kugou.com/i/v2/", {
        query: {
          hash: item.hash,
          key: Md5(item.hash + "kgcloudv2"),
          pid: 3,
          behavior: "play",
          cmd: "25",
          version: 8990,
        },
      });
      const url = Array.isArray(file.url) ? file.url[0] : file.url;
      if (url) {
        best = { url, size: file.fileSize, br: file.bitRate / 1000 };
      }
    }
    return best;
  }
}
