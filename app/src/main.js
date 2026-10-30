(function () {
const {
  PageController,
  bindKeyboardControls,
  buildBaseMap,
  createLocalOnThe8sAudio,
  createSettingsStore,
  createWeatherCache,
  createRadarCache,
  createStage,
  drawRadar,
  fetchOpenMeteoReport,
  fetchRainViewerRadar,
  findFocusTarget,
  focusDescriptor,
  preloadBaseMapTiles,
  preloadRadarFrames,
  renderChrome,
  renderClock,
  renderHelpOverlay,
  renderLocationSetup,
  renderPage,
  resolveZipLocation,
  weatherReport
} = window.RetroWeather;

const appRoot = document.querySelector('#app');
const settings = createSettingsStore('retro-weather-settings');
const stage = createStage(appRoot);
const weatherCache = createWeatherCache('retro-weather-cache-v2');
const radarCache = createRadarCache('retro-weather-radar-cache-v3');
const audioBed = createLocalOnThe8sAudio({
  onStatusChange: (status) => {
    appState.audioStatus = status;
    stage.root.dataset.music = status;
    render();
  }
});
const fallbackWeatherReport = weatherReport;
const initialSettings = settings.get();
const RADAR_REFRESH_MS = 10 * 60 * 1000;
const STARTUP_PAGE = 'extended';

const controller = new PageController({
  pages: initialSettings.pageOrder,
  initialPage: STARTUP_PAGE,
  rotationSeconds: initialSettings.rotationSeconds,
  canRotate: () => !appState.setupVisible && !appState.helpVisible
});

const appState = {
  helpVisible: false,
  setupVisible: !initialSettings.location && initialSettings.weatherMode !== 'mock',
  weatherError: '',
  weatherStatus: initialSettings.weatherMode === 'mock' || !initialSettings.location ? 'mock' : 'loading',
  mockFallbackActive: false,
  weatherRequestId: 0,
  setupRequestId: 0,
  radarRequestId: 0,
  baseMapRenderId: 0,
  radarFrameTick: -1,
  radarLocationKey: '',
  radar: {
    status: 'idle',
    frames: [],
    error: ''
  },
  baseMapLocationKey: '',
  radarBaseMap: null,
  regionalBaseMap: null,
  audioStatus: initialSettings.audioEnabled ? 'pending' : 'off',
  report: fallbackWeatherReport,
  zipDraft: initialSettings.location?.zip || '',
  lastRenderAt: new Date()
};

function render() {
  const currentSettings = settings.get();
  const currentPage = controller.currentPage;
  const report = appState.report;
  const previousFocus = captureStageFocus();

  stage.root.dataset.paused = String(controller.paused);
  stage.root.dataset.scanlines = String(currentSettings.scanlines);
  stage.root.dataset.audio = String(currentSettings.audioEnabled);
  stage.root.dataset.reducedMotion = String(currentSettings.reducedMotion);
  stage.root.dataset.units = currentSettings.units;
  stage.root.dataset.motion = currentSettings.reducedMotion || controller.paused ? 'paused' : 'playing';
  stage.root.dataset.music = appState.audioStatus;
  stage.root.classList.toggle('has-crt', currentSettings.scanlines);
  stage.root.classList.toggle('crt-off', !currentSettings.scanlines);
  stage.root.classList.toggle('is-paused', controller.paused);

  renderChrome(stage, {
    page: currentPage,
    pageIndex: controller.pageIndex,
    pageCount: controller.pageCount,
    paused: controller.paused,
    settings: currentSettings,
    report,
    now: appState.lastRenderAt,
    audioStatus: appState.audioStatus,
    onToggleAudio: toggleAudio
  });

  renderPage(stage.content, currentPage, {
    report,
    settings: currentSettings,
    controller,
    radar: appState.radar,
    radarBaseMap: appState.radarBaseMap,
    regionalBaseMap: appState.regionalBaseMap,
    weatherStatus: appState.weatherStatus,
    onSetAudio: setAudioEnabled,
    onSetRotation: setRotationSeconds,
    onSetUnits: (units) => settings.update({ units }),
    onSetScanlines: (scanlines) => settings.update({ scanlines }),
    onSetMotion: (reducedMotion) => settings.update({ reducedMotion }),
    onChangeLocation: openLocationSetup
  });

  renderHelpOverlay(stage.help, {
    visible: appState.helpVisible,
    pages: controller.pages,
    currentPage,
    settings: currentSettings
  });

  renderLocationSetup(stage.setup, {
    visible: appState.setupVisible,
    location: currentSettings.location,
    zipValue: appState.zipDraft,
    status: appState.weatherStatus,
    error: appState.weatherError,
    onSubmit: setZipLocation,
    onZipInput: updateZipDraft,
    onCancel: closeLocationSetup
  });

  restoreStageFocus(previousFocus);
}

function captureStageFocus() {
  const active = document.activeElement;
  if (!active || appState.setupVisible || appState.helpVisible) {
    return null;
  }

  if (!stage.root.contains(active) || stage.setup.contains(active) || stage.help.contains(active)) {
    return null;
  }

  return focusDescriptor(active);
}

function restoreStageFocus(descriptor) {
  if (!descriptor) {
    return;
  }

  const target = findFocusTarget(stage.root, descriptor);
  if (target && !target.disabled) {
    target.focus();
  }
}

function selectPage(pageId) {
  controller.goTo(pageId);
  settings.update({ currentPage: controller.currentPage });
  render();
}

controller.onChange(({ page }) => {
  if (page === 'radar' || page === 'regional') {
    refreshRadar();
  }
  render();
});

settings.subscribe((nextSettings, previousSettings) => {
  if (nextSettings.audioEnabled !== previousSettings.audioEnabled) {
    syncAudioSetting(nextSettings.audioEnabled);
  }

  if (nextSettings.rotationSeconds !== previousSettings.rotationSeconds) {
    controller.setRotationSeconds(nextSettings.rotationSeconds);
  }

  if (!samePageOrder(nextSettings.pageOrder, previousSettings.pageOrder)) {
    controller.setPages(nextSettings.pageOrder);
  }

  if (
    nextSettings.location?.key !== previousSettings.location?.key
    || nextSettings.weatherMode !== previousSettings.weatherMode
  ) {
    invalidateMapAssets();
    refreshWeather({ force: true });
    refreshRadar({ force: true });
  }

  render();
});

async function refreshWeather({ force = false } = {}) {
  const currentSettings = settings.get();
  const location = currentSettings.location;

  if (currentSettings.weatherMode === 'mock') {
    appState.weatherRequestId += 1;
    appState.report = fallbackWeatherReport;
    appState.weatherStatus = 'mock';
    appState.setupVisible = false;
    render();
    return true;
  }

  if (!location) {
    appState.report = fallbackWeatherReport;
    appState.weatherStatus = 'mock';
    appState.setupVisible = !appState.mockFallbackActive;
    render();
    return false;
  }

  const requestId = ++appState.weatherRequestId;
  const locationKey = location.key;
  const cached = weatherCache.read(location);
  if (cached && !force) {
    appState.report = cached.report;
    appState.weatherStatus = cached.isFresh ? 'cached' : 'stale';
    appState.weatherError = '';
    render();

    if (cached.isFresh) {
      return true;
    }
  } else {
    appState.weatherStatus = 'loading';
    render();
  }

  try {
    const liveReport = await fetchOpenMeteoReport(location, fallbackWeatherReport);
    if (!isActiveWeatherRequest(requestId, locationKey)) {
      return false;
    }

    weatherCache.write(location, liveReport);
    appState.report = liveReport;
    appState.weatherStatus = 'live';
    appState.weatherError = '';
    appState.setupVisible = false;
    invalidateMapAssets();
    refreshRadar({ force: true });
  } catch (error) {
    if (!isActiveWeatherRequest(requestId, locationKey)) {
      return false;
    }

    appState.weatherError = error.message || 'Weather data is unavailable.';

    if (cached) {
      appState.report = cached.report;
      appState.weatherStatus = 'stale';
    } else {
      appState.report = fallbackWeatherReport;
      appState.weatherStatus = 'mock';
      appState.setupVisible = true;
    }
  }

  render();
  return appState.weatherStatus !== 'mock';
}

async function refreshRadar({ force = false } = {}) {
  const currentSettings = settings.get();
  const location = currentSettings.weatherMode === 'live' && currentSettings.location
    ? currentSettings.location
    : appState.report.location;

  if (!isMapPageVisible()) {
    if (force) {
      invalidateMapAssets();
    }
    return false;
  }

  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    appState.radar = {
      status: 'unavailable',
      frames: [],
      error: 'Radar location is unavailable.'
    };
    render();
    return false;
  }

  if (!force && !radarNeedsRefresh(location)) {
    return true;
  }

  const requestId = ++appState.radarRequestId;
  refreshBaseMap(location, requestId);
  const cached = radarCache.read(location);
  if (cached && !force) {
    appState.radar = {
      ...cached.radar,
      status: cached.isFresh ? 'cached' : 'stale',
      error: ''
    };
    appState.radarLocationKey = mapLocationKey(location);
    preloadRadarFrames(appState.radar, () => renderLoadedRadarFrame(requestId));
    render();

    if (cached.isFresh) {
      return true;
    }
  } else if (!appState.radar.frames.length) {
    appState.radar = {
      status: 'loading',
      frames: [],
      error: ''
    };
    render();
  }

  try {
    const liveRadar = await fetchRainViewerRadar(location, { zoom: 6 });
    if (requestId !== appState.radarRequestId) {
      return false;
    }

    radarCache.write(location, liveRadar);
    appState.radar = {
      ...liveRadar,
      status: 'live',
      error: ''
    };
    appState.radarLocationKey = mapLocationKey(location);
    preloadRadarFrames(appState.radar, () => renderLoadedRadarFrame(requestId));
  } catch (error) {
    if (requestId !== appState.radarRequestId) {
      return false;
    }

    if (cached) {
      appState.radar = {
        ...cached.radar,
        status: 'stale',
        error: error.message || 'Radar data is stale.'
      };
      appState.radarLocationKey = mapLocationKey(location);
      preloadRadarFrames(appState.radar, () => renderLoadedRadarFrame(requestId));
    } else {
      appState.radar = {
        status: 'error',
        frames: [],
        error: error.message || 'Radar data is unavailable.'
      };
    }
  }

  render();
  return appState.radar.status !== 'error';
}

function refreshBaseMap(location, requestId) {
  const nextLocationKey = mapLocationKey(location);
  if (appState.baseMapLocationKey === nextLocationKey && appState.radarBaseMap && appState.regionalBaseMap) {
    return;
  }

  const baseMap = buildBaseMap(location, { zoom: 8 });
  appState.radarBaseMap = baseMap ? { ...baseMap, viewScale: 1.22 } : null;
  appState.regionalBaseMap = baseMap;
  appState.baseMapLocationKey = nextLocationKey;

  const scheduleBaseMapRender = () => {
    if (
      requestId !== appState.radarRequestId
      || appState.baseMapRenderId
      || !isMapPageVisible()
    ) {
      return;
    }

    appState.baseMapRenderId = window.requestAnimationFrame(() => {
      appState.baseMapRenderId = 0;
      if (requestId === appState.radarRequestId && isMapPageVisible()) {
        render();
      }
    });
  };

  preloadBaseMapTiles(appState.radarBaseMap, () => {
    scheduleBaseMapRender();
  });
}

function isMapPageVisible() {
  return controller.currentPage === 'radar' || controller.currentPage === 'regional';
}

function invalidateMapAssets() {
  appState.radarLocationKey = '';
  appState.baseMapLocationKey = '';
  appState.radar = {
    status: 'idle',
    frames: [],
    error: ''
  };
  appState.radarBaseMap = null;
  appState.regionalBaseMap = null;
}

function radarNeedsRefresh(location) {
  if (appState.radarLocationKey !== mapLocationKey(location)) {
    return true;
  }

  if (!appState.radar || appState.radar.status === 'idle' || appState.radar.status === 'loading') {
    return true;
  }

  if (!appState.radarBaseMap || !appState.regionalBaseMap) {
    return true;
  }

  const fetchedAt = Date.parse(appState.radar.fetchedAt || '');
  return !Number.isFinite(fetchedAt) || Date.now() - fetchedAt >= RADAR_REFRESH_MS;
}

function mapLocationKey(location) {
  if (!location) {
    return '';
  }

  if (location.key) {
    return location.key;
  }

  return `${Number(location.lat).toFixed(4)},${Number(location.lon).toFixed(4)}`;
}

function renderLoadedRadarFrame(requestId) {
  if (requestId !== appState.radarRequestId || !isMapPageVisible()) {
    return;
  }

  render();
}

function redrawRadarFrameOnly() {
  const currentSettings = settings.get();
  const frames = (appState.radar.frames || []).filter((frame) => frame.imageStatus === 'ready');
  const canvas = stage.content.querySelector('canvas.wx-radar');
  if (!canvas || !frames.length || currentSettings.reducedMotion) {
    return false;
  }

  const frameIndex = appState.radarFrameTick % frames.length;
  const frame = frames[frameIndex] || frames[0];
  drawRadar(canvas, frame, appState.report.location, {
    baseMap: appState.radarBaseMap,
    source: 'RainViewer radar'
  });
  updateRadarReadout(frame);
  return true;
}

function updateRadarReadout(frame) {
  const rows = Array.from(stage.content.querySelectorAll('.wx-radar-layout .wx-stat'));
  rows.forEach((row) => {
    const label = row.querySelector('.wx-stat__label')?.textContent;
    const value = row.querySelector('.wx-stat__value');
    if (label === 'Frame' && value) {
      value.textContent = frame.label || 'Waiting';
    }
  });
}

async function setZipLocation(zipCode) {
  const normalizedZip = String(zipCode || '').replace(/\D/g, '').slice(0, 5);
  const setupRequestId = ++appState.setupRequestId;
  appState.mockFallbackActive = false;
  appState.zipDraft = normalizedZip;
  appState.weatherStatus = 'loading';
  appState.weatherError = '';
  appState.setupVisible = true;
  render();

  try {
    const location = await resolveZipLocation(normalizedZip);
    if (setupRequestId !== appState.setupRequestId) {
      return;
    }

    const liveReport = await fetchOpenMeteoReport(location, fallbackWeatherReport);
    if (setupRequestId !== appState.setupRequestId) {
      return;
    }

    weatherCache.write(location, liveReport);
    settings.update({ location, weatherMode: 'live' }, { silent: true });
    appState.report = liveReport;
    appState.weatherStatus = 'live';
    appState.weatherError = '';
    appState.setupVisible = false;
    invalidateMapAssets();
    refreshRadar({ force: true });
    render();
  } catch (error) {
    if (setupRequestId !== appState.setupRequestId) {
      return;
    }

    appState.weatherStatus = 'error';
    appState.weatherError = error.message || 'ZIP lookup failed.';
    appState.setupVisible = true;
    render();
  }
}

function openLocationSetup() {
  appState.setupVisible = true;
  appState.mockFallbackActive = false;
  appState.zipDraft = settings.get().location?.zip || '';
  appState.weatherError = '';
  render();
}

function closeLocationSetup() {
  if (!settings.get().location) {
    return;
  }

  appState.setupVisible = false;
  appState.weatherError = '';
  render();
}

function useMockWeather() {
  appState.weatherRequestId += 1;
  appState.setupRequestId += 1;
  appState.report = fallbackWeatherReport;
  appState.weatherStatus = 'mock';
  appState.mockFallbackActive = true;
  appState.weatherError = '';
  appState.setupVisible = false;
  settings.update({ weatherMode: 'mock' }, { silent: true });
  invalidateMapAssets();
  refreshRadar({ force: true });
  render();
}

function previewFallbackWeather() {
  appState.weatherRequestId += 1;
  appState.setupRequestId += 1;
  appState.report = fallbackWeatherReport;
  appState.weatherStatus = 'mock';
  appState.mockFallbackActive = true;
  appState.weatherError = '';
  appState.setupVisible = false;
  invalidateMapAssets();
  refreshRadar({ force: true });
  render();
}

function isActiveWeatherRequest(requestId, locationKey) {
  return requestId === appState.weatherRequestId && settings.get().location?.key === locationKey;
}

function samePageOrder(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) {
    return false;
  }

  return first.every((page, index) => page === second[index]);
}

function toggleAudio() {
  setAudioEnabled(!settings.get().audioEnabled);
}

function setAudioEnabled(enabled) {
  if (settings.get().audioEnabled === enabled) {
    return;
  }

  settings.update({ audioEnabled: enabled });
  if (enabled) {
    audioBed.setEnabled(true, { userGesture: true });
  }
}

function setRotationSeconds(seconds) {
  settings.update({ rotationSeconds: seconds });
}

function syncAudioSetting(enabled) {
  audioBed.setEnabled(enabled);
  appState.audioStatus = enabled ? audioBed.getStatus() : 'off';
}

function unlockAudioBed() {
  audioBed.unlock();
}

bindKeyboardControls({
  target: window,
  stageElement: stage.root,
  getPages: () => controller.pages,
  isOverlayOpen: () => appState.setupVisible || appState.helpVisible,
  onNext: () => controller.next({ restartTimer: true }),
  onPrevious: () => controller.previous({ restartTimer: true }),
  onTogglePause: () => controller.togglePaused(),
  onToggleHelp: () => {
    appState.helpVisible = !appState.helpVisible;
    render();
  },
  onSelectPage: selectPage,
  onToggleUnits: () => settings.update({
    units: settings.get().units === 'imperial' ? 'metric' : 'imperial'
  }),
  onToggleScanlines: () => settings.update({
    scanlines: !settings.get().scanlines
  }),
  onToggleAudio: toggleAudio,
  onToggleMotion: () => settings.update({
    reducedMotion: !settings.get().reducedMotion
  }),
  onDigit: handleRemoteDigit,
  onBackspace: handleRemoteBackspace,
  onMoveFocus: (direction) => moveStageFocus(direction),
  onChangeLocation: openLocationSetup,
  onCloseOverlay: () => {
    if (appState.helpVisible) {
      appState.helpVisible = false;
      render();
      return true;
    }

    if (appState.setupVisible) {
      if (settings.get().location) {
        closeLocationSetup();
        return true;
      }

      if (appState.weatherStatus === 'error') {
        previewFallbackWeather();
        return true;
      }

      appState.weatherError = 'Enter a ZIP code to start local weather.';
      render();
      return true;
    }

    return false;
  },
  onExit: () => {
    if (window.webOS?.platformBack) {
      window.webOS.platformBack();
      return true;
    }

    window.close?.();
    return false;
  }
});

function handleRemoteDigit(digit) {
  if (appState.setupVisible) {
    return Boolean(digit);
  }

  return false;
}

function handleRemoteBackspace() {
  return appState.setupVisible;
}

function updateZipDraft(value, { renderOnChange = true } = {}) {
  const nextZip = String(value || '').replace(/\D/g, '').slice(0, 5);
  if (appState.zipDraft === nextZip && !appState.weatherError) {
    return;
  }

  appState.zipDraft = nextZip;
  appState.weatherError = '';
  if (renderOnChange) {
    render();
  }
}

function moveStageFocus(direction) {
  const focusScope = appState.setupVisible
    ? stage.setup
    : appState.helpVisible
      ? stage.help
      : stage.root;
  const controls = Array.from(focusScope.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((control) => !control.disabled && control.offsetParent !== null);
  if (!controls.length) {
    return false;
  }

  const activeIndex = controls.indexOf(document.activeElement);
  const nextIndex = activeIndex === -1
    ? 0
    : (activeIndex + direction + controls.length) % controls.length;
  controls[nextIndex].focus();
  return true;
}

window.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    controller.stop();
  } else {
    controller.start();
    render();
  }
});

window.addEventListener('pointerdown', unlockAudioBed, { passive: true });
window.addEventListener('keydown', unlockAudioBed);

window.addEventListener('storage', (event) => {
  if (event.key === settings.storageKey) {
    settings.reload();
  }
});

setInterval(() => {
  if (document.hidden) {
    return;
  }

  appState.lastRenderAt = new Date();
  renderClock(stage, appState.lastRenderAt);
  if (controller.currentPage === 'radar' && !settings.get().reducedMotion) {
    const radarFrameTick = Math.floor(Date.now() / 1300);
    if (radarFrameTick !== appState.radarFrameTick) {
      appState.radarFrameTick = radarFrameTick;
      if (!redrawRadarFrameOnly()) {
        render();
      }
    }
    return;
  }
}, 1000);

setInterval(() => {
  if (document.hidden) {
    return;
  }

  refreshWeather();
}, 30 * 60 * 1000);

setInterval(() => {
  if (document.hidden) {
    return;
  }

  if (isMapPageVisible()) {
    refreshRadar();
  }
}, 10 * 60 * 1000);

controller.start();
syncAudioSetting(initialSettings.audioEnabled);
render();
refreshWeather();
if (isMapPageVisible()) {
  refreshRadar();
}
}());
