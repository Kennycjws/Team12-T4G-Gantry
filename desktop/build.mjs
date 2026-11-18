// Builds the Windows app: `npm run desktop`.
// Output: desktop/dist/Grace Orchard Top-Up.exe, a single file teachers double-click.
//
// `npm run desktop -- --mac` also builds a Mac copy, to test the app before a lesson.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(DESKTOP);
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, cwd, env = {}) {
  execFileSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

function copy(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

console.log("1/4 Building the kiosk…");
run(NPM, ["run", "build"], ROOT, { BUILD_STANDALONE: "1" });

console.log("2/4 Collecting the files the app needs…");
const server = path.join(DESKTOP, "server");
copy(path.join(ROOT, ".next", "standalone"), server);
copy(path.join(ROOT, ".next", "static"), path.join(server, ".next", "static"));
copy(path.join(ROOT, "public"), path.join(server, "public"));
// The build machine's own card data must not ship inside the server folder.
fs.rmSync(path.join(server, "data"), { recursive: true, force: true });
copy(path.join(ROOT, "bridge"), path.join(DESKTOP, "bridge"));

// First-run card list: the cards registered on this machine, without its transaction history.
const db = path.join(ROOT, "data", "db.json");
const starter = path.join(DESKTOP, "default-db.json");
if (fs.existsSync(db)) {
  const { cards } = JSON.parse(fs.readFileSync(db, "utf8"));
  fs.writeFileSync(starter, JSON.stringify({ cards, transactions: [] }, null, 2));
  console.log(`   Starting card list: ${cards.length} cards`);
} else {
  fs.rmSync(starter, { force: true });
}

console.log("3/4 Installing the app's own packages…");
if (!fs.existsSync(path.join(DESKTOP, "node_modules", "electron-builder"))) {
  run(NPM, ["install", "--no-audit", "--no-fund"], DESKTOP);
}

console.log("4/4 Packaging…");
const targets = ["--win", ...(process.argv.includes("--mac") ? ["--mac"] : [])];
run(NPX, ["electron-builder", ...targets, "--publish", "never"], DESKTOP);

console.log(`\nDone: ${path.join(DESKTOP, "dist", "Grace Orchard Top-Up.exe")}`);
