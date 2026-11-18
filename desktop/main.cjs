// The Windows app: starts the kiosk server and the card reader bridge, then shows the
// kiosk full screen. Teachers just open the app; nothing to install or type.
//
// Set KIOSK_WINDOWED=1 to open in a normal window while testing.
const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const RESTART_MS = 2000;
const STARTUP_LIMIT_MS = 60000;

const children = new Set();
let quitting = false;
let window = null;

// One copy at a time: opening it again just brings the kiosk back to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(start);
}

// Cards live in the teacher's own app data folder, so they survive restarts.
// The first run starts from the card list the app was built with.
function prepareData(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = path.join(dataDir, "db.json");
  const starter = path.join(__dirname, "default-db.json");
  if (!fs.existsSync(db) && fs.existsSync(starter)) fs.copyFileSync(starter, db);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// Runs a script with the Node.js built into Electron, and restarts it if it crashes.
function keepRunning(script, env, log) {
  const child = spawn(process.execPath, [script], {
    cwd: path.dirname(script),
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  children.add(child);
  child.stdout.on("data", (data) => log.write(data));
  child.stderr.on("data", (data) => log.write(data));
  child.on("exit", () => {
    children.delete(child);
    if (!quitting) setTimeout(() => keepRunning(script, env, log), RESTART_MS);
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + STARTUP_LIMIT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return false;
}

function message(text) {
  const html = `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#1d3a44;color:white;font:24px system-ui">${text}</body>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function start() {
  const dataDir = path.join(app.getPath("userData"), "data");
  prepareData(dataDir);
  // If something goes wrong on a school laptop, this file says what happened.
  const log = fs.createWriteStream(path.join(app.getPath("userData"), "log.txt"), { flags: "w" });

  const windowed = process.env.KIOSK_WINDOWED === "1";
  window = new BrowserWindow({
    width: 1280,
    height: 720,
    kiosk: !windowed,
    autoHideMenuBar: true,
    backgroundColor: "#1d3a44",
    title: "Grace Orchard Top-Up",
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });
  window.loadURL(message("Starting the top-up machine…"));

  const port = await freePort();
  let bridgePort = await freePort(); // where the server sends card writes to the bridge
  while (bridgePort === port) bridgePort = await freePort();
  const url = `http://127.0.0.1:${port}`;
  log.write(`Kiosk at ${url}, cards in ${dataDir}\n`);

  // Packaged, the server sits beside the app in resources/ (see after-pack.cjs).
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "server");
  keepRunning(path.join(serverDir, "server.js"), {
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    KIOSK_DATA_DIR: dataDir,
    BRIDGE_URL: `http://127.0.0.1:${bridgePort}`,
  }, log);
  keepRunning(path.join(__dirname, "bridge", "reader.mjs"), { APP_URL: url, BRIDGE_PORT: String(bridgePort) }, log);

  if (await waitForServer(url)) {
    window.loadURL(url);
  } else {
    window.loadURL(message("The top-up machine could not start. Please close it and try again."));
  }
}

ipcMain.on("quit", () => app.quit());

app.on("before-quit", () => {
  quitting = true;
  for (const child of children) child.kill();
});

app.on("window-all-closed", () => app.quit());
