/**
 * Headless smoke check: boots the shared Reticulum stack, connects a work
 * client with the primary ~/.rngit identity to a repository given on the
 * command line (an rns:// URL), and lists work documents.
 *
 * Usage: node scripts/smoke-connect.js <dir-with-rngit-repo>
 */
import { scanForRepos } from "../src/scan.js";
import { loadPrimaryIdentity, identityHashHex } from "../src/identity.js";
import { createReticulum } from "../src/work-client.js";
import { cacheDirectory, rnsEndpoint } from "../src/config.js";
import { formatTimestamp } from "../src/markdown.js";

const dir = process.argv[2] ?? process.cwd();
const repos = scanForRepos(dir);
if (!repos.length) {
	console.error(`No rngit repositories found under ${dir}`);
	process.exit(1);
}
const repo = repos[0];
console.log(`Target: ${repo.repoPath} (${repo.url})`);

const identity = await loadPrimaryIdentity();
if (!identity) {
	console.error("No primary identity");
	process.exit(1);
}
console.log(`Primary identity: ${identityHashHex(identity)}`);

const { WorkClient } = await import("../src/work-client.js");
const rns = await createReticulum({ cacheDir: cacheDirectory(), ...rnsEndpoint() });
console.log("Reticulum stack up");

const client = new WorkClient({
	rns,
	identity,
	targetHash: Buffer.from(repo.hash, "hex"),
	group: repo.group,
	repo: repo.repo,
});
try {
	await client.connect();
	console.log("Link established");
	const result = await client.list("all");
	for (const [scope, docs] of Object.entries(result)) {
		console.log(`${scope}: ${(docs ?? []).length}`);
		for (const d of docs ?? []) {
			console.log(`  #${d.id} ${d.title} by ${(d.author ?? "?").slice(0, 8)} ${formatTimestamp(d.created)}`);
		}
	}
	console.log("SMOKE OK");
} finally {
	await client.close();
	await rns.stop();
}
