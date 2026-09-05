;(() => {
  try {
    const { app, dialog } = require("electron");
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    function writeCrashLog(msg) {
      try {
        const dir = path.join(os.tmpdir(), "law-office-management");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "startup-error.txt"), String(msg || ""), "utf8");
      } catch {
        /* ignore */
      }
    }

    function showFatal(err) {
      const msg = err && err.stack ? err.stack : String(err);
      writeCrashLog(msg);
      try {
        dialog.showErrorBox(
          "تعذر تشغيل البرنامج",
          `${String(msg).slice(0, 1600)}\n\nإن لم يفتح البرنامج على ويندوز 10: ثبّت Microsoft Visual C++ Redistributable 2015-2022 (x64) ثم أعد تشغيل الجهاز.`
        );
      } catch {
        /* ignore */
      }
      try {
        app.exit(1);
      } catch {
        process.exit(1);
      }
    }

    process.on("uncaughtException", showFatal);
    process.on("unhandledRejection", showFatal);

    if (process.platform === "win32") {
      try {
        app.disableHardwareAcceleration();
      } catch {
        /* ignore */
      }
      try {
        app.commandLine.appendSwitch(
          "disable-features",
          "CalculateNativeWinOcclusion,WinUseNativeWinOcclusion,HardwareMediaKeyHandling"
        );
        app.commandLine.appendSwitch("disable-gpu-compositing");
        app.commandLine.appendSwitch("disable-renderer-backgrounding");
      } catch {
        /* ignore */
      }
      try {
        app.setAppUserModelId("com.lawoffice.management");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
})();
