import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import manifest from "../../package.json" with { type: "json" };

test(
  "MCP stdio initializes, lists tools and handles valid and invalid calls",
  { timeout: 15000 },
  async (context) => {
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      env: { METING_TENCENT_COOKIE: "session=fixture" },
      args: [
        "--import",
        new URL("../fixtures/upstream.js", import.meta.url).href,
        fileURLToPath(new URL("../../src/index.js", import.meta.url)),
      ],
    });
    context.after(() => client.close());
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, manifest.version);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "album",
      "artist",
      "lyric",
      "pic",
      "platforms",
      "playlist",
      "search",
      "song",
      "url",
    ]);
    const platforms = await client.callTool({ name: "platforms", arguments: {} });
    const catalog = JSON.parse(platforms.content[0].text);
    assert.equal(catalog.ok, true);
    assert.deepEqual(catalog.data.map((entry) => entry.code).sort(), [
      "kugou",
      "kuwo",
      "netease",
      "tencent",
    ]);

    const argumentsList = { platform: "tencent", id: "album" };
    const cover = await client.callTool({
      name: "pic",
      arguments: { ...argumentsList, cookie: "" },
    });
    assert.deepEqual(JSON.parse(cover.content[0].text), {
      ok: true,
      operation: "pic",
      platform: "tencent",
      data: { url: "https://y.gtimg.cn/music/photo_new/T002R300x300M000album.jpg?max_age=2592000" },
    });
    const invalid = await client.callTool({
      name: "pic",
      arguments: { ...argumentsList, size: 0 },
    });
    assert.equal(invalid.isError, true);
    const blankId = await client.callTool({
      name: "pic",
      arguments: { ...argumentsList, id: " " },
    });
    assert.equal(blankId.isError, true);

    const failed = await client.callTool({
      name: "search",
      arguments: { platform: "tencent", keyword: "fixture" },
    });
    assert.equal(failed.isError, true);
    const error = JSON.parse(failed.content[0].text);
    assert.equal(error.ok, false);
    assert.equal(error.operation, "search");
    assert.equal(error.platform, "tencent");
    assert.match(error.message, /503/);
  },
);
