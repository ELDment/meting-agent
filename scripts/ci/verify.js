import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { unzipSync } from "fflate";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const expectedProjectVersion = process.argv[2] ?? manifest.version;

async function CheckPackage(directory) {
  const cwd = join(directory, "consumer");
  await mkdir(cwd);
  const name = manifest.name.replace("@", "").replace("/", "-");
  await copyFile(`dist/${name}-${manifest.version}.tgz`, join(cwd, "package.tgz"));
  execSync(
    "npm install --prefix . --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline ./package.tgz",
    { cwd, stdio: "inherit", timeout: 180_000 },
  );
  const command =
    process.platform === "win32"
      ? "node_modules\\.bin\\meting-agent.cmd --version"
      : "./node_modules/.bin/meting-agent --version";
  assert.equal(execSync(command, { cwd, encoding: "utf8" }).trim(), expectedProjectVersion);

  const client = new Client({ name: "package-check", version: "1" });
  const entry = join(cwd, "node_modules", manifest.name, manifest.bin["meting-agent"]);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], cwd });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, expectedProjectVersion);
    const result = await client.callTool({ name: "platforms", arguments: {} });
    assert.equal(JSON.parse(result.content[0].text).ok, true);
  } finally {
    await client.close();
  }
}

async function CheckSkill(directory) {
  const zip = await readFile(`dist/meting-agent-skill-${manifest.version}.zip`);
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    assert.match(name, /^meting-agent\/(?:[\w.-]+\/)*[\w.-]+$/);
    assert.ok(!name.split("/").includes(".."));
    const path = join(directory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  const output = execFileSync(
    process.execPath,
    ["meting-agent/scripts/meting-cli.mjs", "platforms"],
    { cwd: directory, encoding: "utf8" },
  );
  assert.equal(JSON.parse(output).data.length, 4);
}

const directory = await mkdtemp(join(tmpdir(), "meting-package-"));
try {
  await CheckSkill(directory);
  await CheckPackage(directory);
  console.log(`Verified both distributions for ${manifest.version}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
