(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});

function createElement(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = String(options.text);
  }

  if (options.attrs) {
    Object.entries(options.attrs).forEach(([name, value]) => {
      if (value !== false && value !== null && value !== undefined) {
        element.setAttribute(name, String(value));
      }
    });
  }

  children.forEach((child) => {
    element.append(child);
  });

  return element;
}

function clear(element) {
  while (element.firstChild) {
    element.firstChild.remove();
  }
}

function panel(title, children = [], className = '') {
  return createElement('section', { className: `wx-panel retro-panel weather-panel ${className}`.trim() }, [
    createElement('h2', { className: 'wx-panel__title panel-title section-title', text: title }),
    ...children
  ]);
}

function stat(label, value, detail = '') {
  return createElement('div', { className: 'wx-stat metric weather-stat stat' }, [
    createElement('span', { className: 'wx-stat__label metric-label stat-label', text: label }),
    createElement('strong', { className: 'wx-stat__value metric-value stat-value', text: value }),
    detail ? createElement('span', { className: 'wx-stat__detail', text: detail }) : document.createTextNode('')
  ]);
}

function formatTemperature(tempF, units) {
  if (units === 'metric') {
    return `${Math.round((tempF - 32) * 5 / 9)}°C`;
  }

  return `${Math.round(tempF)}°F`;
}

function formatSpeed(speedMph, units) {
  if (units === 'metric') {
    return `${Math.round(speedMph * 1.609)} km/h`;
  }

  return `${Math.round(speedMph)} mph`;
}

function formatPrecipitation(inches, units) {
  const amount = Number(inches);
  if (!Number.isFinite(amount)) {
    return units === 'metric' ? '0 mm' : '0.00 in';
  }

  if (units === 'metric') {
    return `${Math.round(amount * 25.4)} mm`;
  }

  return `${amount.toFixed(2)} in`;
}

function readableTime(isoString) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(isoString));
}

function resolveWeatherIconKey(condition) {
  const normalized = String(condition || '').toLowerCase();
  if (normalized.includes('thunder') || normalized.includes('storm') || normalized.includes('hail')) {
    return 'storm';
  }

  if (
    normalized.includes('rain')
    || normalized.includes('shower')
    || normalized.includes('drizzle')
  ) {
    return 'rain';
  }

  if (normalized.includes('fog') || normalized.includes('haze') || normalized.includes('smoke')) {
    return 'fog';
  }

  if (
    normalized.includes('snow')
    || normalized.includes('sleet')
    || normalized.includes('ice')
    || normalized.includes('freezing')
    || normalized.includes('flurr')
  ) {
    return 'cloud';
  }

  if (normalized.includes('cloud') || normalized.includes('overcast')) {
    return normalized.includes('part') || normalized.includes('break') || normalized.includes('sun')
      ? 'partly'
      : 'cloud';
  }

  if (
    normalized.includes('part')
    || normalized.includes('mostly')
    || normalized.includes('break')
    || normalized.includes('clearing')
  ) {
    return 'partly';
  }

  return 'sun';
}

Object.assign(RetroWeather, {
  clear,
  createElement,
  formatPrecipitation,
  formatSpeed,
  formatTemperature,
  panel,
  readableTime,
  resolveWeatherIconKey,
  stat
});
}());
