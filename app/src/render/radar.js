(function () {
var RetroWeather = window.RetroWeather || (window.RetroWeather = {});
const baseMapLayerCache = new WeakMap();
let pixelCanvas = null;
let pixelContext = null;

function drawRadar(canvas, frame, location, options = {}) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const isLiveFrame = frame?.image && frame.imageStatus === 'ready';

  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, options.baseMap);

  if (isLiveFrame) {
    drawLiveRadarTile(context, width, height, frame.image);
  }

  if (options.baseMap) {
    drawBaseMapLinework(context, width, height, options.baseMap);
  }

  drawRangeRings(context, width, height, Boolean(options.baseMap));
  drawMapLines(context);
  if (!isLiveFrame) {
    drawCells(context, frame?.cells || []);
  }
  drawStation(context, width, height, location);
  drawRadarNoise(context, width, height);
  drawLegend(context, width, height, frame?.label || 'Recent', options.source || frame?.source || 'Demo radar');
}

function drawBackground(context, width, height, baseMap) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#06151f');
  gradient.addColorStop(1, '#102f3a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  if (drawBaseMap(context, width, height, baseMap, {
    alpha: 0.52,
    overlay: 'rgba(3, 14, 26, 0.6)',
    tint: 'rgba(72, 100, 116, 0.1)',
    cacheKey: 'radar-bg'
  })) {
    context.fillStyle = 'rgba(7, 19, 32, 0.36)';
    context.fillRect(0, 0, width, height);
  }

  context.strokeStyle = 'rgba(148, 230, 255, 0.12)';
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawBaseMap(context, width, height, baseMap, options = {}) {
  const readyTiles = (baseMap?.tiles || []).filter((tile) => tile.imageStatus === 'ready' && tile.image);
  if (!baseMap || !baseMap.center || !readyTiles.length) {
    return false;
  }

  const layer = getBaseMapLayer(context, width, height, baseMap, readyTiles, options);
  context.save();
  context.globalAlpha = options.alpha ?? 0.72;
  context.imageSmoothingEnabled = false;
  context.drawImage(layer, 0, 0);
  context.restore();
  return true;
}

function getBaseMapLayer(context, width, height, baseMap, readyTiles, options) {
  const tileKey = readyTiles.map((tile) => tile.url).join('|');
  const cacheKey = [
    options.cacheKey || 'base',
    width,
    height,
    baseMap.zoom,
    baseMap.viewScale || 1,
    options.overlay || '',
    options.tint || '',
    tileKey
  ].join('~');
  const cached = baseMapLayerCache.get(baseMap);
  if (cached?.key === cacheKey) {
    return cached.canvas;
  }

  const layer = document.createElement('canvas');
  const layerContext = layer.getContext('2d');
  layer.width = width;
  layer.height = height;

  const tileSize = baseMap.tileSize || 256;
  const viewScale = baseMap.viewScale || 1;
  const topLeftX = baseMap.center.x - width / (2 * viewScale);
  const topLeftY = baseMap.center.y - height / (2 * viewScale);

  layerContext.save();
  layerContext.imageSmoothingEnabled = false;
  readyTiles.forEach((tile) => {
    layerContext.drawImage(
      tile.image,
      Math.round((tile.x * tileSize - topLeftX) * viewScale),
      Math.round((tile.y * tileSize - topLeftY) * viewScale),
      Math.round(tileSize * viewScale),
      Math.round(tileSize * viewScale)
    );
  });
  layerContext.restore();

  layerContext.save();
  layerContext.globalCompositeOperation = 'saturation';
  layerContext.fillStyle = '#4d4d4d';
  layerContext.fillRect(0, 0, width, height);
  layerContext.restore();

  layerContext.save();
  layerContext.globalCompositeOperation = 'multiply';
  layerContext.fillStyle = options.overlay || 'rgba(4, 18, 31, 0.44)';
  layerContext.fillRect(0, 0, width, height);
  layerContext.restore();

  layerContext.save();
  layerContext.globalCompositeOperation = 'screen';
  layerContext.fillStyle = options.tint || 'rgba(86, 122, 154, 0.18)';
  layerContext.fillRect(0, 0, width, height);
  layerContext.restore();

  drawBaseMapDither(layerContext, width, height);
  baseMapLayerCache.set(baseMap, { key: cacheKey, canvas: layer });
  return layer;
}

function drawBaseMapDither(context, width, height) {
  context.save();
  context.fillStyle = 'rgba(244, 240, 213, 0.08)';
  for (let y = 0; y < height; y += 4) {
    context.fillRect(0, y, width, 1);
  }
  context.fillStyle = 'rgba(0, 0, 0, 0.12)';
  for (let x = 0; x < width; x += 6) {
    context.fillRect(x, 0, 1, height);
  }
  context.restore();
}

function drawBaseMapLinework(context, width, height, baseMap) {
  const readyTiles = (baseMap?.tiles || []).filter((tile) => tile.imageStatus === 'ready' && tile.image);
  if (!baseMap || !baseMap.center || !readyTiles.length) {
    return false;
  }

  const tileSize = baseMap.tileSize || 256;
  const viewScale = baseMap.viewScale || 1;
  const topLeftX = baseMap.center.x - width / (2 * viewScale);
  const topLeftY = baseMap.center.y - height / (2 * viewScale);

  context.save();
  context.globalAlpha = 0.28;
  context.globalCompositeOperation = 'screen';
  context.imageSmoothingEnabled = false;
  readyTiles.forEach((tile) => {
    context.drawImage(
      tile.image,
      Math.round((tile.x * tileSize - topLeftX) * viewScale),
      Math.round((tile.y * tileSize - topLeftY) * viewScale),
      Math.round(tileSize * viewScale),
      Math.round(tileSize * viewScale)
    );
  });
  context.restore();

  context.save();
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = 'rgba(14, 24, 32, 0.18)';
  context.fillRect(0, 0, width, height);
  context.restore();
  return true;
}

function drawLiveRadarTile(context, width, height, image) {
  const sourceZoom = 1.22;
  const sourceWidth = image.naturalWidth / sourceZoom;
  const sourceHeight = image.naturalHeight / sourceZoom;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.save();
  context.globalAlpha = 0.72;
  context.imageSmoothingEnabled = false;
  const pixelWidth = Math.max(1, Math.round(width / 4));
  const pixelHeight = Math.max(1, Math.round(height / 4));
  if (!pixelCanvas) {
    pixelCanvas = document.createElement('canvas');
    pixelContext = pixelCanvas.getContext('2d');
  }
  if (pixelCanvas.width !== pixelWidth) {
    pixelCanvas.width = pixelWidth;
  }
  if (pixelCanvas.height !== pixelHeight) {
    pixelCanvas.height = pixelHeight;
  }
  pixelContext.imageSmoothingEnabled = false;
  pixelContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, pixelCanvas.width, pixelCanvas.height);
  context.drawImage(pixelCanvas, 0, 0, width, height);
  context.restore();

  context.save();
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = 'rgba(4, 18, 34, 0.2)';
  context.fillRect(0, 0, width, height);
  context.restore();

  context.save();
  context.globalCompositeOperation = 'screen';
  context.fillStyle = 'rgba(58, 94, 136, 0.22)';
  context.fillRect(0, 0, width, height);
  context.restore();
}

function drawRangeRings(context, width, height, hasBaseMap) {
  const centerX = width * 0.52;
  const centerY = height * 0.52;

  context.strokeStyle = hasBaseMap ? 'rgba(210, 250, 255, 0.07)' : 'rgba(210, 250, 255, 0.28)';
  context.lineWidth = hasBaseMap ? 1 : 2;
  (hasBaseMap ? [150, 300] : [80, 150, 225, 300]).forEach((radius) => {
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  });
}

function drawMapLines(context) {
  context.strokeStyle = 'rgba(244, 240, 213, 0.24)';
  context.lineWidth = 1;
  context.strokeRect(10, 10, context.canvas.width - 20, context.canvas.height - 20);

  context.fillStyle = 'rgba(244, 240, 213, 0.78)';
  context.font = '700 12px "Courier New", monospace';
  context.fillText('RDR PLOT', 18, 28);
  context.fillText('WX-88D', context.canvas.width - 74, 28);
}

function drawCells(context, cells) {
  cells.forEach((cell) => {
    const gradient = context.createRadialGradient(cell.x, cell.y, 5, cell.x, cell.y, cell.radius);
    gradient.addColorStop(0, cell.intensity > 0.6 ? '#ffec63' : '#52ff69');
    gradient.addColorStop(0.45, '#2dd957');
    gradient.addColorStop(1, 'rgba(18, 135, 70, 0)');

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cell.x, cell.y, cell.radius, 0, Math.PI * 2);
    context.fill();

    if (cell.intensity > 0.6) {
      context.fillStyle = 'rgba(244, 95, 55, 0.72)';
      context.beginPath();
      context.arc(cell.x + 8, cell.y - 4, cell.radius * 0.28, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function drawStation(context, width, height, location) {
  const x = width * 0.52;
  const y = height * 0.52;

  context.strokeStyle = '#f4f0d5';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x - 12, y);
  context.lineTo(x + 12, y);
  context.moveTo(x, y - 12);
  context.lineTo(x, y + 12);
  context.stroke();

  context.fillStyle = '#f4f0d5';
  context.font = '16px monospace';
  context.fillText(`${location.city.toUpperCase()} RADAR`, x + 18, y - 18);
}

function drawRadarNoise(context, width, height) {
  context.fillStyle = 'rgba(244, 240, 213, 0.07)';
  for (let y = 0; y < height; y += 6) {
    if (y % 18 === 0) {
      context.fillRect(0, y, width, 1);
    }
  }
}

function drawLegend(context, width, height, label, source) {
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(16, height - 58, 310, 42);
  context.fillStyle = '#f4f0d5';
  context.font = '16px monospace';
  context.fillText(`MACHINE LOOP ${label}`, 30, height - 34);
  context.font = '12px monospace';
  context.fillText(`STATUS ${source.toUpperCase()}`, 30, height - 18);

  const colors = ['#2dd957', '#ffec63', '#f45f37'];
  colors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(width - 140 + index * 36, height - 48, 24, 18);
  });
}

function drawRegionalMap(canvas, report, settings = {}, options = {}) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const stations = report.regional?.stations || [];
  const location = report.location || {};
  const precipitation = regionalPrecipitation(report);

  context.clearRect(0, 0, width, height);
  const hasBaseMap = drawRegionalBackground(context, width, height, precipitation, options.baseMap);
  if (!hasBaseMap) {
    drawRegionalBoundaries(context, width, height);
  }
  drawRegionalStations(context, stations, settings, width, height, location);
  drawRegionalHome(context, location, width, height);
  drawRegionalFooter(context, width, height, precipitation, report.regional?.isDemo, hasBaseMap);
}

function drawRegionalBackground(context, width, height, precipitation, baseMap) {
  context.fillStyle = '#2f4351';
  context.fillRect(0, 0, width, height);

  if (drawBaseMap(context, width, height, baseMap, {
    alpha: 0.46,
    overlay: 'rgba(18, 24, 28, 0.66)',
    tint: 'rgba(116, 113, 86, 0.1)',
    cacheKey: 'regional-bg'
  })) {
    drawRegionalPrecipitation(context, width, height, precipitation);
    drawRegionalMachineGrid(context, width, height);
    context.strokeStyle = 'rgba(244, 240, 213, 0.3)';
    context.lineWidth = 1;
    context.strokeRect(10, 10, width - 20, height - 20);
    return true;
  }

  const land = context.createLinearGradient(0, 0, width, height);
  land.addColorStop(0, '#6f7172');
  land.addColorStop(1, '#4f5358');
  context.fillStyle = land;
  context.beginPath();
  context.moveTo(0, height * 0.1);
  context.lineTo(width * 0.74, height * 0.03);
  context.bezierCurveTo(width * 0.78, height * 0.2, width * 0.68, height * 0.42, width * 0.79, height * 0.58);
  context.bezierCurveTo(width * 0.88, height * 0.72, width * 0.74, height * 0.9, width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();

  drawRegionalPrecipitation(context, width, height, precipitation);
  drawRegionalMachineGrid(context, width, height);
  return false;
}

function drawRegionalMachineGrid(context, width, height) {
  context.save();
  context.strokeStyle = 'rgba(244, 240, 213, 0.12)';
  context.lineWidth = 1;
  for (let x = 24; x < width; x += 72) {
    context.beginPath();
    context.moveTo(x, 14);
    context.lineTo(x, height - 14);
    context.stroke();
  }
  for (let y = 30; y < height; y += 58) {
    context.beginPath();
    context.moveTo(14, y);
    context.lineTo(width - 14, y);
    context.stroke();
  }
  context.fillStyle = 'rgba(244, 240, 213, 0.78)';
  context.font = '700 12px "Courier New", monospace';
  context.fillText('REGIONAL WX MACHINE', 20, 28);
  context.fillText('OBS GRID', width - 76, 28);
  context.restore();
}

function drawRegionalPrecipitation(context, width, height, precipitation) {
  const rainAlpha = Math.max(0.1, Math.min(0.5, precipitation / 100));
  context.fillStyle = `rgba(42, 170, 78, ${rainAlpha})`;
  context.beginPath();
  context.ellipse(width * 0.28, height * 0.52, width * 0.26, height * 0.2, -0.26, 0, Math.PI * 2);
  context.fill();

  if (precipitation > 35) {
    context.fillStyle = 'rgba(236, 226, 78, 0.32)';
    context.beginPath();
    context.ellipse(width * 0.38, height * 0.44, width * 0.12, height * 0.09, -0.32, 0, Math.PI * 2);
    context.fill();
  }

  if (precipitation > 55) {
    context.fillStyle = 'rgba(232, 77, 54, 0.28)';
    context.beginPath();
    context.ellipse(width * 0.45, height * 0.38, width * 0.07, height * 0.05, -0.32, 0, Math.PI * 2);
    context.fill();
  }
}

function drawRegionalBoundaries(context, width, height) {
  context.strokeStyle = 'rgba(16, 18, 24, 0.82)';
  context.lineWidth = 3;
  [
    [[0.06, 0.18], [0.36, 0.16], [0.72, 0.12], [0.96, 0.18]],
    [[0.12, 0.38], [0.32, 0.34], [0.52, 0.44], [0.86, 0.42]],
    [[0.1, 0.66], [0.28, 0.58], [0.56, 0.68], [0.86, 0.62]],
    [[0.26, 0.08], [0.24, 0.36], [0.31, 0.68], [0.28, 0.95]],
    [[0.56, 0.03], [0.52, 0.28], [0.6, 0.52], [0.57, 0.93]]
  ].forEach((line) => {
    context.beginPath();
    line.forEach(([x, y], index) => {
      if (index === 0) {
        context.moveTo(x * width, y * height);
      } else {
        context.lineTo(x * width, y * height);
      }
    });
    context.stroke();
  });

  context.strokeStyle = 'rgba(244, 240, 213, 0.22)';
  context.lineWidth = 1;
  context.strokeRect(10, 10, width - 20, height - 20);
}

function drawRegionalStations(context, stations, settings, width, height, location) {
  const shown = stations.slice(0, 4);
  const anchors = shown.map((station, index) => stationAnchor(station, index, width, height, location));
  const callouts = layoutRegionalCallouts(context, shown, anchors, width, height, location);

  callouts.forEach((callout) => drawRegionalLeader(context, callout));
  callouts.forEach((callout) => drawRegionalCallout(context, callout, settings));
  callouts.forEach((callout) => drawStationDot(context, callout.anchor.x, callout.anchor.y));
}

function stationAnchor(station, index, width, height, location) {
  const fallbackPoints = [
    [0.18, 0.22], [0.48, 0.2], [0.74, 0.26], [0.22, 0.52],
    [0.52, 0.5], [0.78, 0.56], [0.32, 0.78], [0.66, 0.78]
  ];
  const projected = stationPoint(station, width, height, location);
  const [xFactor, yFactor] = fallbackPoints[index] || [0.5, 0.5];
  return {
    x: projected ? projected.x : xFactor * width,
    y: projected ? projected.y : yFactor * height
  };
}

function layoutRegionalCallouts(context, stations, anchors, width, height, location) {
  const bounds = { left: 14, top: 36, right: width - 14, bottom: height - 54 };
  const home = regionalHomeObstacle(context, location, width, height);
  const dots = anchors.map((anchor) => ({
    x: anchor.x - 7,
    y: anchor.y - 7,
    width: 14,
    height: 14
  }));
  const callouts = stations.map((station, index) => {
    const city = station.city || '';
    let fontSize = 18;
    context.font = `700 ${fontSize}px "Courier New", monospace`;
    while (fontSize > 13 && context.measureText(city).width > 150) {
      fontSize -= 1;
      context.font = `700 ${fontSize}px "Courier New", monospace`;
    }
    return {
      station,
      anchor: anchors[index],
      fontSize,
      rect: {
        x: bounds.left,
        y: bounds.top,
        width: clamp(Math.ceil(context.measureText(city).width) + 64, 132, 214),
        height: 58
      }
    };
  });
  const placed = [];

  callouts
    .map((callout, index) => ({ index, crowd: anchorCrowd(anchors, index) }))
    .sort((first, second) => second.crowd - first.crowd)
    .forEach(({ index }) => {
      const callout = callouts[index];
      let best = callout.rect;
      let bestScore = Infinity;
      regionalCalloutCandidates(callout, bounds).forEach((rect) => {
        const score = scoreRegionalCallout(rect, callout.anchor, placed, home, dots);
        if (score < bestScore) {
          bestScore = score;
          best = rect;
        }
      });
      callout.rect = best;
      placed.push(callout);
    });

  return callouts;
}

function anchorCrowd(anchors, index) {
  const anchor = anchors[index];
  return anchors.reduce((total, other, otherIndex) => {
    if (otherIndex === index) {
      return total;
    }
    return total + 1 / (Math.hypot(anchor.x - other.x, anchor.y - other.y) + 1);
  }, 0);
}

function regionalCalloutCandidates(callout, bounds) {
  const boxWidth = callout.rect.width;
  const boxHeight = callout.rect.height;
  const anchor = callout.anchor;
  const seen = new Set();
  const rects = [];
  const add = (x, y) => {
    const rect = {
      x: clamp(Math.round(x), bounds.left, Math.max(bounds.left, bounds.right - boxWidth)),
      y: clamp(Math.round(y), bounds.top, Math.max(bounds.top, bounds.bottom - boxHeight)),
      width: boxWidth,
      height: boxHeight
    };
    const key = `${rect.x},${rect.y}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    rects.push(rect);
  };

  [22, 46, 78, 120, 170].forEach((gap) => {
    const diagonal = gap / Math.SQRT2;
    add(anchor.x - boxWidth / 2, anchor.y - gap - boxHeight);
    add(anchor.x - boxWidth / 2, anchor.y + gap);
    add(anchor.x - gap - boxWidth, anchor.y - boxHeight / 2);
    add(anchor.x + gap, anchor.y - boxHeight / 2);
    add(anchor.x - diagonal - boxWidth, anchor.y - diagonal - boxHeight);
    add(anchor.x + diagonal, anchor.y - diagonal - boxHeight);
    add(anchor.x - diagonal - boxWidth, anchor.y + diagonal);
    add(anchor.x + diagonal, anchor.y + diagonal);
  });

  const midX = (bounds.left + bounds.right - boxWidth) / 2;
  const midY = (bounds.top + bounds.bottom - boxHeight) / 2;
  [
    [bounds.left, bounds.top],
    [midX, bounds.top],
    [bounds.right - boxWidth, bounds.top],
    [bounds.left, midY],
    [bounds.right - boxWidth, midY],
    [bounds.left, bounds.bottom - boxHeight],
    [midX, bounds.bottom - boxHeight],
    [bounds.right - boxWidth, bounds.bottom - boxHeight]
  ].forEach(([x, y]) => add(x, y));

  return rects;
}

function scoreRegionalCallout(rect, anchor, placed, home, dots) {
  const target = closestPointOnRect(anchor, rect);
  let score = Math.hypot(target.x - anchor.x, target.y - anchor.y);
  if (score < 18) {
    score += 4000;
  }

  placed.forEach((other) => {
    const overlap = rectOverlapArea(rect, other.rect, 8);
    if (overlap > 0) {
      score += 100000 + overlap;
    }
    if (segmentHitsRect(anchor.x, anchor.y, target.x, target.y, other.rect)) {
      score += 90000;
    }
    const otherTarget = closestPointOnRect(other.anchor, other.rect);
    if (segmentsCross(
      anchor.x, anchor.y, target.x, target.y,
      other.anchor.x, other.anchor.y, otherTarget.x, otherTarget.y
    )) {
      score += 6000;
    }
  });

  const homeOverlap = rectOverlapArea(rect, home, 8);
  if (homeOverlap > 0) {
    score += 100000 + homeOverlap;
  }
  if (!pointInRect(anchor.x, anchor.y, home)
    && segmentHitsRect(anchor.x, anchor.y, target.x, target.y, home)) {
    score += 40000;
  }

  dots.forEach((dot) => {
    const overlap = rectOverlapArea(rect, dot, 3);
    if (overlap > 0) {
      score += 80000 + overlap;
    }
  });

  return score;
}

function regionalHomeObstacle(context, location, width, height) {
  const x = width * 0.5;
  const y = height * 0.54;
  const label = String(location.city || '').toUpperCase();
  context.font = '700 15px "Courier New", monospace';
  const textWidth = label ? context.measureText(label).width : 0;
  const left = x - 14;
  const right = Math.max(x + 14, x + 18 + textWidth);
  return {
    x: left,
    y: y - 14,
    width: right - left,
    height: 28
  };
}

function closestPointOnRect(anchor, rect) {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  if (anchor.x > rect.x && anchor.x < right && anchor.y > rect.y && anchor.y < bottom) {
    return [
      { x: rect.x, y: anchor.y, distance: anchor.x - rect.x },
      { x: right, y: anchor.y, distance: right - anchor.x },
      { x: anchor.x, y: rect.y, distance: anchor.y - rect.y },
      { x: anchor.x, y: bottom, distance: bottom - anchor.y }
    ].sort((first, second) => first.distance - second.distance)[0];
  }

  return {
    x: clamp(anchor.x, rect.x, right),
    y: clamp(anchor.y, rect.y, bottom)
  };
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function rectOverlapArea(first, second, padding) {
  const left = Math.max(first.x - padding, second.x);
  const right = Math.min(first.x + first.width + padding, second.x + second.width);
  const top = Math.max(first.y - padding, second.y);
  const bottom = Math.min(first.y + first.height + padding, second.y + second.height);
  if (right <= left || bottom <= top) {
    return 0;
  }
  return (right - left) * (bottom - top);
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const direction = (px, py, qx, qy, rx, ry) => (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
  const first = direction(ax, ay, bx, by, cx, cy);
  const second = direction(ax, ay, bx, by, dx, dy);
  const third = direction(cx, cy, dx, dy, ax, ay);
  const fourth = direction(cx, cy, dx, dy, bx, by);
  if (first === 0 && second === 0 && third === 0 && fourth === 0) {
    return false;
  }
  return (first > 0) !== (second > 0) && (third > 0) !== (fourth > 0);
}

function segmentHitsRect(x1, y1, x2, y2, rect) {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const edges = [
    [rect.x, rect.y, right, rect.y],
    [right, rect.y, right, bottom],
    [right, bottom, rect.x, bottom],
    [rect.x, bottom, rect.x, rect.y]
  ];
  return pointInRect(x1, y1, rect)
    || pointInRect(x2, y2, rect)
    || edges.some(([ex1, ey1, ex2, ey2]) => segmentsCross(x1, y1, x2, y2, ex1, ey1, ex2, ey2));
}

function drawRegionalLeader(context, callout) {
  const anchor = callout.anchor;
  const target = closestPointOnRect(anchor, callout.rect);
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const length = Math.hypot(dx, dy) || 1;
  if (length < 8) {
    return;
  }

  context.save();
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(anchor.x + (dx / length) * 7, anchor.y + (dy / length) * 7);
  context.lineTo(target.x, target.y);
  context.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  context.lineWidth = 4;
  context.stroke();
  context.strokeStyle = 'rgba(244, 240, 213, 0.9)';
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function drawRegionalCallout(context, callout, settings) {
  const rect = callout.rect;
  const station = callout.station;
  context.fillStyle = 'rgba(8, 14, 24, 0.76)';
  context.strokeStyle = 'rgba(244, 240, 213, 0.56)';
  context.lineWidth = 2;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.save();
  context.translate(rect.x + 7, rect.y + 17);
  context.scale(0.42, 0.42);
  drawStationWeatherGlyph(context, station.condition, 0, 0);
  context.restore();

  context.font = `700 ${callout.fontSize}px "Courier New", monospace`;
  context.fillStyle = '#f4f0d5';
  context.strokeStyle = 'rgba(0, 0, 0, 0.86)';
  context.lineWidth = 3;
  context.strokeText(station.city, rect.x + 42, rect.y + 22);
  context.fillText(station.city, rect.x + 42, rect.y + 22);

  const temp = settings.units === 'metric'
    ? `${Math.round((station.tempF - 32) * 5 / 9)}`
    : `${Math.round(station.tempF)}`;
  context.font = '700 25px "Courier New", monospace';
  context.fillStyle = '#e7e85d';
  context.strokeText(temp, rect.x + 42, rect.y + 48);
  context.fillText(temp, rect.x + 42, rect.y + 48);
}

function drawStationDot(context, x, y) {
  context.fillStyle = 'rgba(244, 240, 213, 0.88)';
  context.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 4, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function stationPoint(station, width, height, location) {
  const lat = Number(station.lat);
  const lon = Number(station.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const centerLat = Number(location?.lat) || lat;
  const centerLon = Number(location?.lon) || lon;
  const milesPerDegreeLat = 69;
  const milesPerDegreeLon = Math.max(20, Math.cos(centerLat * Math.PI / 180) * 69);
  const x = width * 0.5 + ((lon - centerLon) * milesPerDegreeLon / 180) * width;
  const y = height * 0.5 - ((lat - centerLat) * milesPerDegreeLat / 130) * height;
  if (x < 30 || x > width - 110 || y < 38 || y > height - 72) {
    return null;
  }

  return { x, y };
}

function drawStationWeatherGlyph(context, condition, x, y) {
  const key = String(condition || '').toLowerCase();
  context.save();
  context.translate(x, y);

  context.fillStyle = '#d9d9d9';
  context.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(28, 20, 15, Math.PI, 0);
  context.arc(46, 18, 18, Math.PI, 0);
  context.arc(62, 24, 12, Math.PI, 0);
  context.lineTo(72, 32);
  context.lineTo(18, 32);
  context.closePath();
  context.fill();
  context.stroke();

  if (key.includes('sun') || key.includes('clear') || key.includes('fair')) {
    context.fillStyle = '#f1d254';
    context.beginPath();
    context.arc(22, 14, 14, 0, Math.PI * 2);
    context.fill();
  }

  if (key.includes('rain') || key.includes('storm')) {
    context.strokeStyle = '#83cfff';
    context.lineWidth = 3;
    [28, 45, 62].forEach((offset) => {
      context.beginPath();
      context.moveTo(offset, 38);
      context.lineTo(offset - 10, 54);
      context.stroke();
    });
  }

  if (key.includes('storm') || key.includes('thunder')) {
    context.fillStyle = '#f1d254';
    context.beginPath();
    context.moveTo(51, 32);
    context.lineTo(42, 52);
    context.lineTo(54, 49);
    context.lineTo(47, 68);
    context.lineTo(68, 42);
    context.lineTo(55, 45);
    context.closePath();
    context.fill();
  }

  context.restore();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function drawRegionalHome(context, location, width, height) {
  const x = width * 0.5;
  const y = height * 0.54;
  context.strokeStyle = '#f4f0d5';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x - 10, y);
  context.lineTo(x + 10, y);
  context.moveTo(x, y - 10);
  context.lineTo(x, y + 10);
  context.stroke();

  if (location.city) {
    context.font = '700 15px "Courier New", monospace';
    context.fillStyle = '#f4f0d5';
    context.fillText(location.city.toUpperCase(), x + 14, y + 4);
  }
}

function drawRegionalFooter(context, width, height, precipitation, isDemo, hasBaseMap) {
  context.fillStyle = 'rgba(0, 0, 0, 0.58)';
  context.fillRect(12, height - 48, width - 24, 36);
  context.font = '700 17px "Courier New", monospace';
  context.fillStyle = '#f4f0d5';
  context.fillText(`WX-MAP ${Math.round(precipitation)}% PRECIP  ${isDemo ? 'DEMO OBS' : 'NWS OBS'}  ${hasBaseMap ? 'BASE LOCK' : 'GRID BASE'}`, 28, height - 25);
}

function regionalPrecipitation(report) {
  const hourly = report.hourly || [];
  const daily = report.daily || [];
  const hourlyMax = hourly.slice(0, 4).reduce((max, hour) => Math.max(max, Number(hour.precipitation) || 0), 0);
  const dailyMax = daily.slice(0, 2).reduce((max, day) => Math.max(max, Number(day.precipitation) || 0), 0);
  return Math.max(hourlyMax, dailyMax);
}

Object.assign(RetroWeather, {
  drawRadar,
  drawRegionalMap
});
}());
