import { platforms } from "./client.js";

const common = {
  platform: { required: true, choices: platforms.map(({ code }) => code) },
  cookie: { description: "Fallback after METING_<PLATFORM>_COOKIE and METING_COOKIE." },
};
const byId = { ...common, id: { required: true } };

export const operations = {
  platforms: { description: "List supported music platforms.", parameters: {} },
  search: {
    description: "Search a music catalog by keyword.",
    parameters: {
      ...common,
      keyword: { required: true },
      page: { integer: true },
      limit: { integer: true, max: 100 },
      type: {
        integer: true,
        description:
          "NetEase search type: 1 for songs (default), 10 for albums, 100 for artists, 1000 for playlists, 1006 for songs by lyric.",
      },
    },
  },
  song: { description: "Look up a song by ID.", parameters: byId },
  album: { description: "List songs on an album.", parameters: byId },
  artist: {
    description: "List songs by an artist.",
    parameters: { ...byId, limit: { integer: true, max: 200 } },
  },
  playlist: { description: "List songs in a playlist.", parameters: byId },
  url: {
    description: "Get a playback URL using the song's url_id.",
    parameters: { ...byId, br: { integer: true, description: "Bitrate in kbps." } },
  },
  lyric: { description: "Get song lyrics using lyric_id.", parameters: byId },
  pic: {
    description: "Get a cover URL using pic_id. Tencent sizes: 300, 500, 800 or 1200.",
    parameters: { ...byId, size: { integer: true, description: "Square cover width in pixels." } },
  },
};
