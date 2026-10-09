import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gitConfigUrl, parseUrl, scanForRepos } from "../src/scan.js";

const URL =
	"rns://adafb3153efd4d96d532568a5208b3b5/reticulum/pi-rngit-work-document-skill";

test("gitConfigUrl finds an rns:// remote", () => {
	const dir = mkdtempSync(join(tmpdir(), "scan-"));
	mkdirSync(join(dir, ".git"));
	writeFileSync(
		join(dir, ".git", "config"),
		'[remote "origin"]\n\turl = rns://adafb3153efd4d96d532568a5208b3b5/reticulum/pi-rngit-work-document-skill\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
	);
	assert.equal(gitConfigUrl(dir), URL);
});

test("gitConfigUrl returns null without rns:// remote", () => {
	const dir = mkdtempSync(join(tmpdir(), "scan-"));
	mkdirSync(join(dir, ".git"));
	writeFileSync(
		join(dir, ".git", "config"),
		'[remote "origin"]\n\turl = https://github.com/bergie/whatever\n',
	);
	assert.equal(gitConfigUrl(dir), null);
});

test("gitConfigUrl returns null without .git", () => {
	const dir = mkdtempSync(join(tmpdir(), "scan-"));
	assert.equal(gitConfigUrl(dir), null);
});

test("parseUrl splits hash, group and repo", () => {
	const parsed = parseUrl(URL);
	assert.equal(parsed.hash, "adafb3153efd4d96d532568a5208b3b5");
	assert.equal(parsed.group, "reticulum");
	assert.equal(parsed.repo, "pi-rngit-work-document-skill");
	assert.equal(parsed.repoPath, "reticulum/pi-rngit-work-document-skill");
});

test("parseUrl rejects malformed URLs", () => {
	assert.throws(() => parseUrl("rns://tooshort"));
	assert.throws(() =>
		parseUrl("rns://adafb3153efd4d96d532568a5208b3b5/onlygroup"),
	);
});

test("scanForRepos finds cwd repo and direct child repos, deduped", () => {
	const root = mkdtempSync(join(tmpdir(), "scans-"));

	// Repo at the root itself.
	mkdirSync(join(root, ".git"));
	writeFileSync(
		join(root, ".git", "config"),
		`[remote "origin"]\n\turl = ${URL}\n`,
	);

	// Repo one level down.
	const child = join(root, "subrepo");
	mkdirSync(join(child, ".git"), { recursive: true });
	writeFileSync(
		join(child, ".git", "config"),
		'[remote "origin"]\n\turl = rns://9710b86ba12c42d1d8f30f74fe509286/bergie/subrepo\n',
	);

	// Grandchild — out of scan scope.
	const grandchild = join(child, "deeper");
	mkdirSync(join(grandchild, ".git"), { recursive: true });
	writeFileSync(
		join(grandchild, ".git", "config"),
		'[remote "origin"]\n\turl = rns://d31aeea49873006f13b3415520666a4e/bergie/deeper\n',
	);

	// Non-rngit repo and a plain directory.
	const plain = join(root, "plain");
	mkdirSync(join(plain, ".git"), { recursive: true });
	writeFileSync(
		join(plain, ".git", "config"),
		'[remote "origin"]\n\turl = git@example.com:a/b.git\n',
	);
	mkdirSync(join(root, "nodotgit"));

	const found = scanForRepos(root);
	const paths = found.map((r) => r.repoPath);

	assert.deepEqual(paths.sort(), [
		"bergie/subrepo",
		"reticulum/pi-rngit-work-document-skill",
	]);
	// Root repo dir should be reported as the start dir itself.
	const rootRepo = found.find((r) => r.repoPath.startsWith("reticulum/"));
	assert.equal(rootRepo.dir, root);
});

test("scanForRepos tolerates unreadable directories", () => {
	assert.doesNotThrow(() =>
		scanForRepos(join(tmpdir(), "definitely-missing-dir-xyz")),
	);
});
