(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});

const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 24 * 60 * 60 * 1000;
const MOON_STANDARD_ALTITUDE = 0.125;

function buildMoonData({ date, lat, lon, timezone }) {
  const when = parseDate(date, timezone);
  if (!Number.isFinite(when.getTime())) {
    throw new Error('Moon calculation date is invalid.');
  }

  const latitude = Number(lat);
  const longitude = Number(lon);
  const phase = moonPhase(when);
  const events = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? moonRiseSet(when, latitude, longitude, timezone)
    : {};

  return {
    phase: phase.label,
    illumination: phase.illumination,
    moonrise: events.rise ? formatClock(events.rise, timezone) : 'Unavailable',
    moonset: events.set ? formatClock(events.set, timezone) : 'Unavailable',
    nextNewMoon: formatDate(phase.nextNewMoon, timezone),
    nextFirstQuarter: formatDate(phase.nextFirstQuarter, timezone),
    nextFullMoon: formatDate(phase.nextFullMoon, timezone),
    nextLastQuarter: formatDate(phase.nextLastQuarter, timezone)
  };
}

function moonPhase(date) {
  const daysSinceKnownNewMoon = (date.getTime() - KNOWN_NEW_MOON_MS) / DAY_MS;
  const cycle = positiveModulo(daysSinceKnownNewMoon, SYNODIC_MONTH_DAYS);
  const fraction = cycle / SYNODIC_MONTH_DAYS;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * fraction)) / 2 * 100);
  const nextNewMoon = new Date(date.getTime() + (SYNODIC_MONTH_DAYS - cycle) * DAY_MS);

  return {
    label: phaseLabel(cycle),
    illumination,
    nextNewMoon,
    nextFirstQuarter: nextPhaseDate(date, cycle, SYNODIC_MONTH_DAYS / 4),
    nextFullMoon: nextPhaseDate(date, cycle, SYNODIC_MONTH_DAYS / 2),
    nextLastQuarter: nextPhaseDate(date, cycle, SYNODIC_MONTH_DAYS * 3 / 4)
  };
}

function nextPhaseDate(date, cycle, targetAgeDays) {
  const daysUntilPhase = cycle < targetAgeDays
    ? targetAgeDays - cycle
    : SYNODIC_MONTH_DAYS - cycle + targetAgeDays;

  return new Date(date.getTime() + daysUntilPhase * DAY_MS);
}

function phaseLabel(ageDays) {
  const eighth = SYNODIC_MONTH_DAYS / 8;
  const index = Math.round(ageDays / eighth) % 8;
  return [
    'New moon',
    'Waxing crescent',
    'First quarter',
    'Waxing gibbous',
    'Full moon',
    'Waning gibbous',
    'Last quarter',
    'Waning crescent'
  ][index];
}

function moonRiseSet(date, latitude, longitude, timezone) {
  const dayStart = localDayStart(date, timezone);
  const samples = [];

  for (let hour = 0; hour <= 24; hour += 1) {
    const sampleDate = new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
    samples.push({
      date: sampleDate,
      altitude: moonAltitude(sampleDate, latitude, longitude) - MOON_STANDARD_ALTITUDE
    });
  }

  const events = {};
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous.altitude === 0 || signsDiffer(previous.altitude, current.altitude)) {
      const eventDate = interpolateCrossing(previous, current, latitude, longitude);
      if (previous.altitude < current.altitude && !events.rise) {
        events.rise = eventDate;
      } else if (previous.altitude > current.altitude && !events.set) {
        events.set = eventDate;
      }
    }
  }

  return events;
}

function interpolateCrossing(start, end, latitude, longitude) {
  let low = start.date.getTime();
  let high = end.date.getTime();
  const rising = start.altitude < end.altitude;

  for (let step = 0; step < 10; step += 1) {
    const middle = (low + high) / 2;
    const altitude = moonAltitude(new Date(middle), latitude, longitude) - MOON_STANDARD_ALTITUDE;
    if ((altitude > 0) === rising) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return new Date((low + high) / 2);
}

function moonAltitude(date, latitude, longitude) {
  const coordinates = moonCoordinates(date);
  const localSiderealTime = normalizeDegrees(greenwichSiderealTime(date) + longitude);
  const hourAngle = normalizeDegrees(localSiderealTime - coordinates.ra);
  const latRad = toRadians(latitude);
  const decRad = toRadians(coordinates.dec);
  const hourRad = toRadians(hourAngle > 180 ? hourAngle - 360 : hourAngle);

  return toDegrees(Math.asin(
    Math.sin(latRad) * Math.sin(decRad)
      + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourRad)
  ));
}

function moonCoordinates(date) {
  const days = julianDays(date) - 2451545;
  const meanLongitude = normalizeDegrees(218.316 + 13.176396 * days);
  const meanAnomaly = normalizeDegrees(134.963 + 13.064993 * days);
  const meanDistance = normalizeDegrees(93.272 + 13.229350 * days);
  const longitude = meanLongitude + 6.289 * Math.sin(toRadians(meanAnomaly));
  const latitude = 5.128 * Math.sin(toRadians(meanDistance));
  const obliquity = toRadians(23.439 - 0.00000036 * days);
  const lonRad = toRadians(longitude);
  const latRad = toRadians(latitude);

  return {
    ra: normalizeDegrees(toDegrees(Math.atan2(
      Math.sin(lonRad) * Math.cos(obliquity) - Math.tan(latRad) * Math.sin(obliquity),
      Math.cos(lonRad)
    ))),
    dec: toDegrees(Math.asin(
      Math.sin(latRad) * Math.cos(obliquity)
        + Math.cos(latRad) * Math.sin(obliquity) * Math.sin(lonRad)
    ))
  };
}

function greenwichSiderealTime(date) {
  const jd = julianDays(date);
  const days = jd - 2451545;
  const centuries = days / 36525;
  return normalizeDegrees(
    280.46061837
      + 360.98564736629 * days
      + 0.000387933 * centuries * centuries
      - centuries * centuries * centuries / 38710000
  );
}

function julianDays(date) {
  return date.getTime() / DAY_MS + 2440587.5;
}

function parseDate(value, timezone) {
  if (typeof value !== 'string' || hasExplicitOffset(value)) {
    return new Date(value);
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match || !timezone) {
    return new Date(value);
  }

  return zonedTimeToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0)
  }, timezone);
}

function localDayStart(date, timezone) {
  if (!timezone) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  const parts = zonedParts(date, timezone);
  return zonedTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
    second: 0
  }, timezone);
}

function zonedTimeToUtc(target, timezone) {
  let utc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);

  for (let step = 0; step < 3; step += 1) {
    const actual = zonedParts(new Date(utc), timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
    utc += targetAsUtc - actualAsUtc;
  }

  return new Date(utc);
}

function zonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const values = {};
  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  });

  return values;
}

function formatClock(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatDate(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function hasExplicitOffset(value) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function signsDiffer(left, right) {
  return (left < 0 && right > 0) || (left > 0 && right < 0);
}

function normalizeDegrees(degrees) {
  return positiveModulo(degrees, 360);
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

RetroWeather.astronomy = {
  buildMoonData
};
}());
