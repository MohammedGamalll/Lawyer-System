import { app, shell, BrowserWindow, ipcMain, nativeImage } from "electron";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
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

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

function zoomPath() {
  return join(app.getPath("userData"), "ui-zoom.json");
}

function loadZoomFactor() {
  try {
    const n = Number(JSON.parse(readFileSync(zoomPath(), "utf8")).factor);
    if (Number.isFinite(n)) return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
  } catch {
    /* default */
  }
  return 1;
}

function applyZoom(win: BrowserWindow, factor: number) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(factor * 10) / 10));
  win.webContents.setZoomFactor(z);
  try {
    writeFileSync(zoomPath(), JSON.stringify({ factor: z }));
  } catch {
    /* ignore */
  }
}

function wireZoomShortcuts(win: BrowserWindow) {
  win.webContents.on("did-finish-load", () => {
    win.webContents.setZoomFactor(loadZoomFactor());
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta;
    if (!ctrl || input.alt) return;
    const { code, key } = input;
    const zoomIn =
      code === "Equal" ||
      code === "NumpadAdd" ||
      key === "+" ||
      key === "=" ||
      key === "Add";
    const zoomOut =
      code === "Minus" ||
      code === "NumpadSubtract" ||
      key === "-" ||
      key === "_" ||
      key === "Subtract";
    const zoomReset = !input.shift && (code === "Digit0" || code === "Numpad0");
    if (zoomIn) {
      event.preventDefault();
      applyZoom(win, win.webContents.getZoomFactor() + ZOOM_STEP);
    } else if (zoomOut) {
      event.preventDefault();
      applyZoom(win, win.webContents.getZoomFactor() - ZOOM_STEP);
    } else if (zoomReset) {
      event.preventDefault();
      applyZoom(win, 1);
    }
  });
}

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
  wireZoomShortcuts(mainWindow);
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
