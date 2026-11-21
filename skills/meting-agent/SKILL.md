---
name: meting-agent
description: Search NetEase, QQ Music, KuGou or Kuwo for tracks and look up albums, artists, playlists, lyrics, cover art and playback URLs.
---

# Meting Agent

Run the bundled CLI from the directory containing this file with Node.js 22.16 or later. Results are JSON. Choose the requested platform (`netease`, `tencent`, `kugou`, or `kuwo`) and keep it for subsequent lookups.

```sh
node scripts/meting-cli.mjs search --platform netease --keyword "我怀念的" --limit 3
```

Use `platforms` to list providers. For `search`, pass `--keyword` and optionally `--limit` or `--page`. NetEase accepts `--type` values 1 (songs, the default), 10 (albums), 100 (artists), 1000 (playlists), and 1006 (songs by lyric). For an album, artist, or playlist match, pass its `id` to the command named by its `type`.

For `song`, `album`, `artist`, and `playlist`, pass `--platform` and the corresponding `--id`. The `artist` command also accepts `--limit`.

From a song result, use `url_id` for `url`, `lyric_id` for `lyric`, and `pic_id` for `pic`. Pass that value as `--id`. Set `--br` for the requested bitrate or `--size` for cover width. For Tencent covers, use 300, 500, 800 or 1200 pixels.

Cookies are optional. The CLI checks `METING_<PLATFORM>_COOKIE` (uppercase platform code) first, then `METING_COOKIE`, then `--cookie`.
