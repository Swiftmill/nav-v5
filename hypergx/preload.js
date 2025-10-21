const { contextBridge, ipcRenderer } = require('electron');

const apiProxy = (channel, mapper = (x) => x) => async (...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  return mapper(result);
};

contextBridge.exposeInMainWorld('gx', {
  settings: {
    get: apiProxy('settings:get'),
    set: apiProxy('settings:set')
  },
  bookmarks: {
    list: apiProxy('bookmarks:list'),
    add: apiProxy('bookmarks:add'),
    remove: apiProxy('bookmarks:remove'),
    update: apiProxy('bookmarks:update')
  },
  history: {
    list: apiProxy('history:list'),
    add: apiProxy('history:add'),
    clear: apiProxy('history:clear')
  },
  sessions: {
    load: apiProxy('sessions:load'),
    save: apiProxy('sessions:save')
  },
  downloads: {
    list: apiProxy('downloads:list'),
    openFolder: apiProxy('downloads:open-folder')
  },
  app: {
    openExternal: apiProxy('app:open-external'),
    version: apiProxy('app:get-version'),
    newPrivateWindow: apiProxy('app:new-private-window'),
    clearDownloads: apiProxy('app:clear-downloads')
  },
  onDownloadsUpdate(callback) {
    ipcRenderer.on('downloads:update', (_event, payload) => callback(payload));
  },
  onPrivacy(callback) {
    ipcRenderer.on('app:privacy', (_event, payload) => callback(payload));
  }
});
