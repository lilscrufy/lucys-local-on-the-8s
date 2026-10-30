(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});
const observedAt = '2026-05-13T18:20:00-05:00';

const weatherReport = {
  location: {
    city: 'Austin',
    region: 'Texas',
    country: 'US',
    station: 'Camp Mabry',
    lat: 30.32,
    lon: -97.76,
    elevationFt: 621
  },
  observedAt,
  current: {
    condition: 'Sunny',
    temperatureF: 82,
    feelsLikeF: 84,
    dewPointF: 38,
    humidity: 20,
    pressureIn: 30.03,
    visibilityMi: 10,
    uvIndex: 4,
    precipitationIn: 0.01,
    rainfallTodayIn: 0.04,
    ceiling: 'Unlimited',
    wind: {
      direction: 'E',
      speedMph: 12,
      gustMph: 18
    }
  },
  alerts: [
    {
      type: 'Special Weather Statement',
      headline: 'Isolated storms possible west of town after sunset',
      expiresAt: '2026-05-13T22:00:00-05:00',
      severity: 'low',
      urgency: 'Future',
      certainty: 'Possible',
      area: 'Travis County',
      instruction: 'Keep an eye on the western sky.'
    }
  ],
  hourly: [
    { time: '7 PM', condition: 'Partly cloudy', tempF: 80, feelsLikeF: 81, dewPointF: 43, humidity: 28, precipitation: 12, uvIndex: 1, windMph: 11 },
    { time: '8 PM', condition: 'Clouds increasing', tempF: 78, feelsLikeF: 79, dewPointF: 45, humidity: 33, precipitation: 18, uvIndex: 0, windMph: 10 },
    { time: '9 PM', condition: 'Mostly cloudy', tempF: 76, feelsLikeF: 77, dewPointF: 47, humidity: 37, precipitation: 22, uvIndex: 0, windMph: 9 },
    { time: '10 PM', condition: 'Chance shower', tempF: 74, feelsLikeF: 75, dewPointF: 51, humidity: 45, precipitation: 33, uvIndex: 0, windMph: 8 },
    { time: '11 PM', condition: 'Passing shower', tempF: 73, feelsLikeF: 74, dewPointF: 55, humidity: 53, precipitation: 42, uvIndex: 0, windMph: 7 },
    { time: '12 AM', condition: 'Cloudy', tempF: 72, feelsLikeF: 73, dewPointF: 57, humidity: 59, precipitation: 28, uvIndex: 0, windMph: 6 },
    { time: '1 AM', condition: 'Cloudy', tempF: 71, feelsLikeF: 72, dewPointF: 58, humidity: 63, precipitation: 20, uvIndex: 0, windMph: 6 },
    { time: '2 AM', condition: 'Patchy fog', tempF: 70, feelsLikeF: 71, dewPointF: 59, humidity: 68, precipitation: 18, uvIndex: 0, windMph: 5 }
  ],
  daily: [
    { day: 'Thu', condition: 'Scattered rain', highF: 86, lowF: 69, feelsLikeHighF: 88, feelsLikeLowF: 70, precipitation: 24, precipitationSumIn: 0.08, uvIndexMax: 5, clearSkyUvIndexMax: 8, daylightHours: 13.7, sunshineHours: 8.2, wind: 'S 10' },
    { day: 'Fri', condition: 'Mostly sunny', highF: 83, lowF: 68, feelsLikeHighF: 84, feelsLikeLowF: 68, precipitation: 8, precipitationSumIn: 0.00, uvIndexMax: 7, clearSkyUvIndexMax: 8, daylightHours: 13.8, sunshineHours: 10.5, wind: 'SE 12' },
    { day: 'Sat', condition: 'Partly sunny', highF: 88, lowF: 71, feelsLikeHighF: 91, feelsLikeLowF: 72, precipitation: 14, precipitationSumIn: 0.01, uvIndexMax: 8, clearSkyUvIndexMax: 9, daylightHours: 13.8, sunshineHours: 9.4, wind: 'S 14' },
    { day: 'Sun', condition: 'Sun breaks, isolated storm', highF: 90, lowF: 72, feelsLikeHighF: 94, feelsLikeLowF: 73, precipitation: 27, precipitationSumIn: 0.13, uvIndexMax: 7, clearSkyUvIndexMax: 9, daylightHours: 13.8, sunshineHours: 7.9, wind: 'SSW 11' },
    { day: 'Mon', condition: 'Mostly sunny', highF: 91, lowF: 70, feelsLikeHighF: 92, feelsLikeLowF: 70, precipitation: 10, precipitationSumIn: 0.00, uvIndexMax: 9, clearSkyUvIndexMax: 9, daylightHours: 13.9, sunshineHours: 11.1, wind: 'W 8' },
    { day: 'Tue', condition: 'Dry and breezy', highF: 87, lowF: 66, feelsLikeHighF: 86, feelsLikeLowF: 65, precipitation: 6, precipitationSumIn: 0.00, uvIndexMax: 8, clearSkyUvIndexMax: 9, daylightHours: 13.9, sunshineHours: 10.8, wind: 'N 13' },
    { day: 'Wed', condition: 'Clear morning, fair afternoon', highF: 85, lowF: 65, feelsLikeHighF: 84, feelsLikeLowF: 65, precipitation: 8, precipitationSumIn: 0.00, uvIndexMax: 8, clearSkyUvIndexMax: 9, daylightHours: 13.9, sunshineHours: 10.6, wind: 'ENE 9' }
  ],
  almanac: {
    sunrise: '6:37 AM',
    sunset: '8:17 PM',
    daylight: '13h 40m',
    sunshine: '8h 12m',
    rainfallTodayIn: 0.04,
    airQuality: 'Good (AQI 42)',
    airQualityDetails: {
      aqi: 42,
      category: 'Good',
      pm25: 6.8,
      pm10: 18.2,
      ozone: 78.4,
      nitrogenDioxide: 4.6,
      source: 'Open-Meteo modeled AQ'
    }
  },
  moon: {
    phase: 'Waning crescent',
    illumination: 18,
    moonrise: '4:12 AM',
    moonset: '5:28 PM',
    nextNewMoon: 'May 16',
    nextFullMoon: 'May 31'
  },
  regional: {
    stations: [
      { city: 'Amarillo', tempF: 97, condition: 'Sunny', wind: 'S 9' },
      { city: 'Kansas City', tempF: 78, condition: 'Sunny', wind: 'N 8' },
      { city: 'Oklahoma City', tempF: 85, condition: 'Sunny', wind: 'E 12' },
      { city: 'Omaha', tempF: 79, condition: 'Sunny', wind: 'NNW 5' },
      { city: 'Springfield', tempF: 78, condition: 'Sunny', wind: 'N 14' },
      { city: 'Topeka', tempF: 82, condition: 'Sunny', wind: 'ENE 6' },
      { city: 'Tulsa', tempF: 82, condition: 'Sunny', wind: 'NE 8' },
      { city: 'Wichita', tempF: 82, condition: 'Sunny', wind: 'E 11' }
    ],
    radarFrames: [
      {
        label: '6:00 PM',
        cells: [
          { x: 180, y: 150, radius: 54, intensity: 0.35 },
          { x: 290, y: 210, radius: 34, intensity: 0.55 },
          { x: 700, y: 310, radius: 42, intensity: 0.25 }
        ]
      },
      {
        label: '6:10 PM',
        cells: [
          { x: 225, y: 160, radius: 56, intensity: 0.38 },
          { x: 330, y: 230, radius: 38, intensity: 0.65 },
          { x: 735, y: 300, radius: 44, intensity: 0.3 }
        ]
      },
      {
        label: '6:20 PM',
        cells: [
          { x: 270, y: 170, radius: 60, intensity: 0.45 },
          { x: 372, y: 248, radius: 42, intensity: 0.72 },
          { x: 770, y: 292, radius: 47, intensity: 0.35 }
        ]
      }
    ]
  }
};

const pageCatalog = [
  { id: 'current', title: 'Current Conditions' },
  { id: 'hourly', title: 'Local Forecast' },
  { id: 'extended', title: '3 Day Outlook' },
  { id: 'regional', title: 'Regional Conditions' },
  { id: 'radar', title: 'Local Radar' },
  { id: 'almanac', title: 'Almanac' },
  { id: 'air', title: 'Air Quality' },
  { id: 'moon', title: 'Moon Phase' },
  { id: 'settings', title: 'Settings' }
];

Object.assign(RetroWeather, {
  pageCatalog,
  weatherReport
});
}());
