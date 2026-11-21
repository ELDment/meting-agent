import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";

await mkdir("dist", { recursive: true });
const report = JSON.parse(
  execSync("npm pack --json --ignore-scripts --pack-destination dist", { encoding: "utf8" }),
);
const [pack] = Object.values(report);

const skill = "skills/meting-agent";
const files = [
  `${skill}/SKILL.md`,
  `${skill}/LICENSE`,
  `${skill}/agents/openai.yaml`,
  ...pack.files.map((file) => file.path).filter((path) => path.startsWith(`${skill}/scripts/`)),
];
const entries = {};
for (const path of files.sort()) {
  entries[path.slice("skills/".length)] = await readFile(path);
}

const archive = `meting-agent-skill-${pack.version}.zip`;
await writeFile(`dist/${archive}`, zipSync(entries, { mtime: new Date(2000, 0, 1) }));
console.log(`Built dist/${pack.filename} and dist/${archive}`);
