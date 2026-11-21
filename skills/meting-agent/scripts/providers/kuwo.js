import { Provider, Songs, Track } from "./common.js";

const web = "https://www.kuwo.cn";
const mobile = "https://m.kuwo.cn";
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36";

function Format(data) {
  const song = data.songinfo || data;
  const rawId =
    song.rid ||
    song.musicrid ||
    song.musicrId ||
    song.DC_TARGETID ||
    song.MUSICRID ||
    song.id ||
    "";
  const id = typeof rawId === "string" ? rawId.replace(/^MUSIC_/, "") : rawId;
  let name = song.name || song.songName || song.SONGNAME || song.NAME || "";
  let artist = song.artist || song.ARTIST || song.FARTIST || "";
  const firstLine = data.lrclist?.[0]?.lineLyric ?? "";
  const separator = firstLine.lastIndexOf("-");
  if (separator > 0) {
    name ||= firstLine.slice(0, separator).trim();
    artist ||= firstLine.slice(separator + 1).trim();
  }
  return Track(
    "kuwo",
    id,
    name,
    artist ? artist.split("&") : [],
    song.album || song.albumName || song.ALBUM || "",
    id,
  );
}

export default class Kuwo extends Provider {
  static title = "Kuwo Music";

  constructor(cookie) {
    super(
      {
        Cookie:
          "Hm_lvt_cdb524f42f0ce19b169a8071123a4797=1623339177,1623339183; _ga=GA1.2.1195980605.1579367081; Hm_lpvt_cdb524f42f0ce19b169a8071123a4797=1623339982; kw_token=3E7JFQ7MRPL; _gid=GA1.2.747985028.1623339179; _gat=1",
        csrf: "3E7JFQ7MRPL",
        Referer: `${web}/`,
        "User-Agent": userAgent,
      },
      cookie,
    );
  }

  async Search({ keyword, limit = 30, page = 1 }) {
    const result = await this.Request(`${web}/search/searchMusicBykeyWord`, {
      query: {
        vipver: 1,
        client: "kt",
        ft: "music",
        cluster: 0,
        strategy: 2012,
        encoding: "utf8",
        rformat: "json",
        mobi: 1,
        issubtitle: 1,
        show_copyright_off: 1,
        pn: page - 1,
        rn: limit,
        all: keyword,
      },
    });
    return Songs(result.abslist, Format);
  }

  async Album({ id }) {
    const result = await this.Request(`${web}/api/www/album/albumInfo`, {
      query: { albumId: id, pn: 1, rn: 1000, httpsStatus: 1 },
    });
    return Songs(result.data?.musicList, Format);
  }

  async Artist({ id, limit = 50 }) {
    const result = await this.Request(`${web}/api/www/artist/artistMusic`, {
      query: { artistid: id, pn: 1, rn: limit, httpsStatus: 1 },
    });
    return Songs(result.data?.list, Format);
  }

  async Playlist({ id }) {
    const result = await this.Request(`${web}/api/www/playlist/playListInfo`, {
      query: { pid: id, pn: 1, rn: 1000, httpsStatus: 1 },
    });
    return Songs(result.data?.musicList, Format);
  }

  async SongInfo(id, isComplete) {
    // Mobile responses can split artwork, metadata and lyrics across variants.
    const variants = [{ httpsStatus: 1 }, { from: "web" }, {}];
    let info;
    for (let attempt = 0; attempt < variants.length * 3; attempt++) {
      let result;
      try {
        result = await this.Request(`${mobile}/newh5/singles/songinfoandlrc`, {
          headers: { Cookie: "", Referer: `${mobile}/` },
          query: { musicId: id, ...variants[attempt % variants.length] },
          attempts: 1,
        });
      } catch (error) {
        // Additional rounds fill gaps in a successful response.
        if (!info && attempt + 1 >= variants.length) {
          throw error;
        }
        continue;
      }
      info ??= { songinfo: {}, lrclist: [] };
      const data = result?.data ?? result ?? {};
      for (const [key, value] of Object.entries(data.songinfo ?? data)) {
        if (key !== "lrclist" && value !== null && value !== undefined && value !== "") {
          info.songinfo[key] = value;
        }
      }
      if (data.lrclist?.length) {
        info.lrclist = data.lrclist;
      }
      if (isComplete(info)) {
        break;
      }
    }
    return info;
  }

  async Song({ id }) {
    const info = await this.SongInfo(id, (data) => Boolean(data.songinfo.id));
    return Songs(info, Format);
  }

  async Pic({ id }) {
    const { songinfo } = await this.SongInfo(id, (data) =>
      Boolean(data.songinfo.pic || data.songinfo.albumpic),
    );
    return { url: songinfo.pic || songinfo.albumpic || "" };
  }

  async Url({ id, br = 320 }) {
    const rid = String(id).startsWith("MUSIC_") ? id : `MUSIC_${id}`;
    const result = await this.Request("https://antiserver.kuwo.cn/anti.s", {
      query: { type: "convert_url3", rid, format: "mp3", response: "url" },
    });
    if (result.code === 200 && result.url) {
      return { url: result.url, br };
    }
    if (result.code === 200 && result.data?.url) {
      return { url: result.data.url, br: 128 };
    }
    return { url: "", br: -1 };
  }

  async Lyric({ id }) {
    const { lrclist } = await this.SongInfo(id, (data) => data.lrclist.length > 0);
    const lyric = lrclist
      .map(({ time, lineLyric }) => {
        const ticks = Math.round(Number(time) * 100);
        const minutes = String(Math.floor(ticks / 6000)).padStart(2, "0");
        const seconds = String(Math.floor(ticks / 100) % 60).padStart(2, "0");
        const fraction = String(ticks % 100).padStart(2, "0");
        return `[${minutes}:${seconds}.${fraction}]${lineLyric}\n`;
      })
      .join("");
    return { lyric, tlyric: "" };
  }
}
