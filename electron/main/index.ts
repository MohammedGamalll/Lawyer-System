import { app, shell, BrowserWindow, ipcMain, nativeImage } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { initDatabase } from "./db/database";
import { persistSyncSettingsFromEnv } from "./services/settings";
import { registerIpc } from "./ipc/register";
import {
  processDueReminders,
  generateDailyNotifications,
} from "./services/reminders";
import { garbageCollectOrphans } from "./services/documents";
import { maybeAutoBackup } from "./services/backup";
import { initUpdater } from "./services/updater";
import { ensureAdminOnlyReset } from "./services/wipe";
import { startSyncService } from "./sync/service";
import { loadDotEnv } from "./env";
import log from "electron-log";

// الكود ده هيشتغل بس لو إحنا طلبنا نفتح النسخة التانية
if (process.env.SECOND_INSTANCE === "true") {
  // هنعمل مسار جديد تماماً لقاعدة البيانات والإعدادات
  const customUserDataPath = join(
    app.getPath("appData"),
    "LawyerSystem_Device2",
  );
  app.setPath("userData", customUserDataPath);
  console.log("Running Second Instance at:", customUserDataPath);
}

loadDotEnv();

let mainWindow: BrowserWindow | null = null;

function appIcon() {
  const candidates = [
    join(process.resourcesPath || "", "icon.ico"),
    join(process.resourcesPath || "", "icon.png"),
    join(app.getAppPath(), "resources", "icon.ico"),
    join(app.getAppPath(), "resources", "icon.png"),
    join(process.cwd(), "resources", "icon.ico"),
    join(process.cwd(), "resources", "icon.png"),
  ];
  const p = candidates.find((x) => existsSync(x));
  return p ? nativeImage.createFromPath(p) : undefined;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: "Law Office Management System",
    icon: appIcon(),
    backgroundColor: "#0c1b2e",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.lawoffice.management");
  initDatabase();
  persistSyncSettingsFromEnv();
  try {
    ensureAdminOnlyReset();
  } catch (err) {
    log.warn(err);
  }
  registerIpc(ipcMain, () => mainWindow);
  createWindow();
  try {
    startSyncService(() => mainWindow);
  } catch (err) {
    log.warn(err);
  }
  if (mainWindow) {
    try {
      initUpdater(mainWindow);
    } catch (err) {
      log.warn(err);
    }
  }
  try {
    maybeAutoBackup(null);
    garbageCollectOrphans(null);
    generateDailyNotifications();
  } catch (err) {
    log.warn(err);
  }

  setInterval(() => {
    try {
      processDueReminders();
    } catch (err) {
      log.warn(err);
    }
  }, 60_000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
