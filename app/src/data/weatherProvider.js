(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const NWS_API_URL = 'https://api.weather.gov';
const CACHE_TTL_MS = 30 * 60 * 1000;
const REGIONAL_STATION_LIMIT = 8;
const FETCH_TIMEOUT_MS = 9000;
const NWS_TIMEOUT_MS = 3500;
const NWS_OBSERVATION_TIMEOUT_MS = 1500;

const weatherCodeLabels = new Map([
  [0, 'Sunny'],
  [1, 'Mostly sunny'],
  [2, 'Partly cloudy'],
  [3, 'Cloudy'],
  [45, 'Fog'],
  [48, 'Freezing fog'],
  [51, 'Light drizzle'],
  [53, 'Drizzle'],
  [55, 'Heavy drizzle'],
  [56, 'Freezing drizzle'],
  [57, 'Freezing drizzle'],
  [61, 'Light rain'],
  [63, 'Rain'],
  [65, 'Heavy rain'],
  [66, 'Freezing rain'],
  [67, 'Freezing rain'],
  [71, 'Light snow'],
  [73, 'Snow'],
  [75, 'Heavy snow'],
  [77, 'Snow grains'],
  [80, 'Rain showers'],
  [81, 'Rain showers'],
  [82, 'Heavy rain showers'],
  [85, 'Snow showers'],
  [86, 'Heavy snow showers'],
  [95, 'Thunderstorms'],
  [96, 'Thunderstorm with hail'],
  [99, 'Thunderstorm with hail']
]);

function createWeatherCache(storageKey) {
  return {
    read(location) {
      const cache = readCache(storageKey);
      if (!cache || !location || cache.locationKey !== location.key || !cache.report) {
        return null;
      }

      const fetchedAt = Date.parse(cache.fetchedAt);
      return {
        report: cache.report,
        fetchedAt: cache.fetchedAt,
        isFresh: Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_TTL_MS
      };
    },
    write(location, report) {
      writeCache(storageKey, {
        locationKey: location.key,
        fetchedAt: new Date().toISOString(),
        report
      });
    }
  };
}

async function resolveZipLocation(zipCode) {
  const normalizedZip = normalizeZip(zipCode);
  if (!normalizedZip) {
    throw new Error('Enter a 5 digit ZIP code.');
  }

  const url = new URL(GEOCODING_URL);
  url.searchParams.set('name', normalizedZip);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  url.searchParams.set('countryCode', 'US');

  const payload = await fetchJson(url);
  const match = pickLocation(payload.results, normalizedZip);
  if (!match) {
    throw new Error(`No Open-Meteo location found for ${normalizedZip}.`);
  }

  return normalizeLocation(match, normalizedZip);
}

async function fetchOpenMeteoReport(location, fallbackReport) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    throw new Error('Weather location is missing coordinates.');
  }

  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(location.lat));
  url.searchParams.set('longitude', String(location.lon));
  url.searchParams.set('current', [
    'temperature_2m',
    'relative_humidity_2m',
    'apparent_temperature',
    'is_day',
    'precipitation',
    'rain',
    'showers',
    'snowfall',
    'weather_code',
    'cloud_cover',
    'pressure_msl',
    'surface_pressure',
    'uv_index',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
  ].join(','));
  url.searchParams.set('hourly', [
    'temperature_2m',
    'relative_humidity_2m',
    'dew_point_2m',
    'apparent_temperature',
    'precipitation_probability',
    'weather_code',
    'uv_index',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'visibility'
  ].join(','));
  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'apparent_temperature_max',
    'apparent_temperature_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'uv_index_max',
    'uv_index_clear_sky_max',
    'sunrise',
    'sunset',
    'daylight_duration',
    'sunshine_duration',
    'wind_speed_10m_max',
    'wind_direction_10m_dominant'
  ].join(','));
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('precipitation_unit', 'inch');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '7');

  const forecast = await fetchJson(url);
  const airQuality = await fetchOpenMeteoAirQuality(location).catch(() => null);
  return adaptForecast(forecast, location, fallbackReport, airQuality);
}

async function fetchOpenMeteoAirQuality(location) {
  const url = new URL(AIR_QUALITY_URL);
  url.searchParams.set('latitude', String(location.lat));
  url.searchParams.set('longitude', String(location.lon));
  url.searchParams.set('current', [
    'us_aqi',
    'pm10',
    'pm2_5',
    'carbon_monoxide',
    'nitrogen_dioxide',
    'sulphur_dioxide',
    'ozone'
  ].join(','));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');

  return fetchJson(url);
}

async function fetchNwsAlerts(location) {
  const url = new URL(`${NWS_API_URL}/alerts/active`);
  url.searchParams.set('point', `${trimCoordinate(location.lat)},${trimCoordinate(location.lon)}`);

  const payload = await fetchJson(url);
  return uniqueAlerts((payload.features || [])
    .map((feature) => adaptNwsAlert(feature.properties || {}))
    .filter(Boolean));
}

async function fetchNwsPointMetadata(location) {
  const point = `${trimCoordinate(location.lat)},${trimCoordinate(location.lon)}`;
  return fetchJson(`${NWS_API_URL}/points/${point}`);
}

async function fetchNwsRegionalStations(location, fallbackRegional) {
  const pointMetadata = await fetchNwsPointMetadata(location);
  const stationsUrl = pointMetadata.properties?.observationStations;
  if (!stationsUrl) {
    throw new Error('NWS point metadata did not include observation stations.');
  }

  const stationsPayload = await fetchJson(stationsUrl);
  const stations = (stationsPayload.features || [])
    .map((feature) => ({
      ...(feature.properties || {}),
      coordinates: feature.geometry?.coordinates
    }))
    .filter(Boolean)
    .slice(0, REGIONAL_STATION_LIMIT);

  const observations = await Promise.allSettled(stations.map((station) => (
    withTimeout(fetchNwsLatestObservation(station), NWS_OBSERVATION_TIMEOUT_MS, 'NWS station observation timed out.')
  )));
  const observedStations = observations
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value)
    .filter(uniqueStationCity())
    .slice(0, REGIONAL_STATION_LIMIT);

  if (!observedStations.length) {
    throw new Error('No usable NWS station observations were returned.');
  }

  return {
    ...fallbackRegional,
    isDemo: false,
    stations: observedStations
  };
}

async function fetchNwsLatestObservation(station) {
  const stationId = station.stationIdentifier || station['@id']?.split('/').pop();
  if (!stationId) {
    return null;
  }

  const payload = await fetchJson(`${NWS_API_URL}/stations/${encodeURIComponent(stationId)}/observations/latest?require_qc=true`);
  return adaptNwsObservation(station, payload.properties || {});
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
    // Weather still renders from memory when a TV browser denies storage.
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function fetchJson(url) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutId;
  const request = window.fetch(url.toString(), {
    signal: controller?.signal,
    headers: {
      Accept: 'application/geo+json, application/json'
    }
  });
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller?.abort();
      reject(new Error('Weather request timed out.'));
    }, FETCH_TIMEOUT_MS);
  });

  const response = await Promise.race([request, timeout]).catch((error) => {
    if (error.name === 'AbortError') {
      throw new Error('Weather request timed out.');
    }
    throw error;
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });
  if (!response.ok) {
    throw new Error(`Weather request failed (${response.status}).`);
  }

  return response.json();
}

function normalizeZip(value) {
  const match = String(value || '').trim().match(/^\d{5}$/);
  return match ? match[0] : '';
}

function pickLocation(results = [], zipCode) {
  return results.find((result) => String(result.postcodes || '').includes(zipCode))
    || results.find((result) => result.country_code === 'US')
    || results[0];
}

function normalizeLocation(result, zipCode) {
  return {
    key: `zip:${zipCode}`,
    zip: zipCode,
    city: result.name || zipCode,
    region: result.admin1 || result.admin2 || '',
    country: result.country_code || 'US',
    lat: Number(result.latitude),
    lon: Number(result.longitude),
    elevationFt: result.elevation !== undefined ? Math.round(Number(result.elevation) * 3.28084) : null,
    timezone: result.timezone || ''
  };
}

async function adaptForecast(forecast, location, fallbackReport, airQuality) {
  const current = forecast.current || {};
  const hourly = forecast.hourly || {};
  const daily = forecast.daily || {};
  const nearestHourIndex = nearestIndex(hourly.time, current.time);
  const weatherCode = valueAt(current.weather_code, 0);
  const dailyRows = buildDaily(daily);
  const observedAt = current.time || new Date().toISOString();
  const airQualityReport = adaptAirQuality(airQuality, fallbackReport.almanac);
  const today = dailyRows[0] || {};
  const currentReport = {
    condition: conditionLabel(weatherCode),
    temperatureF: numberOr(current.temperature_2m, fallbackReport.current.temperatureF),
    feelsLikeF: numberOr(current.apparent_temperature, fallbackReport.current.feelsLikeF),
    dewPointF: numberOr(hourly.dew_point_2m?.[nearestHourIndex], fallbackReport.current.dewPointF),
    humidity: numberOr(current.relative_humidity_2m, fallbackReport.current.humidity),
    pressureIn: hpaToInches(current.pressure_msl || current.surface_pressure || fallbackReport.current.pressureIn / 0.02953),
    visibilityMi: visibilityToMiles(
      hourly.visibility?.[nearestHourIndex],
      forecast.hourly_units?.visibility,
      fallbackReport.current.visibilityMi
    ),
    uvIndex: numberOr(current.uv_index, numberOr(hourly.uv_index?.[nearestHourIndex], fallbackReport.current.uvIndex)),
    precipitationIn: numberOr(current.precipitation, 0),
    rainfallTodayIn: numberOr(today.precipitationSumIn, fallbackReport.almanac.rainfallTodayIn),
    ceiling: current.cloud_cover !== undefined ? `${Math.round(current.cloud_cover)}% clouds` : fallbackReport.current.ceiling,
    wind: {
      direction: cardinalDirection(current.wind_direction_10m),
      speedMph: numberOr(current.wind_speed_10m, fallbackReport.current.wind.speedMph),
      gustMph: numberOr(current.wind_gusts_10m, current.wind_speed_10m || fallbackReport.current.wind.gustMph)
    }
  };

  const regionalFallback = buildRegionalFallback(location, currentReport, fallbackReport.regional);
  const [alertsResult, regionalResult] = await Promise.allSettled([
    withTimeout(fetchNwsAlerts(location), NWS_TIMEOUT_MS, 'NWS alerts timed out.'),
    withTimeout(fetchNwsRegionalStations(location, regionalFallback), NWS_TIMEOUT_MS, 'NWS regional observations timed out.')
  ]);
  const alerts = alertsResult.status === 'fulfilled' ? alertsResult.value : [];
  const regional = regionalResult.status === 'fulfilled' ? regionalResult.value : regionalFallback;
  const liveSources = ['open-meteo'];
  if (alertsResult.status === 'fulfilled') {
    liveSources.push('nws-alerts');
  }
  if (regionalResult.status === 'fulfilled') {
    liveSources.push('nws-observations');
  }

  return {
    ...fallbackReport,
    meta: {
      source: liveSources.join('+'),
      fetchedAt: new Date().toISOString()
    },
    location: {
      city: location.city,
      region: location.region,
      country: location.country,
      station: 'Open-Meteo',
      lat: location.lat,
      lon: location.lon,
      elevationFt: location.elevationFt || Math.round((forecast.elevation || 0) * 3.28084)
    },
    observedAt,
    current: currentReport,
    alerts,
    hourly: buildHourly(hourly, current.time),
    daily: dailyRows.length ? dailyRows : fallbackReport.daily,
    almanac: {
      ...fallbackReport.almanac,
      sunrise: formatClockTime(daily.sunrise?.[0]) || fallbackReport.almanac.sunrise,
      sunset: formatClockTime(daily.sunset?.[0]) || fallbackReport.almanac.sunset,
      tomorrowSunrise: formatClockTime(daily.sunrise?.[1]) || '6:36 AM',
      tomorrowSunset: formatClockTime(daily.sunset?.[1]) || '8:18 PM',
      daylight: formatDuration(daily.daylight_duration?.[0]) || fallbackReport.almanac.daylight || '',
      sunshine: formatDuration(daily.sunshine_duration?.[0]) || fallbackReport.almanac.sunshine || '',
      rainfallTodayIn: numberOr(today.precipitationSumIn, fallbackReport.almanac.rainfallTodayIn),
      airQuality: airQualityReport.summary,
      airQualityDetails: airQualityReport.details
    },
    moon: buildMoonData(observedAt, forecast, location, fallbackReport.moon),
    regional
  };
}

function adaptAirQuality(airQuality, fallbackAlmanac) {
  const current = airQuality?.current || {};
  const aqi = Number(current.us_aqi);
  if (!Number.isFinite(aqi)) {
    return {
      summary: fallbackAlmanac.airQuality,
      details: fallbackAlmanac.airQualityDetails || null
    };
  }

  const roundedAqi = Math.round(aqi);
  const category = airQualityCategory(aqi);
  return {
    summary: `${category} (AQI ${roundedAqi})`,
    details: {
      aqi: roundedAqi,
      category,
      pm25: roundPollutant(current.pm2_5),
      pm10: roundPollutant(current.pm10),
      ozone: roundPollutant(current.ozone),
      nitrogenDioxide: roundPollutant(current.nitrogen_dioxide),
      source: 'Open-Meteo modeled AQ'
    }
  };
}

function airQualityCategory(aqi) {
  if (aqi <= 50) {
    return 'Good';
  }

  if (aqi <= 100) {
    return 'Moderate';
  }

  if (aqi <= 150) {
    return 'Unhealthy for sensitive groups';
  }

  if (aqi <= 200) {
    return 'Unhealthy';
  }

  if (aqi <= 300) {
    return 'Very unhealthy';
  }

  return 'Hazardous';
}

function roundPollutant(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : null;
}

function adaptNwsAlert(alert) {
  if (!alert.event && !alert.headline) {
    return null;
  }

  return {
    type: alert.event || 'Weather Alert',
    headline: alert.headline || alert.description || 'Weather alert in effect',
    expiresAt: alert.expires || alert.ends || alert.effective || '',
    severity: normalizeAlertSeverity(alert.severity),
    urgency: alert.urgency || '',
    certainty: alert.certainty || '',
    area: alert.areaDesc || '',
    instruction: alert.instruction || ''
  };
}

function uniqueAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = [
      normalizedAlertText(alert.type),
      normalizedAlertText(alert.headline),
      alert.expiresAt || ''
    ].join('|');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizedAlertText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function adaptNwsObservation(station, observation) {
  const tempF = celsiusToFahrenheit(observation.temperature?.value);
  if (!Number.isFinite(tempF)) {
    return null;
  }

  return {
    city: stationCity(station.name || station.stationIdentifier || 'Nearby'),
    tempF,
    condition: regionalCondition(observation.textDescription),
    wind: formatNwsWind(observation.windDirection?.value, observation.windSpeed?.value),
    lon: Number.isFinite(Number(station.coordinates?.[0])) ? Number(station.coordinates[0]) : null,
    lat: Number.isFinite(Number(station.coordinates?.[1])) ? Number(station.coordinates[1]) : null
  };
}

function regionalCondition(condition) {
  const normalized = String(condition || '').trim().toLowerCase();
  if (!normalized) {
    return 'Observed';
  }

  if (normalized.includes('thunder')) {
    return 'Storms';
  }

  if (normalized.includes('rain') || normalized.includes('drizzle')) {
    return normalized.includes('light') ? 'Light rain' : 'Rain';
  }

  if (normalized.includes('snow')) {
    return 'Snow';
  }

  if (normalized.includes('fog')) {
    return 'Fog';
  }

  if (normalized.includes('haze')) {
    return 'Haze';
  }

  if (normalized.includes('overcast')) {
    return 'Cloudy';
  }

  if (normalized.includes('mostly cloudy')) {
    return 'M cloudy';
  }

  if (normalized.includes('partly cloudy')) {
    return 'P cloudy';
  }

  if (normalized.includes('mostly clear')) {
    return 'M clear';
  }

  if (normalized.includes('fair')) {
    return 'Fair';
  }

  if (normalized.includes('clear') || normalized.includes('sunny')) {
    return 'Clear';
  }

  return titleCaseWords(normalized).slice(0, 12).trim();
}

function uniqueStationCity() {
  const seen = new Set();
  return (station) => {
    const key = String(station.city || '').toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  };
}

function buildRegionalFallback(location, current, fallbackRegional) {
  return {
    ...fallbackRegional,
    isDemo: true,
    stations: [
      {
        city: location.city,
        tempF: current.temperatureF,
        condition: current.condition,
        wind: `${current.wind.direction} ${Math.round(current.wind.speedMph)}`
      },
      ...fallbackRegional.stations.slice(0, 7)
    ]
  };
}

function buildHourly(hourly, currentTime) {
  const start = Math.max(0, nearestIndex(hourly.time, currentTime));
  return (hourly.time || []).slice(start, start + 8).map((time, offset) => {
    const index = start + offset;
    return {
      time: formatHour(time),
      condition: conditionLabel(hourly.weather_code?.[index]),
      tempF: numberOr(hourly.temperature_2m?.[index], 0),
      feelsLikeF: numberOr(hourly.apparent_temperature?.[index], numberOr(hourly.temperature_2m?.[index], 0)),
      dewPointF: numberOr(hourly.dew_point_2m?.[index], 0),
      humidity: numberOr(hourly.relative_humidity_2m?.[index], 0),
      precipitation: numberOr(hourly.precipitation_probability?.[index], 0),
      uvIndex: numberOr(hourly.uv_index?.[index], 0),
      windMph: numberOr(hourly.wind_speed_10m?.[index], 0)
    };
  });
}

function buildDaily(daily) {
  return (daily.time || []).map((time, index) => ({
    day: dayLabel(time, index),
    condition: conditionLabel(daily.weather_code?.[index]),
    highF: numberOr(daily.temperature_2m_max?.[index], 0),
    lowF: numberOr(daily.temperature_2m_min?.[index], 0),
    feelsLikeHighF: numberOr(daily.apparent_temperature_max?.[index], numberOr(daily.temperature_2m_max?.[index], 0)),
    feelsLikeLowF: numberOr(daily.apparent_temperature_min?.[index], numberOr(daily.temperature_2m_min?.[index], 0)),
    precipitation: numberOr(daily.precipitation_probability_max?.[index], 0),
    precipitationSumIn: numberOr(daily.precipitation_sum?.[index], 0),
    uvIndexMax: numberOr(daily.uv_index_max?.[index], 0),
    clearSkyUvIndexMax: numberOr(daily.uv_index_clear_sky_max?.[index], 0),
    daylightHours: durationHours(daily.daylight_duration?.[index]),
    sunshineHours: durationHours(daily.sunshine_duration?.[index]),
    wind: `${cardinalDirection(daily.wind_direction_10m_dominant?.[index])} ${Math.round(numberOr(daily.wind_speed_10m_max?.[index], 0))}`
  }));
}

function buildMoonData(observedAt, forecast, location, fallbackMoon) {
  try {
    if (!RetroWeather.astronomy || typeof RetroWeather.astronomy.buildMoonData !== 'function') {
      return fallbackMoon;
    }

    return RetroWeather.astronomy.buildMoonData({
      date: observedAt,
      lat: location.lat,
      lon: location.lon,
      timezone: forecast.timezone || location.timezone,
      fallback: fallbackMoon
    });
  } catch {
    return fallbackMoon;
  }
}

function nearestIndex(times = [], currentTime) {
  if (!times.length || !currentTime) {
    return 0;
  }

  const current = Date.parse(currentTime);
  if (!Number.isFinite(current)) {
    return 0;
  }

  let bestIndex = 0;
  let bestDistance = Infinity;
  times.forEach((time, index) => {
    const distance = Math.abs(Date.parse(time) - current);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function conditionLabel(code) {
  return weatherCodeLabels.get(Number(code)) || 'Fair';
}

function normalizeAlertSeverity(severity) {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'extreme' || normalized === 'severe') {
    return 'high';
  }

  if (normalized === 'moderate') {
    return 'medium';
  }

  return 'low';
}

function stationCity(name) {
  const cleaned = String(name || 'Nearby')
    .replace(/\bTX\b/gi, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+\/\s+.*$/, '')
    .replace(/,.*/, '')
    .replace(/\bCamp Mabry\b/i, '')
    .replace(/\bBergstrom\b/i, '')
    .replace(/\b(?:Dwight D\. Eisenhower|Jabara|Captain Jack Thomas|Rusty Allen|Strother)\b.*$/i, '')
    .replace(/\b(?:Municipal|International|Regional|National|Executive|Resort|Airpark|Airport|Field|City\/County)\b.*$/i, '')
    .replace(/\s+Weather Observing Station\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return collapseRepeatedPlaceName(cleaned) || 'Nearby';
}

function collapseRepeatedPlaceName(name) {
  const normalized = String(name || '').trim();
  const cityRepeat = normalized.match(/^(.+?)\s+City\s+\1$/i);
  if (cityRepeat) {
    return cityRepeat[1];
  }

  const words = normalized.split(/\s+/);
  const midpoint = words.length / 2;
  if (Number.isInteger(midpoint)) {
    const left = words.slice(0, midpoint).join(' ').toLowerCase();
    const right = words.slice(midpoint).join(' ').toLowerCase();
    if (left === right) {
      return words.slice(0, midpoint).join(' ');
    }
  }

  return normalized;
}

function titleCaseWords(value) {
  return String(value || '').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function formatNwsWind(directionDegrees, speedMetersPerSecond) {
  const speedMph = metersPerSecondToMph(speedMetersPerSecond);
  if (!speedMph || speedMph < 1) {
    return 'Calm 0';
  }

  return `${cardinalDirection(directionDegrees)} ${Math.round(speedMph)}`;
}

function celsiusToFahrenheit(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric * 9 / 5 + 32) * 10) / 10 : null;
}

function metersPerSecondToMph(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric * 2.23694 : null;
}

function trimCoordinate(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, '');
}

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hpaToInches(value) {
  return Math.round(numberOr(value, 1013.25) * 0.02953 * 100) / 100;
}

function visibilityToMiles(value, unit, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const divisor = unit === 'ft' ? 5280 : 1609.344;
  return Math.round(Number(value) / divisor * 10) / 10;
}

function durationHours(seconds) {
  const numeric = Number(seconds);
  return Number.isFinite(numeric) ? Math.round(numeric / 360) / 10 : null;
}

function formatDuration(seconds) {
  const hours = durationHours(seconds);
  if (!Number.isFinite(hours)) {
    return '';
  }

  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (!wholeHours) {
    return `${minutes} min`;
  }

  return minutes ? `${wholeHours}h ${minutes}m` : `${wholeHours}h`;
}

function cardinalDirection(degrees) {
  const numeric = Number(degrees);
  if (!Number.isFinite(numeric)) {
    return 'Calm';
  }

  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(numeric / 22.5) % directions.length];
}

function formatClockTime(value) {
  if (!value) {
    return '';
  }

  const match = String(value).match(/T(\d{2}):(\d{2})/);
  if (!match) {
    return '';
  }

  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function formatHour(value) {
  const match = String(value || '').match(/T(\d{2}):/);
  if (!match) {
    return '';
  }

  const hour = Number(match[1]);
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

function dayLabel(value, index) {
  if (index === 0) {
    return 'Today';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short'
  }).format(parseLocalDate(value));
}

function parseLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date(value);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function valueAt(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

Object.assign(RetroWeather, {
  createWeatherCache,
  fetchOpenMeteoReport,
  resolveZipLocation
});
}());
