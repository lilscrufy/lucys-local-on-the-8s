(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});
const {
  clear,
  createElement,
  formatSpeed,
  formatTemperature,
  pageCatalog,
  readableTime
} = RetroWeather;

const CHANNEL_NAME = "Lucy's Local on the 8's";
const CHANNEL_BADGE_LINES = [
  { text: "LUCY'S", hook: 'lucys' },
  { text: 'LOCAL', hook: 'local' },
  { text: "ON THE 8's", hook: 'on-the-8s' }
];
const pageTitles = new Map(pageCatalog.map((page) => [page.id, page.title]));
const clockFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
});
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
});

function createStage(root) {
  clear(root);

  const stage = createElement('section', {
    className: 'retro-stage weather-stage has-crt',
    attrs: {
      'data-stage': 'weather',
      'data-stage-size': '960x720',
      tabindex: '-1'
    }
  });

  const layout = createElement('div', { className: 'retro-stage__layout weather-layout' });
  const topBar = createElement('header', { className: 'retro-stage__topbar weather-header station-header' });
  const content = createElement('section', {
    className: 'retro-stage__content forecast-panel',
    attrs: { id: 'retro-weather-page' }
  });
  const help = createElement('aside', {
    className: 'retro-stage__help',
    attrs: { hidden: true }
  });
  const setup = createElement('aside', {
    className: 'retro-stage__help retro-stage__setup',
    attrs: { hidden: true }
  });
  const ticker = createElement('footer', { className: 'retro-stage__ticker weather-ticker ticker crawl' });

  layout.append(topBar, content, help, ticker);
  stage.append(layout, setup);
  root.append(stage);

  return {
    root: stage,
    topBar,
    content,
    help,
    setup,
    ticker
  };
}

function renderChrome(stage, { page, pageIndex, pageCount, paused, settings, report, now, audioStatus = 'off', onToggleAudio }) {
  const cityLine = `${report.location.city}, ${report.location.region}`;
  const title = pageTitles.get(page) || page;

  clear(stage.topBar);
  stage.topBar.append(
    createStationBadge(),
    createElement('div', { className: 'station-title-stack' }, [
      createElement('h1', { className: 'retro-brand weather-title station-logo', text: title }),
      createElement('p', { className: 'station-location', text: cityLine })
    ]),
    createElement('div', { className: 'retro-page-title station-meta weather-meta' }, [
      createElement('span', { className: 'retro-clock clock-readout', text: formatClock(now) }),
      createElement('span', { className: 'retro-date clock-readout', text: formatDate(now) })
    ])
  );

  clear(stage.ticker);
  stage.ticker.append(
    createElement('span', { className: 'retro-ticker__location ticker-label crawl-label', text: currentFooterLabel(page, report) }),
    createElement('span', { className: 'retro-ticker__track ticker-track crawl-track' }, [
      createElement('span', { className: 'retro-ticker__message ticker-item crawl-item', text: footerText(page, report, cityLine, pageIndex, pageCount, paused, settings) })
    ]),
    createSoundButton(settings, audioStatus, onToggleAudio)
  );
}

function renderClock(stage, now) {
  const clock = stage.topBar.querySelector('.retro-clock');
  const date = stage.topBar.querySelector('.retro-date');
  if (clock) {
    clock.textContent = formatClock(now);
  }
  if (date) {
    date.textContent = formatDate(now);
  }
}

function createSoundButton(settings, audioStatus, onToggleAudio) {
  const labels = {
    error: 'ERR',
    off: 'OFF',
    pending: 'CLK',
    playing: 'ON'
  };
  const button = createElement('button', {
    className: `music-status music-status--${audioStatus}`,
    text: labels[audioStatus] || (settings.audioEnabled ? 'ON' : 'OFF'),
    attrs: {
      type: 'button',
      'aria-label': settings.audioEnabled ? 'Turn sound off' : 'Turn sound on',
      'aria-pressed': settings.audioEnabled ? 'true' : 'false',
      title: settings.audioEnabled && audioStatus === 'pending' ? 'Click to start sound' : 'Toggle sound'
    }
  });

  button.addEventListener('click', (event) => {
    event.preventDefault();
    onToggleAudio?.();
  });

  return button;
}

function createStationBadge() {
  return createElement('div', {
    className: 'station-logo-bug local-channel-badge',
    attrs: {
      'aria-label': CHANNEL_NAME,
      role: 'img',
      title: CHANNEL_NAME
    }
  }, CHANNEL_BADGE_LINES.map((line) => (
    createElement('span', {
      className: `station-logo-bug__line local-channel-badge__line local-channel-badge__line--${line.hook}`,
      text: line.text
    })
  )));
}

function currentFooterLabel(page, report) {
  const labels = {
    almanac: 'Records',
    air: 'Air Watch',
    current: 'Now',
    extended: '3 Day',
    hourly: 'Local',
    moon: 'Moon Desk',
    radar: 'Radar',
    regional: 'Regional',
    settings: 'Control'
  };

  return (labels[page] || 'Local').toUpperCase();
}

function footerText(page, report, cityLine, pageIndex, pageCount, paused, settings) {
  const alert = report.alerts?.[0];
  if (alert) {
    return alertFooterText(alert);
  }

  if (page === 'almanac') {
    const rainfall = Number(report.almanac.rainfallTodayIn);
    return `Sun ${report.almanac.sunrise}/${report.almanac.sunset}   Rain ${Number.isFinite(rainfall) ? rainfall.toFixed(2) : '0.00'} in`;
  }
  if (page === 'air') {
    const today = report.daily[0] || {};
    const rainfall = Number(report.almanac.rainfallTodayIn);
    return `${report.almanac.airQuality}   UV max ${Math.round(today.uvIndexMax || 0)}   Rain today ${Number.isFinite(rainfall) ? rainfall.toFixed(2) : '0.00'} in`;
  }
  if (page === 'hourly') {
    const nextHour = report.hourly[1] || report.hourly[0];
    const tomorrow = report.daily[1] || report.daily[0];
    return `${nextHour.time} ${nextHour.condition} ${formatTemperature(nextHour.tempF, settings.units)}   ${tomorrow.day} high ${formatTemperature(tomorrow.highF, settings.units)}`;
  }
  if (page === 'regional') {
    return `Area hub   Humidity ${report.current.humidity}%   Dewpoint ${Math.round(report.current.dewPointF)}°F`;
  }
  if (page === 'current') {
    return `${report.current.condition} now   Wind ${report.current.wind.direction} ${formatSpeed(report.current.wind.speedMph, settings.units)}`;
  }
  if (page === 'extended') {
    const today = report.daily[0] || {};
    const third = report.daily[2] || today;
    return `Today ${formatTemperature(today.highF, settings.units)}/${formatTemperature(today.lowF, settings.units)}   ${third.day} ${third.condition}`;
  }
  if (page === 'radar') {
    return `Radar loop   Live when available   Updated ${readableTime(report.observedAt)}`;
  }
  if (page === 'moon') {
    return `${report.moon.phase}   ${report.moon.illumination}% lit   Rise ${report.moon.moonrise}`;
  }
  return `${pageIndex + 1}/${pageCount}   ${paused ? 'Paused' : `${settings.rotationSeconds}s rotation`}   Updated ${readableTime(report.observedAt)}`;
}

function alertFooterText(alert) {
  const type = String(alert.type || '').trim();
  const headline = String(alert.headline || '').trim();
  if (!type) {
    return headline ? `Alert: ${compactAlertHeadline(headline)}` : 'Alert';
  }

  if (!headline || headline.toLowerCase().startsWith(type.toLowerCase())) {
    return `Alert: ${compactAlertHeadline(headline || type)}`;
  }

  return `Alert: ${compactAlertHeadline(type)}   ${compactAlertHeadline(headline)}`;
}

function compactAlertHeadline(text) {
  return String(text || '')
    .replace(/\bissued\b/ig, '')
    .replace(/\bin effect\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderHelpOverlay(target, { visible, pages, currentPage, settings }) {
  clear(target);
  target.hidden = !visible;

  if (!visible) {
    return;
  }

  const pageList = createElement('ol', { className: 'retro-help__pages' }, pages.map((page) => (
    createElement('li', {
      className: page === currentPage ? 'is-current' : '',
      text: pageTitles.get(page) || page
    })
  )));

  target.append(
    createElement('h2', { className: 'retro-help__title', text: 'Controls' }),
    createElement('p', {
      className: 'retro-help__summary',
      text: 'Left and right change pages. OK pauses or activates focused controls. Back closes panels.'
    }),
    createElement('dl', { className: 'retro-help__keys' }, [
      keyDef('Left/Right', 'change page'),
      keyDef('Up/Down', 'move focus'),
      keyDef('OK/Enter', 'pause or select'),
      keyDef('Back/Esc', 'close or exit'),
      keyDef('1-9', 'jump to a page'),
      keyDef('Red', 'toggle help'),
      keyDef('Green', `sound: ${settings.audioEnabled ? 'on' : 'off'}`),
      keyDef('Yellow', 'change ZIP'),
      keyDef('Blue', `motion: ${settings.reducedMotion ? 'reduced' : 'full'}`),
      keyDef('?', 'toggle help')
    ]),
    pageList,
    createElement('p', {
      className: 'retro-help__summary',
      text: 'Data: Open-Meteo, NWS, RainViewer; map: © OpenStreetMap contributors. Music: Kevin MacLeod (CC BY 4.0). Full credits in README.'
    })
  );
}

function renderLocationSetup(target, {
  visible,
  location,
  zipValue = '',
  status,
  error,
  onSubmit,
  onZipInput,
  onCancel
}) {
  const previousFocus = target.contains(document.activeElement)
    ? focusDescriptor(document.activeElement)
    : null;
  clear(target);
  target.hidden = !visible;

  if (!visible) {
    return;
  }

  const isRequired = !location;
  const normalizedZip = String(zipValue || '').replace(/\D/g, '').slice(0, 5);
  const isLoading = status === 'loading';
  const form = createElement('form', { className: 'wx-location-form' }, [
    createElement('label', { className: 'wx-location-form__label', attrs: { for: 'zip-code-entry' }, text: 'Local ZIP Code' }),
    createElement('div', { className: 'wx-location-form__row' }, [
      createElement('input', {
        className: 'wx-location-form__input',
        attrs: {
          id: 'zip-code-entry',
          name: 'zip',
          type: 'tel',
          inputmode: 'numeric',
          autocomplete: 'postal-code',
          pattern: '[0-9]{5}',
          value: normalizedZip,
          maxlength: '5',
          placeholder: location?.zip || '78701',
          'aria-label': 'Five digit ZIP code'
        }
      }),
      createElement('button', {
        className: 'wx-location-form__button',
        text: isLoading ? 'Tuning...' : 'Tune In',
        attrs: {
          type: 'submit',
          disabled: normalizedZip.length !== 5 || isLoading
        }
      })
    ])
  ]);

  const zipInput = form.querySelector('#zip-code-entry');
  const submitButton = form.querySelector('button[type="submit"]');
  zipInput?.addEventListener('input', () => {
    const nextZip = String(zipInput.value || '').replace(/\D/g, '').slice(0, 5);
    if (zipInput.value !== nextZip) {
      zipInput.value = nextZip;
    }
    if (submitButton) {
      submitButton.disabled = nextZip.length !== 5 || isLoading;
    }
    onZipInput?.(nextZip, { renderOnChange: false });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const zip = String(new FormData(form).get('zip') || '').replace(/\D/g, '').slice(0, 5);
    if (!isLoading && String(zip || '').length === 5) {
      onSubmit(String(zip || ''));
    }
  });

  target.append(
    createElement('div', { className: 'wx-location-card' }, [
      createElement('h2', { className: 'wx-location-card__title', text: isRequired ? 'Set Local Forecast' : 'Change Forecast' }),
      createElement('p', {
        className: 'wx-location-card__copy',
        text: status === 'loading'
          ? 'Contacting Open-Meteo...'
          : 'Enter a 5-digit US ZIP, then press Enter.'
      }),
      form,
      error ? createElement('p', { className: 'wx-location-card__error', text: error }) : document.createTextNode(''),
      createElement('div', { className: 'wx-location-card__actions' }, [
        !isRequired ? createElement('button', {
          className: 'wx-location-form__button wx-location-form__button--secondary',
          text: 'Cancel',
          attrs: { type: 'button' }
        }) : document.createTextNode('')
      ])
    ])
  );

  const [cancelButton] = target.querySelectorAll('.wx-location-form__button--secondary');
  cancelButton?.addEventListener('click', onCancel);
  window.setTimeout(() => {
    const restoredFocus = previousFocus ? findFocusTarget(target, previousFocus) : null;
    (restoredFocus || zipInput || cancelButton)?.focus();
  }, 0);
}

function focusDescriptor(element) {
  if (element.id) {
    return { type: 'id', value: element.id };
  }

  if (element.tagName === 'BUTTON') {
    return { type: 'buttonText', value: element.textContent };
  }

  return null;
}

function findFocusTarget(root, descriptor) {
  if (!descriptor) {
    return null;
  }

  if (descriptor.type === 'id') {
    return root.querySelector(`#${descriptor.value}`);
  }

  if (descriptor.type === 'buttonText') {
    return Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === descriptor.value) || null;
  }

  return null;
}

function keyDef(key, description) {
  return createElement('div', { className: 'retro-help__key' }, [
    createElement('dt', { text: key }),
    createElement('dd', { text: description })
  ]);
}

function formatClock(date) {
  return clockFormatter.format(date);
}

function formatDate(date) {
  return dateFormatter.format(date);
}

Object.assign(RetroWeather, {
  createStage,
  renderChrome,
  renderClock,
  renderHelpOverlay,
  renderLocationSetup
});
}());
