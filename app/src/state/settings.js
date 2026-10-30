(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});
const { pageCatalog } = RetroWeather;

const defaultSettings = {
  units: 'imperial',
  rotationSeconds: 15,
  audioEnabled: false,
  scanlines: true,
  reducedMotion: false,
  location: null,
  weatherMode: 'live',
  currentPage: 'extended',
  pageOrder: pageCatalog.map((page) => page.id)
};

function createSettingsStore(storageKey) {
  let value = readSettings(storageKey);
  const subscribers = new Set();

  function notify(previous) {
    subscribers.forEach((subscriber) => subscriber(value, previous));
  }

  return {
    storageKey,
    get() {
      return value;
    },
    update(patch, options = {}) {
      const previous = value;
      value = normalizeSettings({ ...value, ...patch });
      writeSettings(storageKey, value);

      if (!options.silent) {
        notify(previous);
      }
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    reload() {
      const previous = value;
      value = readSettings(storageKey);
      notify(previous);
    },
    reset() {
      const previous = value;
      value = { ...defaultSettings };
      writeSettings(storageKey, value);
      notify(previous);
    }
  };
}

function readSettings(storageKey) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return normalizeSettings(stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings);
  } catch {
    return { ...defaultSettings };
  }
}

function writeSettings(storageKey, settings) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Some TV browsers can deny storage; the in-memory settings still work.
  }
}

function normalizeSettings(settings) {
  const validPages = new Set(pageCatalog.map((page) => page.id));
  const pageOrder = Array.isArray(settings.pageOrder)
    ? settings.pageOrder.filter((page) => validPages.has(page))
    : defaultSettings.pageOrder;
  const uniquePageOrder = [...new Set(pageOrder)];
  const migratedPageOrder = [
    ...uniquePageOrder,
    ...defaultSettings.pageOrder.filter((page) => !uniquePageOrder.includes(page))
  ];

  return {
    ...defaultSettings,
    ...settings,
    units: settings.units === 'metric' ? 'metric' : 'imperial',
    rotationSeconds: normalizeRotationSeconds(settings.rotationSeconds),
    location: normalizeLocation(settings.location),
    weatherMode: settings.weatherMode === 'mock' ? 'mock' : 'live',
    currentPage: validPages.has(settings.currentPage) ? settings.currentPage : defaultSettings.currentPage,
    pageOrder: migratedPageOrder.length ? migratedPageOrder : defaultSettings.pageOrder
  };
}

function normalizeRotationSeconds(value) {
  const seconds = clampNumber(value, 5, 30, defaultSettings.rotationSeconds);
  return seconds === 9 ? defaultSettings.rotationSeconds : seconds;
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') {
    return null;
  }

  const zip = String(location.zip || '').trim();
  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!/^\d{5}$/.test(zip) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    key: location.key || `zip:${zip}`,
    zip,
    city: String(location.city || zip),
    region: String(location.region || ''),
    country: String(location.country || 'US'),
    lat,
    lon,
    elevationFt: Number.isFinite(Number(location.elevationFt)) ? Number(location.elevationFt) : null,
    timezone: String(location.timezone || '')
  };
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

RetroWeather.createSettingsStore = createSettingsStore;
}());
