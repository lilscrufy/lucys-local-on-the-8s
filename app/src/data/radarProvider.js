(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});

const RAINVIEWER_API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const RADAR_CACHE_TTL_MS = 10 * 60 * 1000;
const RADAR_FRAME_LIMIT = 6;
const RADAR_TILE_SIZE = 512;
const RADAR_COLOR_SCHEME = 2;
const RADAR_OPTIONS = '1_1';
const BASEMAP_TILE_SIZE = 256;
// Official tile.openstreetmap.org returns an Access Denied image when the
// client has no HTTP Referer. Packaged webOS apps do not send one.
const BASEMAP_TILE_SOURCES = [
  {
    name: 'OpenStreetMap.de',
    url(zoom, x, y) {
      return `https://tile.openstreetmap.de/${zoom}/${x}/${y}.png`;
    }
  },
  {
    name: 'OpenStreetMap.fr',
    url(zoom, x, y) {
      return `https://a.tile.openstreetmap.fr/osmfr/${zoom}/${x}/${y}.png`;
    }
  }
];
const FETCH_TIMEOUT_MS = 9000;

function createRadarCache(storageKey) {
  return {
    read(location) {
      const cache = readCache(storageKey);
      if (!cache || !sameLocation(cache.locationKey, location) || !cache.radar) {
        return null;
      }

      const fetchedAt = Date.parse(cache.fetchedAt);
      const isFresh = Number.isFinite(fetchedAt) && Date.now() - fetchedAt < RADAR_CACHE_TTL_MS;
      return {
        radar: cache.radar,
        fetchedAt: cache.fetchedAt,
        isFresh
      };
    },
    write(location, radar) {
      writeCache(storageKey, {
        locationKey: locationKey(location),
        fetchedAt: new Date().toISOString(),
        radar: stripRadarImages(radar)
      });
    }
  };
}

async function fetchRainViewerRadar(location, options = {}) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    throw new Error('Radar location is missing coordinates.');
  }

  const payload = await fetchJson(RAINVIEWER_API_URL);
  const host = String(payload.host || '').replace(/\/$/, '');
  const pastFrames = payload.radar?.past || [];
  if (!host || !pastFrames.length) {
    throw new Error('RainViewer radar frames are unavailable.');
  }

  const zoom = Number.isFinite(options.zoom) ? options.zoom : 6;
  const frames = pastFrames.slice(-RADAR_FRAME_LIMIT).map((frame) => {
    const time = Number(frame.time);
    const path = String(frame.path || '');
    return {
      source: 'RainViewer',
      time,
      timeIso: Number.isFinite(time) ? new Date(time * 1000).toISOString() : '',
      label: formatRadarTime(time),
      imageUrl: `${host}${path}/${RADAR_TILE_SIZE}/${zoom}/${trimCoordinate(location.lat)}/${trimCoordinate(location.lon)}/${RADAR_COLOR_SCHEME}/${RADAR_OPTIONS}.png`
    };
  }).filter((frame) => frame.imageUrl.includes('/v2/radar/'));

  if (!frames.length) {
    throw new Error('RainViewer radar frames are malformed.');
  }

  return {
    source: 'RainViewer',
    attribution: 'RainViewer',
    fetchedAt: new Date().toISOString(),
    generatedAt: Number.isFinite(Number(payload.generated))
      ? new Date(Number(payload.generated) * 1000).toISOString()
      : '',
    zoom,
    frames
  };
}

function preloadRadarFrames(radar, onFrameReady) {
  if (!radar || !Array.isArray(radar.frames)) {
    return radar;
  }

  radar.frames.forEach((frame) => {
    if (!frame.imageUrl || frame.image) {
      return;
    }

    frame.imageStatus = 'loading';
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      frame.imageStatus = 'ready';
      if (typeof onFrameReady === 'function') {
        onFrameReady(frame);
      }
    };
    image.onerror = () => {
      frame.imageStatus = 'error';
      if (typeof onFrameReady === 'function') {
        onFrameReady(frame);
      }
    };
    image.src = frame.imageUrl;
    frame.image = image;
  });

  return radar;
}

function buildBaseMap(location, options = {}) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    return null;
  }

  const zoom = Number.isFinite(options.zoom) ? options.zoom : 7;
  const center = lonLatToWorldPixel(location.lon, location.lat, zoom);
  const tileCount = 2 ** zoom;
  const minX = Math.floor((center.x - 640) / BASEMAP_TILE_SIZE);
  const maxX = Math.floor((center.x + 640) / BASEMAP_TILE_SIZE);
  const minY = Math.max(0, Math.floor((center.y - 448) / BASEMAP_TILE_SIZE));
  const maxY = Math.min(tileCount - 1, Math.floor((center.y + 448) / BASEMAP_TILE_SIZE));
  const tiles = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const wrappedX = wrapTileX(x, tileCount);
      tiles.push({
        x,
        y,
        zoom,
        tileX: wrappedX,
        url: BASEMAP_TILE_SOURCES[0].url(zoom, wrappedX, y)
      });
    }
  }

  return {
    source: 'OpenStreetMap',
    attribution: 'Map data OpenStreetMap',
    zoom,
    tileSize: BASEMAP_TILE_SIZE,
    center,
    tiles
  };
}

function preloadBaseMapTiles(baseMap, onTileReady) {
  if (!baseMap || !Array.isArray(baseMap.tiles)) {
    return baseMap;
  }

  baseMap.tiles.forEach((tile) => {
    if (tile.image) {
      return;
    }

    loadBaseMapTile(tile, 0, onTileReady);
  });

  return baseMap;
}

function loadBaseMapTile(tile, sourceIndex, onTileReady) {
  const source = BASEMAP_TILE_SOURCES[sourceIndex];
  if (!source || !Number.isFinite(tile.zoom) || !Number.isFinite(tile.tileX) || !Number.isFinite(tile.y)) {
    tile.imageStatus = 'error';
    if (typeof onTileReady === 'function') {
      onTileReady(tile);
    }
    return;
  }

  tile.url = source.url(tile.zoom, tile.tileX, tile.y);
  tile.imageStatus = 'loading';
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    tile.imageStatus = 'ready';
    if (typeof onTileReady === 'function') {
      onTileReady(tile);
    }
  };
  image.onerror = () => {
    tile.image = null;
    loadBaseMapTile(tile, sourceIndex + 1, onTileReady);
  };
  image.src = tile.url;
  tile.image = image;
}

function stripRadarImages(radar) {
  if (!radar || !Array.isArray(radar.frames)) {
    return radar;
  }

  return {
    ...radar,
    frames: radar.frames.map(({ image, imageStatus, ...frame }) => ({
      ...frame,
      imageStatus: imageStatus === 'ready' ? 'loading' : imageStatus
    }))
  };
}

function sameLocation(locationKeyValue, location) {
  return locationKeyValue && locationKeyValue === locationKey(location);
}

function locationKey(location) {
  if (!location) {
    return '';
  }

  if (location.key) {
    return location.key;
  }

  return `${trimCoordinate(location.lat)},${trimCoordinate(location.lon)}`;
}

function formatRadarTime(unixSeconds) {
  const time = Number(unixSeconds);
  if (!Number.isFinite(time)) {
    return 'Recent';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(time * 1000));
}

function trimCoordinate(value) {
  return Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function lonLatToWorldPixel(lon, lat, zoom) {
  const sinLat = Math.sin(clamp(lat, -85.0511, 85.0511) * Math.PI / 180);
  const scale = BASEMAP_TILE_SIZE * (2 ** zoom);
  return {
    x: (lon + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}

function wrapTileX(x, tileCount) {
  return ((x % tileCount) + tileCount) % tileCount;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

async function fetchJson(url) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutId;
  const request = window.fetch(url.toString(), {
    signal: controller?.signal,
    headers: {
      Accept: 'application/json'
    }
  });
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller?.abort();
      reject(new Error('Radar request timed out.'));
    }, FETCH_TIMEOUT_MS);
  });

  const response = await Promise.race([request, timeout]).catch((error) => {
    if (error.name === 'AbortError') {
      throw new Error('Radar request timed out.');
    }
    throw error;
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });
  if (!response.ok) {
    throw new Error(`Radar request failed (${response.status}).`);
  }

  return response.json();
}

function readCache(storageKey) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function writeCache(storageKey, cache) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(cache));
  } catch {
    // Radar still works from memory when a TV browser denies storage.
  }
}

Object.assign(RetroWeather, {
  buildBaseMap,
  createRadarCache,
  fetchRainViewerRadar,
  preloadBaseMapTiles,
  preloadRadarFrames
});
}());
