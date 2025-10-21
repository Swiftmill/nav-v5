const { app, BrowserWindow, ipcMain, shell, dialog, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const DATA_DIR = path.join(app.getAppPath(), 'data');
const WINDOW_SIZE = { width: 1280, height: 800 };

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const defaults = {
    'settings.json': {
      accentColor: '#8b5cf6',
      accentSecondary: '#22d3ee',
      blur: 20,
      opacity: 0.7,
      radius: 18,
      showAnimations: true,
      show3dBackground: true,
      showFavoritesBar: true,
      searchEngine: 'https://www.google.com/search?q=%s',
      quickSearch: {
        '!g': 'https://www.google.com/search?q=%s',
        '!yt': 'https://www.youtube.com/results?search_query=%s',
        '!ddg': 'https://duckduckgo.com/?q=%s'
      }
    },
    'bookmarks.json': [],
    'history.json': [],
    'sessions.json': { tabs: [], activeTabId: null }
  };

  for (const [file, content] of Object.entries(defaults)) {
    const target = path.join(DATA_DIR, file);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, JSON.stringify(content, null, 2));
    }
  }
}

function createBackup(originalPath) {
  const backupPath = `${originalPath}.bak`;
  try {
    if (fs.existsSync(originalPath)) {
      fs.copyFileSync(originalPath, backupPath);
    }
  } catch (err) {
    console.error('Failed creating backup', err);
  }
}

function readJsonSafe(filename, fallback) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed parsing ${filename}, resetting.`, err);
    createBackup(filePath);
    const data = fallback ?? [];
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data;
  }
}

function writeJsonSafe(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed writing ${filename}`, err);
    dialog.showErrorBox('Save Error', `Unable to save ${filename}: ${err.message}`);
  }
}

let mainWindow;
let downloadItems = [];

function createWindow({ isPrivate = false } = {}) {
  const win = new BrowserWindow({
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#050510',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'popover',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: true,
      additionalArguments: [isPrivate ? '--private' : '--regular']
    }
  });

  win.loadFile(path.join(app.getAppPath(), 'index.html'));

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('app:privacy', { isPrivate });
  });

  win.on('close', () => {
    if (win === mainWindow) {
      mainWindow = undefined;
    }
  });

  return win;
}

app.whenReady().then(() => {
  ensureDataFiles();
  Menu.setApplicationMenu(null);
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function handleDownloadEvents(targetSession) {
  targetSession.on('will-download', (event, item) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const download = {
      id,
      name: item.getFilename(),
      url: item.getURL(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      savePath: item.getSavePath()
    };
    downloadItems.unshift(download);
    broadcastDownloads();

    item.on('updated', (_event, state) => {
      download.receivedBytes = item.getReceivedBytes();
      download.state = state;
      broadcastDownloads();
    });

    item.once('done', (_event, state) => {
      download.state = state;
      download.receivedBytes = item.getReceivedBytes();
      download.savePath = item.getSavePath();
      broadcastDownloads();
    });
  });
}

function broadcastDownloads() {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('downloads:update', downloadItems);
  }
}

handleDownloadEvents(session.defaultSession);

ipcMain.handle('settings:get', async () => {
  return readJsonSafe('settings.json', {});
});

ipcMain.handle('settings:set', async (_event, settings) => {
  writeJsonSafe('settings.json', settings);
  return settings;
});

ipcMain.handle('bookmarks:list', async () => {
  return readJsonSafe('bookmarks.json', []);
});

ipcMain.handle('bookmarks:add', async (_event, bookmark) => {
  const bookmarks = readJsonSafe('bookmarks.json', []);
  bookmarks.push(bookmark);
  writeJsonSafe('bookmarks.json', bookmarks);
  return bookmarks;
});

ipcMain.handle('bookmarks:remove', async (_event, id) => {
  const bookmarks = readJsonSafe('bookmarks.json', []);
  const filtered = bookmarks.filter((b) => b.id !== id);
  writeJsonSafe('bookmarks.json', filtered);
  return filtered;
});

ipcMain.handle('bookmarks:update', async (_event, bookmark) => {
  const bookmarks = readJsonSafe('bookmarks.json', []);
  const idx = bookmarks.findIndex((b) => b.id === bookmark.id);
  if (idx >= 0) {
    bookmarks[idx] = { ...bookmarks[idx], ...bookmark };
  } else {
    bookmarks.push(bookmark);
  }
  writeJsonSafe('bookmarks.json', bookmarks);
  return bookmarks;
});

ipcMain.handle('history:list', async () => {
  return readJsonSafe('history.json', []);
});

ipcMain.handle('history:add', async (_event, entry) => {
  if (!entry || !entry.url) return;
  const history = readJsonSafe('history.json', []);
  history.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: entry.title,
    url: entry.url,
    timestamp: Date.now()
  });
  const maxEntries = 1000;
  if (history.length > maxEntries) {
    history.splice(maxEntries);
  }
  writeJsonSafe('history.json', history);
  return history;
});

ipcMain.handle('history:clear', async () => {
  writeJsonSafe('history.json', []);
  return [];
});

ipcMain.handle('sessions:load', async () => {
  return readJsonSafe('sessions.json', { tabs: [], activeTabId: null });
});

ipcMain.handle('sessions:save', async (_event, sessionData) => {
  writeJsonSafe('sessions.json', sessionData);
  return sessionData;
});

ipcMain.handle('downloads:list', async () => downloadItems);

ipcMain.handle('downloads:open-folder', async (_event, id) => {
  const target = downloadItems.find((item) => item.id === id);
  if (target?.savePath) {
    await shell.showItemInFolder(target.savePath);
  }
});

ipcMain.handle('app:open-external', async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('app:get-version', async () => app.getVersion());

ipcMain.handle('app:new-private-window', () => {
  const privateWin = createWindow({ isPrivate: true });
  handleDownloadEvents(privateWin.webContents.session);
});

ipcMain.handle('app:clear-downloads', () => {
  downloadItems = [];
  broadcastDownloads();
});

