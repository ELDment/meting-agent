import assert from "node:assert/strict";
import test from "node:test";
import { Lookup, ResolveCookie } from "../../skills/meting-agent/scripts/client.js";

function MockResponses(context, ...responses) {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (input, init) => {
    const response = responses[requests.length];
    requests.push(new Request(input, init));
    assert.ok(response, "Unexpected upstream request");
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  return requests;
}

test("platform cookie wins, followed by shared cookie and explicit input", () => {
  const previous = process.env;
  try {
    process.env = { ...previous, METING_NETEASE_COOKIE: "platform", METING_COOKIE: "shared" };
    assert.equal(ResolveCookie("netease", "input"), "platform");
    process.env.METING_NETEASE_COOKIE = " ";
    assert.equal(ResolveCookie("netease", "input"), "shared");
    delete process.env.METING_COOKIE;
    assert.equal(ResolveCookie("netease", "input"), "input");
    assert.equal(ResolveCookie("netease", "   "), undefined);
  } finally {
    process.env = previous;
  }
});

test("NetEase detail submits a form and preserves cover IDs larger than a safe integer", async (context) => {
  const coverId = "90071992547409931";
  const requests = MockResponses(
    context,
    Response.json({
      code: 200,
      songs: [
        {
          id: 7,
          name: "Track",
          ar: [{ name: "A" }, { name: "B" }],
          al: { name: "Record", picUrl: `https://images.invalid/${coverId}.jpg` },
        },
      ],
    }),
  );
  assert.deepEqual(await Lookup("song", { platform: "netease", id: "7" }), [
    {
      id: 7,
      name: "Track",
      artist: ["A", "B"],
      album: "Record",
      pic_id: coverId,
      url_id: 7,
      lyric_id: 7,
      source: "netease",
    },
  ]);
  assert.equal(requests[0].method, "POST");
  assert.ok((await requests[0].formData()).get("params"));
});

test("NetEase search returns IDs for the requested catalog and keeps song results playable", async (context) => {
  const matches = [
    [10, "albums", "album"],
    [100, "artists", "artist"],
    [1000, "playlists", "playlist"],
  ];
  const songResult = { code: 200, result: { songs: [{ id: 2, name: "Track" }] } };
  MockResponses(
    context,
    ...matches.map(([, key]) =>
      Response.json({ code: 200, result: { [key]: [{ id: 7, name: "Match" }] } }),
    ),
    Response.json(songResult),
    Response.json(songResult),
    Response.json({ code: 200, result: { albumCount: 0 } }),
  );
  const search = { platform: "netease", keyword: "Match" };
  for (const [type, , catalogType] of matches) {
    assert.deepEqual(await Lookup("search", { ...search, type }), [
      { id: "7", name: "Match", type: catalogType, source: "netease" },
    ]);
  }
  for (const type of [undefined, 1006]) {
    const [track] = await Lookup("search", { ...search, type });
    assert.equal(track.url_id, 2);
  }
  assert.deepEqual(await Lookup("search", { ...search, type: 10 }), []);
  await assert.rejects(
    Lookup("search", { ...search, type: 999 }),
    /Unsupported NetEase search type/,
  );
});

test("NetEase distinguishes upstream errors from a successful empty playlist", async (context) => {
  MockResponses(
    context,
    Response.json({ code: 404, message: "Playlist does not exist" }),
    Response.json({ code: 403, msg: "Access denied" }),
    Response.json({ code: 200, playlist: { tracks: [] } }),
  );
  const input = { platform: "netease", id: "7" };
  await assert.rejects(Lookup("playlist", input), /404: Playlist does not exist/);
  await assert.rejects(Lookup("playlist", input), /403: Access denied/);
  assert.deepEqual(await Lookup("playlist", input), []);
});

test("Tencent search uses default pagination and encodes the keyword", async (context) => {
  const requests = MockResponses(context, Response.json({ data: { song: { list: [] } } }));
  const keyword = "A & B+";
  assert.deepEqual(await Lookup("search", { platform: "tencent", keyword }), []);
  const { searchParams } = new URL(requests[0].url);
  assert.equal(searchParams.get("w"), keyword);
  assert.equal(searchParams.get("p"), "1");
  assert.equal(searchParams.get("n"), "30");
});

test("Tencent search paginates the v1.6.2 endpoint and normalizes both track formats", async (context) => {
  const list = [
    { songmid: "old", songname: "A", albumname: " Album A ", albummid: "cover-a" },
    {
      musicData: {
        mid: "new",
        name: "B",
        album: { title: " Album B ", mid: "cover-b" },
        singer: [{ name: "Artist" }],
      },
    },
    { songmid: "single", songname: "C" },
  ];
  const requests = MockResponses(context, Response.json({ data: { song: { list } } }));
  const songs = await Lookup("search", {
    platform: "tencent",
    keyword: "track",
    page: 2,
    limit: 3,
  });
  const url = new URL(requests[0].url);
  assert.equal(url.origin + url.pathname, "https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    format: "json",
    p: "2",
    n: "3",
    w: "track",
  });
  assert.deepEqual(
    songs.map(({ id, name, artist, album, pic_id: cover, url_id: playback, lyric_id: lyric }) => [
      id,
      name,
      artist,
      album,
      cover,
      playback,
      lyric,
    ]),
    [
      ["old", "A", [], "Album A", "cover-a", "old", "old"],
      ["new", "B", ["Artist"], "Album B", "cover-b", "new", "new"],
      ["single", "C", [], "", undefined, "single", "single"],
    ],
  );
});

test("Tencent chooses the highest playable bitrate within the requested limit", async (context) => {
  const file = { media_mid: "media", size_320mp3: 3200, size_192aac: 1920, size_128mp3: 1280 };
  const midurlinfo = [
    {},
    { vkey: "fixture", purl: "320.mp3" },
    { vkey: "", purl: "192.m4a" },
    { vkey: "fixture", purl: "128.mp3" },
  ];
  MockResponses(
    context,
    Response.json({ data: [{ mid: "song", type: 0, file }] }),
    Response.json({ req_0: { data: { sip: ["https://audio.invalid/"], midurlinfo } } }),
  );
  assert.deepEqual(await Lookup("url", { platform: "tencent", id: "song", br: 192 }), {
    url: "https://audio.invalid/128.mp3",
    size: 1280,
    br: 128,
  });
});

test("KuGou omits cookies from its public HTTP catalog", async (context) => {
  const track = { hash: "song-hash", encode_album_audio_id: "album-id", songName: "Track" };
  const requests = MockResponses(context, Response.json({ data: { info: [track] } }));
  const [song] = await Lookup("search", {
    platform: "kugou",
    keyword: "track",
    cookie: "session=fixture",
  });
  assert.equal(song.url_id, track.hash);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).protocol, "http:");
  assert.equal(requests[0].headers.has("cookie"), false);
});

test("KuGou follows the selected lyric candidate and decodes its UTF-8 content", async (context) => {
  const lyric = "[00:01.00]合唱";
  const requests = MockResponses(
    context,
    Response.json({ candidates: [{ id: "42", accesskey: "fixture" }] }),
    Response.json({ content: Buffer.from(lyric).toString("base64") }),
  );
  assert.deepEqual(await Lookup("lyric", { platform: "kugou", id: "song" }), {
    lyric,
    tlyric: "",
  });
  assert.equal(new URL(requests[0].url).searchParams.get("hash"), "song");
  assert.equal(new URL(requests[1].url).searchParams.get("id"), "42");
  assert.equal(new URL(requests[1].url).searchParams.get("accesskey"), "fixture");
});

test("Kuwo normalizes search IDs and maps page numbers to its zero-based index", async (context) => {
  const requests = MockResponses(
    context,
    Response.json({
      abslist: [{ MUSICRID: "MUSIC_42", SONGNAME: "Track", ARTIST: "A&B", ALBUM: "Record" }],
    }),
  );
  const data = await Lookup("search", { platform: "kuwo", keyword: "Track", page: 3, limit: 12 });
  assert.deepEqual(data, [
    {
      id: "42",
      name: "Track",
      artist: ["A", "B"],
      album: "Record",
      pic_id: "42",
      url_id: "42",
      lyric_id: "42",
      source: "kuwo",
    },
  ]);
  const { searchParams } = new URL(requests[0].url);
  assert.equal(searchParams.get("pn"), "2");
  assert.equal(searchParams.get("rn"), "12");
});

test("Kuwo keeps partial metadata and lyrics across failed mobile variants", async (context) => {
  const requests = MockResponses(
    context,
    Response.json({
      songinfo: { songName: "Track" },
      lrclist: [{ lineLyric: "Title - A&B" }],
    }),
    new Response(null, { status: 503 }),
    new Response("not JSON"),
    Response.json({
      data: { songinfo: { id: "42", songName: "", albumName: "Record" }, lrclist: [] },
    }),
  );
  const [song] = await Lookup("song", { platform: "kuwo", id: "42" });
  assert.equal(song.id, "42");
  assert.equal(song.name, "Track");
  assert.equal(song.album, "Record");
  assert.deepEqual(song.artist, ["A", "B"]);
  assert.equal(requests.length, 4);
});

test("Kuwo reports the upstream error when all mobile variants fail", async (context) => {
  const requests = MockResponses(
    context,
    new TypeError("Connection reset"),
    new Response("not JSON"),
    new Response(null, { status: 502 }),
  );
  await assert.rejects(Lookup("pic", { platform: "kuwo", id: "42" }), /HTTP 502/);
  assert.deepEqual(
    requests.map((request) => Object.fromEntries(new URL(request.url).searchParams)),
    [{ musicId: "42", httpsStatus: "1" }, { musicId: "42", from: "web" }, { musicId: "42" }],
  );
});

test("an upstream HTTP error rejects the lookup", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("", { status: 403 }));
  await assert.rejects(Lookup("search", { platform: "tencent", keyword: "fixture" }), /403/);
});
