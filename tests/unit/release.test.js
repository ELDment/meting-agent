import assert from "node:assert/strict";
import test from "node:test";
import semver from "semver";
import { GetReleaseVersion, GetReleaseChannel } from "../../scripts/ci/release.js";

const now = new Date("2026-01-01T16:00:00Z");

test("main allocates the next stable revision for the date in Shanghai", () => {
  const versions = ["2026.1.1-post.12", "2026.1.2-dev.41", "2026.1.2-post.3.dev.42"];
  const main = "refs/heads/main";
  assert.equal(GetReleaseVersion(now, versions, main), "2026.1.2");
  assert.equal(GetReleaseVersion(new Date(now - 1), versions, main), "2026.1.1-post.13");
  versions.push("2026.1.2");
  assert.equal(GetReleaseVersion(now, versions, main), "2026.1.2-post.1");
  versions.push("2026.1.2-post.9", "2026.1.2-post.2");
  assert.equal(GetReleaseVersion(now, versions, main), "2026.1.2-post.10");
});

test("development branches append the workflow run number to the next main version", () => {
  for (const ref of ["refs/heads/feat/a/b", "refs/heads/fix/c", "refs/heads/refactor/v2-rewrite"]) {
    const first = GetReleaseVersion(now, [], ref, "42");
    const revision = GetReleaseVersion(now, ["2026.1.2-post.3"], ref, "43");
    assert.equal(first, "2026.1.2-dev.42");
    assert.equal(revision, "2026.1.2-post.4.dev.43");
    assert.equal(semver.valid(first), first);
    assert.equal(semver.valid(revision), revision);
  }
  for (const ref of ["refs/heads/topic", "refs/tags/2026.1.2", "refs/pull/1/merge"]) {
    assert.throws(() => GetReleaseVersion(now, [], ref, "42"), /Invalid development release/);
  }
  assert.throws(() => GetReleaseVersion(now, [], "refs/heads/feat/a", "0"), /run number/);
});

test("post revisions advance latest while dev builds advance prerelease", () => {
  const latest = "2026.1.2-post.9";
  const prerelease = "2026.1.2-post.10.dev.42";
  assert.equal(GetReleaseChannel("2026.1.2-post.1", { latest: "2026.1.2" }), "latest");
  assert.equal(GetReleaseChannel("2026.1.2-post.10", { latest }), "latest");
  assert.equal(GetReleaseChannel("2026.1.2", { latest }), "backfill");
  assert.equal(GetReleaseChannel("2026.1.2-post.2", { latest }), "backfill");
  assert.equal(GetReleaseChannel("2026.1.3", { latest }), "latest");
  assert.equal(GetReleaseChannel("2026.1.2-post.10.dev.43", { prerelease }), "prerelease");
  assert.equal(GetReleaseChannel("2026.1.2-dev.41", { prerelease }), "prerelease-backfill");
});

test("publishing out of order preserves the newest stable and prerelease tags", () => {
  const tags = { latest: "2.0.0", prerelease: "2.1.0-rc.10" };
  assert.equal(GetReleaseChannel("2.1.0-rc.2", tags), "prerelease-backfill");
  assert.equal(GetReleaseChannel("2.1.0-beta.20", tags), "prerelease-backfill");
  assert.equal(GetReleaseChannel("2.1.0-rc.11", tags), "prerelease");
  assert.equal(GetReleaseChannel("2.2.0-alpha.1", tags), "prerelease");
  assert.equal(GetReleaseChannel("1.9.0", tags), "backfill");
  assert.equal(GetReleaseChannel("2.0.1", tags), "latest");
  assert.equal(GetReleaseChannel("1.0.0"), "latest");
  assert.equal(GetReleaseChannel("1.0.0-rc.1"), "prerelease");
});
