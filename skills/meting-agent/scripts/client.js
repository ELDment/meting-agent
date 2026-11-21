import Kugou from "./providers/kugou.js";
import Kuwo from "./providers/kuwo.js";
import Netease from "./providers/netease.js";
import Tencent from "./providers/tencent.js";

const providers = { netease: Netease, tencent: Tencent, kugou: Kugou, kuwo: Kuwo };
export const platforms = Object.entries(providers).map(([code, provider]) => ({
  code,
  name: provider.title,
}));

export function ResolveCookie(platform, inputCookie) {
  return (
    process.env[`METING_${platform.toUpperCase()}_COOKIE`]?.trim() ||
    process.env.METING_COOKIE?.trim() ||
    inputCookie?.trim() ||
    undefined
  );
}

const methods = {
  search: "Search",
  song: "Song",
  album: "Album",
  artist: "Artist",
  playlist: "Playlist",
  url: "Url",
  lyric: "Lyric",
  pic: "Pic",
};

export async function Lookup(operation, input) {
  if (!Object.hasOwn(providers, input.platform)) {
    throw new Error(`Unsupported platform: ${input.platform}`);
  }
  if (!Object.hasOwn(methods, operation)) {
    throw new Error(`Unsupported operation: ${operation}`);
  }
  const Provider = providers[input.platform];
  const provider = new Provider(ResolveCookie(input.platform, input.cookie));
  return provider[methods[operation]](input);
}
