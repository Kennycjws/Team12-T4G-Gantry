// Starts everything the kiosk needs, so staff have one thing to launch and no commands
// to learn. The bridge waits for the reader, so the USB can be plugged in at any time.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT ?? "3000";
const APP_URL = `http://127.0.0.1:${PORT}`;
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const RESTART_MS = 2000;
const STARTUP_LIMIT_MS = 60000;

const isUp = () => fetch(APP_URL).then(() => true, () => false);

function openBrowser() {
  const [command, args] = {
    darwin: ["open", [APP_URL]],
    win32: ["cmd", ["/c", "start", "", APP_URL]],
  }[process.platform] ?? ["xdg-open", [APP_URL]];
  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}

// Restarts a crashed process, so one fault doesn't end the lesson.
function keepRunning(args) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, APP_URL },
  });
  child.on("exit", () => setTimeout(() => keepRunning(args), RESTART_MS));
}

// Launched twice by accident: show the kiosk that is already running.
if (await isUp()) {
  openBrowser();
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.log("First run: preparing the app. This takes about a minute…");
  execFileSync(process.execPath, [NEXT, "build"], { cwd: ROOT, stdio: "inherit" });
}

keepRunning([NEXT, "start", "-H", "127.0.0.1", "-p", PORT]);
keepRunning([path.join(ROOT, "bridge", "reader.mjs")]);

const deadline = Date.now() + STARTUP_LIMIT_MS;
while (!(await isUp())) {
  if (Date.now() > deadline) {
    console.error(`The app did not start at ${APP_URL}.`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
openBrowser();
