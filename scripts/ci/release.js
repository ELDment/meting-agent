import { pathToFileURL } from "node:url";
import semver from "semver";
import manifest from "../../package.json" with { type: "json" };

const stablePattern = /^(\d+\.\d+\.\d+)(?:-post\.(\d+))?$/;

export function GetReleaseVersion(now, versions, ref, runNumber) {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  const base = `${parts.year}.${parts.month}.${parts.day}`;
  let revision = 0;
  for (const version of versions) {
    const match = stablePattern.exec(version);
    if (match?.[1] === base) {
      revision = Math.max(revision, Number(match[2] ?? 0) + 1);
    }
  }
  const version = revision ? `${base}-post.${revision}` : base;
  if (ref === "refs/heads/main") {
    return version;
  }
  if (!/^refs\/heads\/(feat|fix|refactor)\/.+/.test(ref) || !/^[1-9]\d*$/.test(runNumber)) {
    throw new Error(`Invalid development release ref or run number: ${ref}, ${runNumber}`);
  }
  return `${version}${revision ? "." : "-"}dev.${runNumber}`;
}

async function ReadRegistryMetadata() {
  const url = `https://registry.npmjs.org/${manifest.name}?write=true`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) {
    return { versions: {}, "dist-tags": {} };
  }
  if (!response.ok) {
    throw new Error(`npm metadata lookup failed with HTTP ${response.status}`);
  }
  return response.json();
}

export function GetReleaseChannel(version, tags = {}) {
  const stable = stablePattern.exec(version);
  const channel = stable ? "latest" : "prerelease";
  const current = tags[channel];
  if (current) {
    // SemVer orders the bare date above -post.N; main publishes revisions in numeric order.
    const previous = stablePattern.exec(current);
    const older =
      stable && previous && stable[1] === previous[1]
        ? Number(stable[2] ?? 0) < Number(previous[2] ?? 0)
        : semver.lt(version, current);
    if (older) {
      return stable ? "backfill" : "prerelease-backfill";
    }
  }
  return channel;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, version] = process.argv.slice(2);
  const metadata = await ReadRegistryMetadata();
  if (command === "prepare") {
    console.log(
      GetReleaseVersion(
        new Date(),
        Object.keys(metadata.versions),
        process.env.GITHUB_REF,
        process.env.GITHUB_RUN_NUMBER,
      ),
    );
  } else if (command === "publish-info") {
    const published = metadata.versions[version];
    if (published && !published.dist?.integrity) {
      throw new Error(`Missing npm integrity for ${version}`);
    }
    console.log(
      JSON.stringify({
        channel: GetReleaseChannel(version, metadata["dist-tags"]),
        integrity: published?.dist.integrity ?? "",
      }),
    );
  } else {
    throw new Error(`Unknown release command: ${command}`);
  }
}
