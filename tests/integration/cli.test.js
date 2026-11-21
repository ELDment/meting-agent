import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../skills/meting-agent/scripts/meting-cli.mjs", import.meta.url),
);

function RunCli(...args) {
  const upstream = new URL("../fixtures/upstream.js", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", upstream, script, ...args], {
    cwd: tmpdir(),
    encoding: "utf8",
    timeout: 10000,
  });
  assert.ifError(result.error);
  return result;
}

test("the skill CLI prints JSON when invoked from an unrelated directory", () => {
  const result = RunCli(
    "pic",
    "--platform",
    "tencent",
    "--id",
    "album",
    "--size",
    "500",
    "--cookie=",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: true,
    command: "pic",
    platform: "tencent",
    data: { url: "https://y.gtimg.cn/music/photo_new/T002R500x500M000album.jpg?max_age=2592000" },
  });
});

test("the skill CLI reports invalid arguments on stderr", () => {
  for (const [args, field] of [
    [["pic", "--platform", "tencent"], /\bid\b/i],
    [["pic", "--platform", "tencent", "--id", "album", "--size", "0"], /\bsize\b/i],
  ]) {
    const result = RunCli(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, field);
  }
});
