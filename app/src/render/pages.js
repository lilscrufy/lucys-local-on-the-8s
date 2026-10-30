(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});
const {
  clear,
  createElement,
  drawRadar,
  drawRegionalMap,
  formatPrecipitation,
  formatSpeed,
  formatTemperature,
  pageCatalog,
  panel,
  resolveWeatherIconKey,
  stat
} = RetroWeather;

const pageTitles = new Map(pageCatalog.map((page) => [page.id, page.title]));

const renderers = {
  current: renderCurrent,
  hourly: renderHourly,
  extended: renderExtended,
  regional: renderRegional,
  radar: renderRadar,
  almanac: renderAlmanac,
  air: renderAirQuality,
  moon: renderMoon,
  settings: renderSettings
};

function renderPage(target, pageId, context) {
  clear(target);
  target.dataset.page = pageId;

  const page = createElement('article', {
    className: `wx-page wx-page--${pageId}`,
    attrs: {
      'aria-labelledby': `page-title-${pageId}`
    }
  });

  page.append(createElement('h1', {
    className: 'wx-page__title',
    text: pageTitles.get(pageId) || pageId,
    attrs: { id: `page-title-${pageId}` }
  }));

  const renderer = renderers[pageId] || renderCurrent;
  renderer(page, context);
  target.append(page);
}

function renderCurrent(page, { report, settings }) {
  const { current } = report;
  const hero = createElement('section', { className: 'wx-current conditions-panel current-conditions' }, [
    createElement('p', { className: 'wx-current__eyebrow', text: 'Right Now' }),
    createElement('div', { className: 'wx-current__temp temperature current-temp hero-temp', text: formatTemperature(current.temperatureF, settings.units) }),
    weatherIcon(current.condition),
    createElement('div', { className: 'wx-current__condition condition-label weather-summary', text: current.condition }),
    createElement('div', {
      className: 'wx-current__feels',
      text: `Feels like ${formatTemperature(current.feelsLikeF, settings.units)}`
    })
  ]);

  const stats = panel('Observation', [
    stat('Wind', `${current.wind.direction} ${formatSpeed(current.wind.speedMph, settings.units)}`, `gust ${formatSpeed(current.wind.gustMph, settings.units)}`),
    stat('Humidity', `${current.humidity}%`, `dew point ${formatTemperature(current.dewPointF, settings.units)}`),
    stat('Pressure', `${current.pressureIn.toFixed(2)} in`, 'steady'),
    stat('Ceiling', current.ceiling || 'Unlimited'),
    stat('Visibility', settings.units === 'metric' ? `${Math.round(current.visibilityMi * 1.609)} km` : `${current.visibilityMi} Mi`),
    stat('UV Index', Math.round(current.uvIndex)),
    stat('Rain Today', formatPrecipitation(current.rainfallTodayIn, settings.units), `now ${formatPrecipitation(current.precipitationIn, settings.units)}`)
  ], 'wx-panel--stats stats-grid');

  const alerts = (report.alerts || []).slice(0, 2);
  const alertPanel = alerts.length
    ? panel('Advisory', alerts.map((alert) => (
      createElement('p', {
        className: `wx-alert wx-alert--${alert.severity}`,
        text: alertText(alert)
      })
    )), 'is-alert alert-panel')
    : document.createTextNode('');

  page.append(createElement('div', { className: 'wx-layout wx-layout--current' }, [hero, stats, alertPanel]));
}

function alertText(alert) {
  const type = String(alert.type || '').trim();
  const headline = String(alert.headline || '').trim();
  const confidence = [alert.urgency, alert.certainty].filter(Boolean).join(' / ');
  const suffix = confidence ? ` (${confidence})` : '';
  if (!type) {
    return `${headline || 'Weather alert in effect'}${suffix}`;
  }
  if (!headline || headline.toLowerCase().startsWith(type.toLowerCase())) {
    return `${headline || type}${suffix}`;
  }

  return `${type}: ${headline}${suffix}`;
}

function renderHourly(page, { report, settings }) {
  const now = report.hourly[0];
  const next = report.hourly[1] || now;
  const tomorrow = report.daily[1] || report.daily[0];
  const outlook = report.daily.slice(2, 4).map((day) => day.condition.toLowerCase()).join(', then ');

  page.append(
    createElement('section', { className: 'wx-text-forecast' }, [
      createElement('p', {
        className: 'wx-text-forecast__line',
        text: `Now...${now.condition}. Temperature ${formatTemperature(now.tempF, settings.units)}. Feels like ${formatTemperature(now.feelsLikeF ?? now.tempF, settings.units)}.`
      }),
      createElement('p', {
        className: 'wx-text-forecast__line',
        text: `${next.time}...${next.precipitation}% rain chance. Dew point ${formatTemperature(next.dewPointF ?? now.dewPointF ?? next.tempF, settings.units)}. Wind ${formatSpeed(next.windMph, settings.units)}.`
      }),
      createElement('p', {
        className: 'wx-text-forecast__line',
        text: `${tomorrow.day}...${tomorrow.condition}. High ${formatTemperature(tomorrow.highF, settings.units)}. UV index ${Math.round(tomorrow.uvIndexMax || 0)}.`
      }),
      createElement('p', {
        className: 'wx-text-forecast__line',
        text: `Outlook...${outlook || 'seasonable local weather'}. Highest rain total ${formatPrecipitation(maxDailyRain(report.daily), settings.units)}.`
      })
    ])
  );
}

function renderExtended(page, { report, settings }) {
  const cards = report.daily.slice(0, 3).map((day) => (
    createElement('section', { className: 'wx-day-card forecast-card day-card' }, [
      createElement('h2', { className: 'wx-day-card__day forecast-day', text: day.day }),
      weatherIcon(day.condition),
      createElement('p', { className: 'wx-day-card__condition', text: day.condition }),
      createElement('p', {
        className: 'wx-day-card__temps forecast-temp',
        text: `${formatTemperature(day.highF, settings.units)} / ${formatTemperature(day.lowF, settings.units)}`
      }),
      createElement('p', {
        className: 'wx-day-card__detail',
        text: `Rain ${day.precipitation}% | UV ${Math.round(day.uvIndexMax || 0)}`
      }),
      createElement('p', {
        className: 'wx-day-card__detail',
        text: `Wind ${day.wind}`
      })
    ])
  ));

  page.append(createElement('div', { className: 'wx-day-grid' }, cards));
}

function renderRegional(page, { report, settings, regionalBaseMap, radar }) {
  const canvas = createElement('canvas', {
    className: 'wx-regional-map map-panel weather-map',
    attrs: {
      width: 760,
      height: 420,
      role: 'img',
      'aria-label': 'Regional conditions map with nearby stations and precipitation shading'
    }
  });
  drawRegionalMap(canvas, report, settings, { baseMap: regionalBaseMap, radar });

  const stations = report.regional.stations.slice(0, 4);
  page.append(createElement('div', { className: 'wx-regional-map-layout' }, [
    canvas,
    panel('Regional', [
      createElement('p', {
        className: `wx-radar-status${report.regional.isDemo ? ' wx-radar-status--fallback' : ''}`,
        text: report.regional.isDemo ? 'Demo Observations' : 'NWS Observations'
      }),
      ...stations.map((station) => stat(
        station.city,
        formatTemperature(station.tempF, settings.units),
        `${station.condition.toUpperCase()} ${station.wind}`
      ))
    ])
  ]));
}

function renderRadar(page, { report, settings, radar, radarBaseMap }) {
  const liveFrames = radar?.frames || [];
  const readyFrames = liveFrames.filter((frame) => frame.imageStatus === 'ready');
  const frames = readyFrames;
  const frameIndex = settings.reducedMotion ? 0 : Math.floor(Date.now() / 1300) % frames.length;
  const frame = frames[frameIndex] || {};
  const usingLiveRadar = readyFrames.length > 0;
  const radarStatus = radarStatusLabel(radar, usingLiveRadar);
  const radarView = usingLiveRadar
    ? createRadarCanvas(frame, report.location, radarBaseMap)
    : createRadarPlaceholder(radarStatus);

  page.append(
    createElement('div', { className: 'wx-radar-layout' }, [
      radarView,
      panel('Loop', [
        createElement('p', {
          className: `wx-radar-status${usingLiveRadar ? '' : ' wx-radar-status--fallback'}`,
          text: radarStatus
        }),
        stat('Source', 'RainViewer'),
        stat('Frame', frame.label || 'Waiting'),
        stat('Motion', usingLiveRadar ? 'Loop' : 'Pending'),
        stat('Rate', usingLiveRadar ? 'Returns' : 'Pending')
      ])
    ])
  );
}

function createRadarCanvas(frame, location, radarBaseMap) {
  const canvas = createElement('canvas', {
    className: 'wx-radar radar-map weather-map',
    attrs: {
      width: 820,
      height: 420,
      role: 'img',
      'aria-label': 'Animated radar loop showing recent precipitation returns'
    }
  });

  drawRadar(canvas, frame, location, {
    baseMap: radarBaseMap,
    source: 'RainViewer radar'
  });

  return canvas;
}

function createRadarPlaceholder(status) {
  return createElement('section', {
    className: 'wx-radar-loading',
    attrs: {
      role: 'status',
      'aria-live': 'polite'
    }
  }, [
    createElement('p', { className: 'wx-radar-loading__title', text: status }),
    createElement('p', { className: 'wx-radar-loading__copy', text: status === 'Loading Radar' ? 'Waiting for live precipitation frames' : 'Live precipitation is not available' })
  ]);
}

function radarStatusLabel(radar, usingLiveRadar) {
  const status = radar?.status;
  if (status === 'stale') {
    return 'Stale Radar';
  }
  if (usingLiveRadar) {
    return 'Live Radar';
  }

  if (status === 'loading') {
    return 'Loading Radar';
  }
  if (status === 'error') {
    return 'Radar Offline';
  }
  if (status === 'unavailable') {
    return 'Radar Unavailable';
  }

  return 'Demo Radar';
}

function renderAlmanac(page, { report, settings }) {
  const { almanac } = report;
  const { moon } = report;

  page.append(createElement('div', { className: 'wx-layout wx-layout--almanac' }, [
    createElement('section', { className: 'wx-sun-times' }, [
      createElement('div', { className: 'wx-sun-labels' }, [
        createElement('p', { text: 'Sunrise:' }),
        createElement('p', { text: 'Sunset:' })
      ]),
      createElement('div', { className: 'wx-sun-day' }, [
        createElement('h2', { text: 'Today' }),
        createElement('p', { text: almanac.sunrise }),
        createElement('p', { text: almanac.sunset })
      ]),
      createElement('div', { className: 'wx-sun-day' }, [
        createElement('h2', { text: 'Tomorrow' }),
        createElement('p', { text: almanac.tomorrowSunrise || '6:36 AM' }),
        createElement('p', { text: almanac.tomorrowSunset || '8:18 PM' })
      ])
    ]),
    createElement('section', { className: 'wx-moon-data' }, [
      createElement('h2', { text: 'Moon Data:' }),
      moonPhase('New', moon.nextNewMoon || 'May 16', 'new'),
      moonPhase('First', moon.nextFirstQuarter || 'May 23', 'first'),
      moonPhase('Full', moon.nextFullMoon || 'May 31', 'full'),
      moonPhase('Last', moon.nextLastQuarter || 'Jun 8', 'last')
    ])
  ]));
}

function renderAirQuality(page, { report, settings }) {
  const { almanac, current } = report;
  const aq = almanac.airQualityDetails || {};
  const today = report.daily[0] || {};
  const tomorrow = report.daily[1] || today;
  const aqi = Number.isFinite(Number(aq.aqi)) ? Math.round(Number(aq.aqi)) : '--';
  const category = aq.category || String(almanac.airQuality || 'Unavailable').replace(/\s*\(AQI.*?\)\s*$/, '');

  page.append(createElement('div', { className: 'wx-air-layout' }, [
    createElement('section', { className: 'wx-air-hero' }, [
      createElement('p', { className: 'wx-air-hero__label', text: 'Modeled Air Quality' }),
      createElement('div', { className: 'wx-air-hero__aqi', text: String(aqi) }),
      createElement('p', { className: 'wx-air-hero__category', text: category }),
      createElement('p', { className: 'wx-air-hero__source', text: aq.source || 'Open-Meteo modeled AQ' })
    ]),
    createElement('section', { className: 'wx-air-summary' }, [
      stat('UV Max', Math.round(today.uvIndexMax || 0), `now ${Math.round(current.uvIndex || 0)}`),
      stat('Humidity', `${current.humidity}%`, `dew ${formatTemperature(current.dewPointF, settings.units)}`),
      stat('Visibility', settings.units === 'metric' ? `${Math.round(current.visibilityMi * 1.609)} km` : `${current.visibilityMi} Mi`),
      stat('Rain Today', formatPrecipitation(almanac.rainfallTodayIn, settings.units)),
      stat('Next Rain', formatPrecipitation(tomorrow.precipitationSumIn, settings.units), `${Math.round(tomorrow.precipitation || 0)}%`)
    ]),
    createElement('section', { className: 'wx-air-strip' }, [
      pollutantBadge('PM2.5', aq.pm25),
      pollutantBadge('PM10', aq.pm10),
      pollutantBadge('Ozone', aq.ozone),
      pollutantBadge('NO2', aq.nitrogenDioxide),
      createElement('div', { className: 'wx-air-strip__item' }, [
        createElement('span', { text: 'Daylight' }),
        createElement('strong', { text: almanac.daylight || 'n/a' })
      ])
    ])
  ]));
}

function pollutantBadge(label, value) {
  return createElement('div', { className: 'wx-air-strip__item' }, [
    createElement('span', { text: label }),
    createElement('strong', { text: value !== null && value !== undefined ? String(value) : 'n/a' })
  ]);
}

function maxDailyRain(days = []) {
  return days.reduce((max, day) => Math.max(max, Number(day.precipitationSumIn) || 0), 0);
}

function moonPhase(label, date, phase) {
  return createElement('div', { className: `wx-phase wx-phase--${phase}` }, [
    createElement('h3', { text: label }),
    createElement('span', { className: 'wx-phase__disc', attrs: { 'aria-hidden': 'true' } }),
    createElement('p', { text: date })
  ]);
}

function weatherIcon(condition) {
  return createElement('span', {
    className: `wx-weather-icon wx-weather-icon--${resolveWeatherIconKey(condition)}`,
    attrs: {
      'aria-hidden': 'true'
    }
  });
}

function renderMoon(page, { report }) {
  const { moon } = report;
  const phaseKey = moonPhaseKey(moon.phase);

  page.append(createElement('div', { className: 'wx-layout wx-layout--moon' }, [
    createElement('section', {
      className: `wx-moon-disc wx-moon-disc--${phaseKey}`,
      attrs: {
        role: 'img',
        'aria-label': `${moon.phase}, ${moon.illumination}% illuminated`
      }
    }, [
      createElement('span', { className: 'wx-moon-disc__shadow' })
    ]),
    panel('Lunar Details', [
      stat('Phase', moon.phase),
      stat('Illumination', `${moon.illumination}%`),
      stat('Moonrise', moon.moonrise),
      stat('Moonset', moon.moonset),
      stat('Next New', moon.nextNewMoon),
      stat('Next Full', moon.nextFullMoon)
    ])
  ]));
}

function moonPhaseKey(phase) {
  const normalized = String(phase || '').toLowerCase();
  if (normalized.includes('new')) {
    return 'new';
  }

  if (normalized.includes('first') || normalized.includes('wax')) {
    return 'first';
  }

  if (normalized.includes('last') || normalized.includes('third') || normalized.includes('wan')) {
    return 'last';
  }

  return 'full';
}

const ROTATION_OPTIONS = [10, 15, 20, 30];

function renderSettings(page, { settings, controller, weatherStatus, onToggleAudio, onSetRotation }) {
  const location = settings.location
    ? `${settings.location.city}, ${settings.location.region || settings.location.zip}`
    : 'Demo';

  page.append(createElement('div', { className: 'wx-settings-grid' }, [
    panel('Slide Speed', [
      rotationControls(settings.rotationSeconds, onSetRotation),
      createElement('p', { className: 'wx-settings-hint', text: 'Focus here, then Left / Right to change hold time.' })
    ], 'wx-panel--speed'),
    panel('Display', [
      stat('Units', settings.units === 'metric' ? 'Metric' : 'Imperial'),
      stat('Filter', settings.scanlines ? 'On' : 'Off'),
      stat('Motion', settings.reducedMotion ? 'Reduced' : 'Full'),
      stat('Music', settings.audioEnabled ? 'On' : 'Off'),
      soundToggle(settings, onToggleAudio)
    ], 'wx-panel--display'),
    panel('Station', [
      stat('Place', location),
      stat('ZIP', settings.location?.zip || 'Unset'),
      stat('Data', formatWeatherStatus(weatherStatus)),
      stat('State', controller.paused ? 'Paused' : 'Playing'),
      createElement('p', { className: 'wx-settings-hint', text: 'Yellow or L changes ZIP.' })
    ], 'wx-panel--station'),
    panel('Remote', [
      createElement('p', { className: 'wx-settings-hint', text: 'Left / Right: pages, or slide speed when focused.' }),
      createElement('p', { className: 'wx-settings-hint', text: 'Up / Down: focus   OK: pause or select   1-9: jump page.' })
    ], 'wx-panel--remote')
  ]));
}

function formatWeatherStatus(weatherStatus) {
  const labels = {
    live: 'Live',
    loading: 'Loading',
    mock: 'Demo',
    error: 'Error'
  };

  return labels[weatherStatus] || weatherStatus || 'Demo';
}

function rotationControls(currentSeconds, onSetRotation) {
  const currentIndex = ROTATION_OPTIONS.indexOf(currentSeconds);
  const slowerSeconds = currentIndex > 0
    ? ROTATION_OPTIONS[currentIndex - 1]
    : nearestRotationOption(currentSeconds, -1);
  const fasterSeconds = currentIndex >= 0 && currentIndex < ROTATION_OPTIONS.length - 1
    ? ROTATION_OPTIONS[currentIndex + 1]
    : nearestRotationOption(currentSeconds, 1);

  return createElement('div', {
    className: 'wx-rotation-control',
    attrs: { role: 'group', 'aria-label': 'Slide speed' }
  }, [
    rotationStepButton('Slower', 'rotation-slower', -1, slowerSeconds, onSetRotation),
    createElement('div', {
      className: 'wx-rotation-control__value',
      text: `${currentSeconds} sec`,
      attrs: { 'aria-live': 'polite' }
    }),
    rotationStepButton('Faster', 'rotation-faster', 1, fasterSeconds, onSetRotation)
  ]);
}

function nearestRotationOption(currentSeconds, direction) {
  if (direction < 0) {
    return [...ROTATION_OPTIONS].reverse().find((seconds) => seconds < currentSeconds) || null;
  }

  return ROTATION_OPTIONS.find((seconds) => seconds > currentSeconds) || null;
}

function rotationStepButton(label, id, step, seconds, onSetRotation) {
  const button = createElement('button', {
    className: 'wx-rotation-control__button',
    text: label,
    attrs: {
      type: 'button',
      id,
      'data-rotation-step': String(step),
      'data-focus-id': id,
      disabled: !seconds,
      'aria-label': seconds ? `${label}: ${seconds} seconds` : `${label}: limit reached`
    }
  });

  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (seconds) {
      onSetRotation?.(seconds);
    }
  });

  return button;
}

function soundToggle(settings, onToggleAudio) {
  const button = createElement('button', {
    className: 'wx-sound-toggle',
    text: settings.audioEnabled ? 'Turn Music Off' : 'Turn Music On',
    attrs: {
      type: 'button',
      id: 'settings-sound-toggle',
      'data-focus-id': 'settings-sound-toggle',
      'aria-pressed': settings.audioEnabled ? 'true' : 'false'
    }
  });

  button.addEventListener('click', (event) => {
    event.preventDefault();
    onToggleAudio?.();
  });

  return button;
}

RetroWeather.renderPage = renderPage;
}());
