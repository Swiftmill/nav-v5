const rootStyle = document.documentElement.style;
const tabsBar = document.getElementById('tabs-bar');
const newTabBtn = document.getElementById('btn-new-tab');
const addressBar = document.getElementById('address-bar');
const homeScreen = document.getElementById('home-screen');
const webviewsContainer = document.getElementById('webviews');
const favoritesList = document.getElementById('favorites-list');
const historyList = document.getElementById('history-list');
const downloadsList = document.getElementById('downloads-list');
const homeSearchInput = document.getElementById('home-search-input');
const homeSearchBtn = document.getElementById('home-search-btn');
const speedDial = document.getElementById('speed-dial');
const sidebarButtons = Array.from(document.querySelectorAll('.sidebar-btn'));
const panels = Array.from(document.querySelectorAll('.side-panel'));
const btnAddBookmark = document.getElementById('btn-add-bookmark');
const btnClearHistory = document.getElementById('btn-clear-history');
const historySearch = document.getElementById('history-search');
const btnClearDownloads = document.getElementById('btn-clear-downloads');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsForm = document.getElementById('settings-form');
const btnBookmark = document.getElementById('btn-bookmark');
const btnSettings = document.getElementById('btn-settings');
const btnPrivate = document.getElementById('btn-private');
const homeButton = document.getElementById('btn-home');
const backButton = document.getElementById('btn-back');
const forwardButton = document.getElementById('btn-forward');
const reloadButton = document.getElementById('btn-reload');
const galaxyCanvas = document.getElementById('galaxy-canvas');
const downloadsPanel = document.getElementById('panel-downloads');

let tabs = [];
let activeTabId = null;
let settings = null;
let isPrivateWindow = false;
let quickSearchMap = {};
let privacyResolver;
const privacyPromise = new Promise((resolve) => {
  privacyResolver = resolve;
  setTimeout(resolve, 200);
});

const HOME_PLACEHOLDER = 'hypergx://home';

const createId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function applySettings(theme) {
  if (!theme) return;
  const {
    accentColor,
    accentSecondary,
    blur,
    opacity,
    radius,
    showAnimations,
    show3dBackground,
    showFavoritesBar
  } = theme;

  rootStyle.setProperty('--accent', accentColor);
  rootStyle.setProperty('--accent2', accentSecondary);
  rootStyle.setProperty('--blur', `${blur}px`);
  rootStyle.setProperty('--panel', `rgba(18, 20, 45, ${opacity})`);
  rootStyle.setProperty('--radius', `${radius}px`);

  document.body.classList.toggle('no-animations', !showAnimations);
  galaxyCanvas.classList.toggle('hidden', !show3dBackground);
  document.getElementById('panel-favorites').classList.toggle('hidden', !showFavoritesBar);
  quickSearchMap = theme.quickSearch || {};
}

function populateSettingsForm(theme) {
  settingsForm.querySelector('#accent-color').value = theme.accentColor;
  settingsForm.querySelector('#accent-secondary').value = theme.accentSecondary;
  settingsForm.querySelector('#blur-range').value = theme.blur;
  settingsForm.querySelector('#opacity-range').value = theme.opacity;
  settingsForm.querySelector('#radius-range').value = theme.radius;
  settingsForm.querySelector('#search-engine').value = theme.searchEngine;
  settingsForm.querySelector('#toggle-animations').checked = theme.showAnimations;
  settingsForm.querySelector('#toggle-3d').checked = theme.show3dBackground;
  settingsForm.querySelector('#toggle-favorites').checked = theme.showFavoritesBar;
}

async function loadSettings() {
  settings = await window.gx.settings.get();
  applySettings(settings);
  populateSettingsForm(settings);
  startGalaxyAnimation();
}

function saveSettingsFromForm() {
  const updated = {
    ...settings,
    accentColor: settingsForm.querySelector('#accent-color').value,
    accentSecondary: settingsForm.querySelector('#accent-secondary').value,
    blur: Number(settingsForm.querySelector('#blur-range').value),
    opacity: Number(settingsForm.querySelector('#opacity-range').value),
    radius: Number(settingsForm.querySelector('#radius-range').value),
    searchEngine: settingsForm.querySelector('#search-engine').value,
    showAnimations: settingsForm.querySelector('#toggle-animations').checked,
    show3dBackground: settingsForm.querySelector('#toggle-3d').checked,
    showFavoritesBar: settingsForm.querySelector('#toggle-favorites').checked
  };
  settings = updated;
  applySettings(settings);
  window.gx.settings.set(updated);
}

function activatePanel(panelName) {
  panels.forEach((panel) => {
    if (panel.dataset.panel === panelName) {
      panel.classList.toggle('active');
    } else {
      panel.classList.remove('active');
    }
  });
  sidebarButtons.forEach((btn) => {
    if (btn.dataset.panel === panelName) {
      btn.classList.toggle('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function hidePanels() {
  panels.forEach((panel) => panel.classList.remove('active'));
  sidebarButtons.forEach((btn) => btn.classList.remove('active'));
}

function createTab({ id = null, url = HOME_PLACEHOLDER, title = 'Nouvel onglet', active = false } = {}) {
  const tabId = id || createId('tab');
  const tab = { id: tabId, url, title, isLoading: false };
  const tabElement = document.createElement('button');
  tabElement.className = 'tab';
  tabElement.draggable = true;
  tabElement.dataset.tabId = tabId;
  tabElement.innerHTML = `<span class="label">${title}</span><span class="close">×</span>`;
  tabsBar.insertBefore(tabElement, newTabBtn);

  const webview = document.createElement('webview');
  webview.setAttribute('allowpopups', '');
  if (isPrivateWindow) {
    webview.setAttribute('partition', `temp:${tabId}`);
  } else {
    webview.setAttribute('partition', 'persist:hypergx');
  }
  webview.src = url === HOME_PLACEHOLDER ? 'about:blank' : url;
  webview.dataset.tabId = tabId;
  webview.addEventListener('did-start-loading', () => {
    tab.isLoading = true;
    updateTabLabel(tabId, `${webview.getTitle() || tab.title} • …`);
  });
  const handleNavigation = (event) => {
    const currentURL = event.url || webview.getURL();
    tab.url = currentURL;
    updateAddressBar();
    if (!isPrivateWindow && currentURL && currentURL !== 'about:blank') {
      window.gx.history.add({ title: webview.getTitle() || currentURL, url: currentURL });
      scheduleSessionSave();
      refreshHistory();
    }
    btnBookmark.classList.toggle('active', isBookmarked(currentURL));
  };
  webview.addEventListener('did-navigate', handleNavigation);
  webview.addEventListener('did-navigate-in-page', handleNavigation);
  webview.addEventListener('page-title-updated', (event) => {
    tab.title = event.title;
    updateTabLabel(tabId, event.title);
    scheduleSessionSave();
  });
  webview.addEventListener('did-stop-loading', () => {
    tab.isLoading = false;
    updateTabLabel(tabId, tab.title);
  });
  webview.addEventListener('new-window', (event) => {
    createTab({ url: event.url, title: event.url, active: true });
  });

  webviewsContainer.appendChild(webview);
  tab.element = tabElement;
  tab.webview = webview;
  tab.id = tabId;
  tabs.push(tab);
  attachTabEvents(tab);
  if (active || tabs.length === 1) {
    setActiveTab(tabId);
  }
  scheduleSessionSave();
  return tab;
}

function attachTabEvents(tab) {
  const { element } = tab;
  element.addEventListener('click', () => setActiveTab(tab.id));
  element.querySelector('.close').addEventListener('click', (event) => {
    event.stopPropagation();
    closeTab(tab.id);
  });
  element.addEventListener('dblclick', () => duplicateTab(tab.id));
  element.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', tab.id);
    element.classList.add('dragging');
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('dragging');
  });
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== tab.id) {
      reorderTabs(draggedId, tab.id);
    }
  });
}

function reorderTabs(draggedId, targetId) {
  const draggedIndex = tabs.findIndex((t) => t.id === draggedId);
  const targetIndex = tabs.findIndex((t) => t.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
  const targetElement = tabs[targetIndex].element;
  const [dragged] = tabs.splice(draggedIndex, 1);
  const insertIndex = draggedIndex < targetIndex ? targetIndex : targetIndex;
  tabs.splice(insertIndex, 0, dragged);
  const referenceNode = draggedIndex < targetIndex ? targetElement.nextSibling : targetElement;
  tabsBar.insertBefore(dragged.element, referenceNode);
  scheduleSessionSave();
}

function duplicateTab(tabId) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  createTab({ url: tab.url, title: `${tab.title}`, active: true });
}

function closeTab(tabId) {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return;
  const [tab] = tabs.splice(index, 1);
  tab.element.remove();
  tab.webview.remove();
  if (activeTabId === tabId) {
    const next = tabs[index] || tabs[index - 1];
    if (next) {
      setActiveTab(next.id);
    } else {
      createTab({});
    }
  }
  scheduleSessionSave();
}

function setActiveTab(tabId) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  activeTabId = tabId;
  tabs.forEach((t) => {
    t.element.classList.toggle('active', t.id === tabId);
    t.webview.classList.toggle('visible', t.id === tabId && t.url !== HOME_PLACEHOLDER);
  });
  if (tab.url === HOME_PLACEHOLDER || !tab.url || tab.url === 'about:blank') {
    homeScreen.classList.remove('hidden');
  } else {
    homeScreen.classList.add('hidden');
  }
  updateAddressBar();
  btnBookmark.classList.toggle('active', isBookmarked(tab.url));
}

function updateAddressBar() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  if (!tab.url || tab.url === HOME_PLACEHOLDER || tab.url === 'about:blank') {
    addressBar.value = '';
  } else {
    addressBar.value = tab.url;
  }
}

function updateTabLabel(tabId, label) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  tab.element.querySelector('.label').textContent = label;
}

function resolveURL(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const [command, ...rest] = trimmed.split(' ');
  if (quickSearchMap[command]) {
    const query = rest.join(' ');
    return quickSearchMap[command].replace('%s', encodeURIComponent(query));
  }

  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch (err) {
    if (/^\w+:/.test(trimmed)) {
      return trimmed;
    }
  }

  const candidate = trimmed.includes('.') ? `https://${trimmed}` : null;
  if (candidate) {
    try {
      new URL(candidate);
      return candidate;
    } catch (err) {
      // ignore
    }
  }

  return settings.searchEngine.replace('%s', encodeURIComponent(trimmed));
}

function navigateTo(url) {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  if (!url) {
    tab.url = HOME_PLACEHOLDER;
    tab.webview.src = 'about:blank';
    tab.webview.classList.remove('visible');
    homeScreen.classList.remove('hidden');
    updateAddressBar();
    scheduleSessionSave();
    return;
  }
  tab.url = url;
  tab.webview.src = url;
  tab.webview.classList.add('visible');
  homeScreen.classList.add('hidden');
  updateAddressBar();
  scheduleSessionSave();
}

function isBookmarked(url) {
  return bookmarksCache.some((bookmark) => bookmark.url === url);
}

let bookmarksCache = [];
async function refreshBookmarks() {
  bookmarksCache = await window.gx.bookmarks.list();
  favoritesList.innerHTML = '';
  speedDial.innerHTML = '';
  bookmarksCache.forEach((bookmark) => {
    const item = document.createElement('li');
    item.className = 'panel-item';
    item.innerHTML = `
      <div class="title">${bookmark.title}</div>
      <div class="url">${bookmark.url}</div>
      <div class="actions">
        <button data-action="open">Ouvrir</button>
        <button data-action="edit">Modifier</button>
        <button data-action="delete">Supprimer</button>
      </div>
    `;
    item.querySelector('[data-action="open"]').addEventListener('click', () => {
      hidePanels();
      setActiveTab(activeTabId);
      navigateTo(bookmark.url);
    });
    item.querySelector('[data-action="edit"]').addEventListener('click', async () => {
      const newTitle = prompt('Titre du favori', bookmark.title);
      const newURL = prompt('URL du favori', bookmark.url);
      if (!newURL) return;
      await window.gx.bookmarks.update({
        ...bookmark,
        title: newTitle || bookmark.title,
        url: newURL
      });
      refreshBookmarks();
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await window.gx.bookmarks.remove(bookmark.id);
      refreshBookmarks();
    });
    favoritesList.appendChild(item);

    const card = document.createElement('div');
    card.className = 'speed-card';
    card.style.setProperty('box-shadow', `0 0 20px ${bookmark.color || settings.accentColor}55`);
    card.innerHTML = `<strong>${bookmark.title}</strong><p>${bookmark.url}</p>`;
    card.addEventListener('click', () => {
      navigateTo(bookmark.url);
    });
    speedDial.appendChild(card);
  });
  btnBookmark.classList.toggle('active', isBookmarked(getCurrentURL()));
}

async function refreshHistory() {
  const entries = await window.gx.history.list();
  const filter = historySearch.value.toLowerCase();
  historyList.innerHTML = '';
  entries
    .filter((entry) => entry.title?.toLowerCase().includes(filter) || entry.url?.toLowerCase().includes(filter))
    .forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'panel-item';
      const date = new Date(entry.timestamp).toLocaleString();
      item.innerHTML = `
        <div class="title">${entry.title || entry.url}</div>
        <div class="url">${entry.url}</div>
        <div class="time">${date}</div>
        <button data-action="open">Ouvrir</button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        navigateTo(entry.url);
        hidePanels();
      });
      historyList.appendChild(item);
    });
}

function renderDownloads(downloads) {
  downloadsList.innerHTML = '';
  downloads.forEach((download) => {
    const progress = download.totalBytes > 0 ? Math.round((download.receivedBytes / download.totalBytes) * 100) : 0;
    const item = document.createElement('li');
    item.className = 'panel-item';
    item.innerHTML = `
      <div class="title">${download.name}</div>
      <div class="progress">${progress || 0}% - ${download.state}</div>
      <button data-id="${download.id}">Ouvrir le dossier</button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      window.gx.downloads.openFolder(download.id);
    });
    downloadsList.appendChild(item);
  });
}

window.gx.onDownloadsUpdate((payload) => {
  renderDownloads(payload);
});

btnClearDownloads.addEventListener('click', () => {
  window.gx.app.clearDownloads();
  downloadsList.innerHTML = '';
});

async function loadSessions() {
  if (isPrivateWindow) {
    createTab({ active: true });
    return;
  }
  const sessionData = await window.gx.sessions.load();
  if (sessionData.tabs.length === 0) {
    createTab({ active: true });
    return;
  }
  sessionData.tabs.forEach((tab) => {
    createTab({ id: tab.id, url: tab.url || HOME_PLACEHOLDER, title: tab.title || 'Onglet', active: tab.id === sessionData.activeTabId });
  });
  setActiveTab(sessionData.activeTabId || tabs[0].id);
}

let sessionSaveTimer;
function scheduleSessionSave() {
  if (isPrivateWindow) return;
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    const payload = {
      tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url })),
      activeTabId
    };
    window.gx.sessions.save(payload);
  }, 500);
}

function getCurrentURL() {
  const tab = tabs.find((t) => t.id === activeTabId);
  return tab?.url || '';
}

async function toggleBookmark() {
  const url = getCurrentURL();
  if (!url || url === HOME_PLACEHOLDER || url === 'about:blank') return;
  const existing = bookmarksCache.find((b) => b.url === url);
  if (existing) {
    await window.gx.bookmarks.remove(existing.id);
  } else {
    const tab = tabs.find((t) => t.id === activeTabId);
    await window.gx.bookmarks.add({
      id: createId('bm'),
      title: tab.title || url,
      url,
      color: settings.accentColor
    });
  }
  refreshBookmarks();
}

function startGalaxyAnimation() {
  const ctx = galaxyCanvas.getContext('2d');
  const stars = Array.from({ length: 180 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: Math.random(),
    velocity: 0.0005 + Math.random() * 0.001
  }));

  let animationFrame;
  const resize = () => {
    galaxyCanvas.width = window.innerWidth;
    galaxyCanvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  const animate = () => {
    if (!settings.show3dBackground) {
      ctx.clearRect(0, 0, galaxyCanvas.width, galaxyCanvas.height);
      animationFrame = requestAnimationFrame(animate);
      return;
    }
    ctx.fillStyle = 'rgba(5,5,16,0.35)';
    ctx.fillRect(0, 0, galaxyCanvas.width, galaxyCanvas.height);
    stars.forEach((star) => {
      star.z -= star.velocity;
      if (star.z <= 0) {
        star.x = Math.random();
        star.y = Math.random();
        star.z = 1;
      }
      const k = 128;
      const px = (star.x - 0.5) * galaxyCanvas.width;
      const py = (star.y - 0.5) * galaxyCanvas.height;
      const scale = k / star.z;
      const x = galaxyCanvas.width / 2 + px * scale;
      const y = galaxyCanvas.height / 2 + py * scale;
      const radius = Math.max(0.6, (1 - star.z) * 3);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 6);
      gradient.addColorStop(0, settings.accentColor + 'ff');
      gradient.addColorStop(1, settings.accentSecondary + '00');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
}

function goBack() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (tab?.webview.canGoBack()) {
    tab.webview.goBack();
  }
}

function goForward() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (tab?.webview.canGoForward()) {
    tab.webview.goForward();
  }
}

function reloadTab() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  if (tab.url === HOME_PLACEHOLDER || tab.url === 'about:blank') {
    return;
  }
  tab.webview.reload();
}

function goHome() {
  navigateTo(null);
}

async function addBookmarkManually() {
  const url = prompt('URL du favori');
  const title = prompt('Titre du favori');
  if (!url) return;
  await window.gx.bookmarks.add({
    id: createId('bm'),
    url,
    title: title || url,
    color: settings.accentColor
  });
  refreshBookmarks();
}

historySearch.addEventListener('input', refreshHistory);
addressBar.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const url = resolveURL(addressBar.value);
    navigateTo(url);
  }
});

homeSearchBtn.addEventListener('click', () => {
  const url = resolveURL(homeSearchInput.value);
  navigateTo(url);
});

homeSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const url = resolveURL(homeSearchInput.value);
    navigateTo(url);
  }
});

newTabBtn.addEventListener('click', () => {
  createTab({ active: true });
});

btnBookmark.addEventListener('click', toggleBookmark);
btnSettings.addEventListener('click', () => activatePanel('settings'));
btnPrivate.addEventListener('click', () => window.gx.app.newPrivateWindow());
btnAddBookmark.addEventListener('click', addBookmarkManually);
btnClearHistory.addEventListener('click', async () => {
  await window.gx.history.clear();
  refreshHistory();
});
btnSaveSettings.addEventListener('click', saveSettingsFromForm);
backButton.addEventListener('click', goBack);
forwardButton.addEventListener('click', goForward);
reloadButton.addEventListener('click', reloadTab);
homeButton.addEventListener('click', goHome);

downloadsPanel.addEventListener('mouseenter', async () => {
  const downloads = await window.gx.downloads.list();
  renderDownloads(downloads);
});

sidebarButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    activatePanel(btn.dataset.panel);
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hidePanels();
  }
});

window.gx.onPrivacy(({ isPrivate }) => {
  isPrivateWindow = isPrivate;
  if (privacyResolver) {
    privacyResolver();
    privacyResolver = null;
  }
});

(async function init() {
  await privacyPromise;
  await loadSettings();
  await refreshBookmarks();
  await refreshHistory();
  await loadSessions();
})();

