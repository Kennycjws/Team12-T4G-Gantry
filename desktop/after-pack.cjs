// electron-builder drops any node_modules folder that isn't the app's own, even from
// extraResources, but the kiosk server needs its node_modules. So copy the server in here,
// after the app folder is assembled and before it is packed into the .exe.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  const target = path.join(resources, "server");
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(__dirname, "server"), target, { recursive: true });
};
