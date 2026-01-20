const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const config = {
  gridSpacing: 120,
  nodeSize: 26,
  baseScanSeconds: 10,
  baseHackSeconds: 10,
  scanStepSeconds: 1.5,
  maxAlert: 5,
  maxScanLevel: 3,
};

const NODE_TYPE_GROUPS = [
  { tier: 0, names: ['House', 'Apartment'], secMin: 1, secMax: 1 },
  { tier: 1, names: ['Donut Shop', 'Coffee Shop', 'Restaurant', 'Candy Store', 'Bookstore', 'Arcade'], secMin: 1, secMax: 2 },
  { tier: 2, names: ['Grocery Store', 'Furniture Store', 'Hardware Store', 'Pharmacy', 'Clothing Store'], secMin: 2, secMax: 3 },
  { tier: 2.5, names: ['Train Station', 'Hospital', 'Water Treatment', 'School', 'Office Building', 'Town Hall'], secMin: 2, secMax: 4 },
  { tier: 3.5, names: ['Pharma Co', 'Tech Co', 'Finance Co', 'Insurance Co', 'Media Co'], secMin: 3, secMax: 4 },
  { tier: 4.5, names: ['Military Base', 'Police HQ', 'Bank', 'Power Station', 'Research Lab'], secMin: 4, secMax: 5 },
];

const state = {
  time: 0,
  lastTime: 0,
  view: {
    width: 0,
    height: 0,
    origin: { x: 0, y: 0 },
    pan: { x: 0, y: 0 },
  },
  player: {
    money: 0,
    hacking: 1,
    scanning: 1,
    stealth: 1,
    alert: 0,
  },
  alertDecayTimer: 0,
  nodes: [],
  selectedId: null,
  gameOver: false,
  ui: {
    rects: [],
    keyActions: [],
  },
  pointer: {
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    mode: 'map',
  },
};

let nextNodeId = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isPointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function stars(count) {
  return '*'.repeat(count);
}

function progressBar(progress, width) {
  const filled = Math.round(progress * width);
  return `[${'='.repeat(filled)}${' '.repeat(width - filled)}]`;
}

function maskedStars(value, reveal) {
  return reveal ? stars(value) : '?????';
}

function scanDuration(level) {
  const duration = config.baseScanSeconds - (level - 1) * config.scanStepSeconds;
  return clamp(duration, 3, config.baseScanSeconds);
}

function distanceFromHome(x, y) {
  return Math.abs(x) + Math.abs(y);
}

function maxTierForDistance(distance) {
  if (distance <= 1) {
    return 1;
  }
  if (distance <= 3) {
    return 2.5;
  }
  if (distance <= 5) {
    return 3.5;
  }
  return 4.5;
}

function pickNodeType(distance) {
  const maxTier = maxTierForDistance(distance);
  const desiredTier = clamp(distance / 2, 0, maxTier);
  const candidates = NODE_TYPE_GROUPS.filter((group) => group.tier <= maxTier);
  let total = 0;
  const weights = candidates.map((group) => {
    const weight = 1 / (1 + Math.abs(group.tier - desiredTier));
    total += weight;
    return weight;
  });
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) {
      const group = candidates[i];
      const name = group.names[randomInt(0, group.names.length - 1)];
      return { name, secMin: group.secMin, secMax: group.secMax };
    }
  }
  const fallback = candidates[candidates.length - 1];
  return {
    name: fallback.names[0],
    secMin: fallback.secMin,
    secMax: fallback.secMax,
  };
}

function createNode(x, y, status) {
  if (status === 'home') {
    return {
      id: nextNodeId++,
      x,
      y,
      status,
      type: 'Home',
      security: 1,
      resources: 1,
      action: null,
      failTimer: 0,
      scanLevel: config.maxScanLevel,
    };
  }
  const typeInfo = pickNodeType(distanceFromHome(x, y));
  return {
    id: nextNodeId++,
    x,
    y,
    status,
    type: typeInfo.name,
    security: randomInt(typeInfo.secMin, typeInfo.secMax),
    resources: 1 + Math.floor(Math.random() * 5),
    action: null,
    failTimer: 0,
    scanLevel: 0,
  };
}

function initNodes() {
  const home = createNode(0, 0, 'home');
  const unknownA = createNode(1, 0, 'unknown');
  const unknownB = createNode(0, 1, 'unknown');
  state.nodes = [home, unknownA, unknownB];
  state.selectedId = home.id;
}

function getNodeById(id) {
  return state.nodes.find((node) => node.id === id) || null;
}

function getNodeAtGrid(x, y) {
  return state.nodes.find((node) => node.x === x && node.y === y) || null;
}

function listNeighbors(node) {
  return [
    { x: node.x + 1, y: node.y },
    { x: node.x - 1, y: node.y },
    { x: node.x, y: node.y + 1 },
    { x: node.x, y: node.y - 1 },
  ];
}

function revealAdjacent(node) {
  const candidates = listNeighbors(node)
    .filter((pos) => !getNodeAtGrid(pos.x, pos.y));
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const revealCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < revealCount; i += 1) {
    const pos = candidates[i];
    if (pos) {
      state.nodes.push(createNode(pos.x, pos.y, 'unknown'));
    }
  }
}

function startScan(node) {
  if (!node || node.status === 'home' || node.status === 'hacked' || node.action || state.gameOver) {
    return;
  }
  if (node.scanLevel >= config.maxScanLevel) {
    return;
  }
  node.action = {
    type: 'scan',
    start: state.time,
    duration: scanDuration(state.player.scanning),
    progress: 0,
  };
}

function startHack(node) {
  if (!node || node.status !== 'scanned' || node.action || state.gameOver) {
    return;
  }
  node.action = {
    type: 'hack',
    start: state.time,
    duration: config.baseHackSeconds,
    progress: 0,
  };
}

function resolveHack(node) {
  const chance = clamp(0.35 + (state.player.hacking - node.security) * 0.15, 0.1, 0.9);
  if (Math.random() <= chance) {
    node.status = 'hacked';
    node.scanLevel = config.maxScanLevel;
    state.player.money += node.resources * 25;
    revealAdjacent(node);
    return;
  }
  node.failTimer = 1.5;
  state.player.alert = clamp(state.player.alert + 1, 0, config.maxAlert);
  if (state.player.alert >= config.maxAlert) {
    state.gameOver = true;
  }
}

function update(dt) {
  state.time += dt;
  if (!state.gameOver && state.player.alert > 0) {
    state.alertDecayTimer += dt;
    while (state.alertDecayTimer >= 60 && state.player.alert > 0) {
      state.player.alert -= 1;
      state.alertDecayTimer -= 60;
    }
  } else if (state.player.alert === 0) {
    state.alertDecayTimer = 0;
  }
  for (const node of state.nodes) {
    if (node.failTimer > 0) {
      node.failTimer = Math.max(0, node.failTimer - dt);
    }
    if (!node.action) {
      continue;
    }
    const progress = (state.time - node.action.start) / node.action.duration;
    node.action.progress = clamp(progress, 0, 1);
    if (progress < 1) {
      continue;
    }
    if (node.action.type === 'scan') {
      node.scanLevel = Math.min(config.maxScanLevel, node.scanLevel + 1);
      if (node.status === 'unknown') {
        node.status = 'scanned';
      }
    } else if (node.action.type === 'hack') {
      resolveHack(node);
    }
    node.action = null;
  }
}

function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  state.view.width = rect.width;
  state.view.height = rect.height;
  state.view.origin.x = rect.width / 2;
  state.view.origin.y = rect.height / 2 + 40;
}

function gridToScreen(node) {
  return {
    x: state.view.origin.x + state.view.pan.x + node.x * config.gridSpacing,
    y: state.view.origin.y + state.view.pan.y + node.y * config.gridSpacing,
  };
}

function drawBackground() {
  ctx.fillStyle = '#050b07';
  ctx.fillRect(0, 0, state.view.width, state.view.height);
}

function drawScanlines() {
  ctx.strokeStyle = 'rgba(18, 30, 22, 0.35)';
  ctx.lineWidth = 1;
  for (let y = 0; y < state.view.height; y += 2) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(state.view.width, y + 0.5);
    ctx.stroke();
  }
}

function maxPairLength(pairs) {
  let max = 0;
  for (const [label, value] of pairs) {
    max = Math.max(max, label.length + 1 + value.length);
  }
  return max;
}

function frameColumnsForPairs(title, pairs, minCols) {
  const labelLength = title ? title.length + 2 : 0;
  const contentLength = maxPairLength(pairs);
  const innerWidth = Math.max(contentLength, labelLength, minCols - 2);
  return innerWidth + 2;
}

function buildFrameLines(title, lines, cols) {
  const innerWidth = cols - 2;
  let top = `┌${'─'.repeat(innerWidth)}┐`;
  if (title) {
    const label = ` ${title} `;
    const tail = Math.max(0, innerWidth - label.length);
    top = `┌${label}${'─'.repeat(tail)}┐`;
  }
  const body = lines.map((line) => `│${line.padEnd(innerWidth, ' ')}│`);
  const bottom = `└${'─'.repeat(innerWidth)}┘`;
  return [top, ...body, bottom];
}

function drawFrameLines(lines, x, y, lineHeight) {
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
}

function buildKeyValueLines(pairs, innerWidth) {
  const lines = [];
  for (const [label, rawValue] of pairs) {
    let value = rawValue;
    const maxValueLength = Math.max(0, innerWidth - label.length - 1);
    if (value.length > maxValueLength) {
      value = value.slice(0, maxValueLength);
    }
    const gap = Math.max(1, innerWidth - label.length - value.length);
    lines.push(`${label}${' '.repeat(gap)}${value}`);
  }
  return lines;
}

function drawHud() {
  ctx.font = '18px "VT323", "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#8bffb0';

  const lineHeight = 20;
  const statsPairs = [
    ['Money', `\u0024${state.player.money}`],
    ['Hack Lvl.', stars(state.player.hacking)],
    ['Scan Lvl.', stars(state.player.scanning)],
    ['Stealth', stars(state.player.stealth)],
    ['Alert', stars(state.player.alert)],
  ];

  const target = getNodeById(state.selectedId);
  const targetPairs = [];
  if (target) {
    const typeKnown = target.status === 'home' || target.status === 'hacked' || target.scanLevel >= 1;
    const securityKnown = target.status === 'home' || target.status === 'hacked' || target.scanLevel >= 2;
    const resourcesKnown = target.status === 'home' || target.status === 'hacked' || target.scanLevel >= 3;
    targetPairs.push(['Type', typeKnown ? target.type.toUpperCase() : 'UNKNOWN']);
    targetPairs.push(['Status', target.status.toUpperCase()]);
    targetPairs.push(['Security', maskedStars(target.security, securityKnown)]);
    targetPairs.push(['Resources', maskedStars(target.resources, resourcesKnown)]);
    if (target.action) {
      const bar = progressBar(target.action.progress, 10);
      targetPairs.push(['Action', `${target.action.type.toUpperCase()} ${bar}`]);
    } else {
      targetPairs.push(['Action', 'IDLE']);
    }
  } else {
    targetPairs.push(['Target', 'NONE']);
  }

  const minCols = 32;
  const cols = Math.max(
    frameColumnsForPairs('PLAYER', statsPairs, minCols),
    frameColumnsForPairs('TARGET', targetPairs, minCols),
  );
  const innerWidth = cols - 2;

  const statsFrame = buildFrameLines('PLAYER', buildKeyValueLines(statsPairs, innerWidth), cols);
  const targetFrame = buildFrameLines('TARGET', buildKeyValueLines(targetPairs, innerWidth), cols);

  const x = 20;
  let y = 16;
  drawFrameLines(statsFrame, x, y, lineHeight);
  y += statsFrame.length * lineHeight + 10;
  drawFrameLines(targetFrame, x, y, lineHeight);

  const keysLine = 'Scan (s) / Hack (h) / Select (tab, arrows)';
  const keysCols = Math.max(minCols, keysLine.length + 2);
  const keysFrame = buildFrameLines('', [keysLine], keysCols);
  const footerY = state.view.height - keysFrame.length * lineHeight - 14;
  drawFrameLines(keysFrame, x, footerY, lineHeight);

  const charWidth = ctx.measureText('M').width;
  const statsRect = {
    x,
    y: 16,
    width: statsFrame[0].length * charWidth,
    height: statsFrame.length * lineHeight,
  };
  const targetRect = {
    x,
    y: 16 + statsFrame.length * lineHeight + 10,
    width: targetFrame[0].length * charWidth,
    height: targetFrame.length * lineHeight,
  };
  const keysRect = {
    x,
    y: footerY,
    width: keysFrame[0].length * charWidth,
    height: keysFrame.length * lineHeight,
  };
  const keysLineIndex = 1;
  const keysLineY = footerY + keysLineIndex * lineHeight;
  const innerX = x + charWidth;
  const scanLabel = 'Scan (s)';
  const hackLabel = 'Hack (h)';
  const scanIndex = keysLine.indexOf(scanLabel);
  const hackIndex = keysLine.indexOf(hackLabel);
  const keyActions = [];
  if (scanIndex >= 0) {
    keyActions.push({
      type: 'scan',
      x: innerX + scanIndex * charWidth,
      y: keysLineY,
      width: scanLabel.length * charWidth,
      height: lineHeight,
    });
  }
  if (hackIndex >= 0) {
    keyActions.push({
      type: 'hack',
      x: innerX + hackIndex * charWidth,
      y: keysLineY,
      width: hackLabel.length * charWidth,
      height: lineHeight,
    });
  }
  state.ui.rects = [statsRect, targetRect, keysRect];
  state.ui.keyActions = keyActions;
}

function nodeColors(status) {
  switch (status) {
    case 'home':
      return { stroke: '#3cff8f', glow: '#8bffb0', text: '#8bffb0' };
    case 'unknown':
      return { stroke: '#4a5a52', glow: '#1f2924', text: '#4a5a52' };
    case 'scanned':
      return { stroke: '#cfe7d1', glow: '#7cff9a', text: '#cfe7d1' };
    case 'hacked':
      return { stroke: '#8bffb0', glow: '#caffda', text: '#8bffb0' };
    default:
      return { stroke: '#4a5a52', glow: '#1f2924', text: '#4a5a52' };
  }
}

function drawConnections() {
  ctx.strokeStyle = 'rgba(60, 255, 143, 0.25)';
  ctx.lineWidth = 1;
  for (const node of state.nodes) {
    const right = getNodeAtGrid(node.x + 1, node.y);
    const down = getNodeAtGrid(node.x, node.y + 1);
    if (right) {
      const a = gridToScreen(node);
      const b = gridToScreen(right);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (down) {
      const a = gridToScreen(node);
      const b = gridToScreen(down);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

function drawNode(node) {
  const pos = gridToScreen(node);
  const size = config.nodeSize;
  const colors = nodeColors(node.status);

  ctx.fillStyle = '#050b07';
  ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);

  if (node.id === state.selectedId) {
    ctx.strokeStyle = '#caffda';
    ctx.lineWidth = 1;
    ctx.strokeRect(pos.x - size / 2 - 5, pos.y - size / 2 - 5, size + 10, size + 10);
  }

  ctx.font = '14px "VT323", "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colors.text;
  const label = node.status === 'unknown' || node.scanLevel === 0 ? 'UNKNOWN' : node.type.toUpperCase();
  const shortLabel = label.length > 12 ? label.slice(0, 12) : label;
  ctx.fillText(shortLabel, pos.x, pos.y + size / 2 + 6);

  if (node.failTimer > 0) {
    ctx.fillStyle = '#ff5f5f';
    ctx.font = '20px "VT323", "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', pos.x, pos.y);
  }

  if (node.action) {
    ctx.font = '14px "VT323", "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const bar = progressBar(node.action.progress, 10);
    const label = `${node.action.type.toUpperCase()} ${bar}`;
    ctx.fillStyle = '#cfe7d1';
    ctx.fillText(label, pos.x, pos.y - size / 2 - 20);
  }
}

function drawGameOver() {
  if (!state.gameOver) {
    return;
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, state.view.width, state.view.height);
  ctx.fillStyle = '#ff5f5f';
  ctx.font = '32px "VT323", "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUSTED!', state.view.width / 2, state.view.height / 2 - 8);
  ctx.fillStyle = '#cfe7d1';
  ctx.font = '18px "VT323", "IBM Plex Mono", monospace';
  ctx.fillText('REFRESH TO RESTART', state.view.width / 2, state.view.height / 2 + 24);
}

function draw() {
  drawBackground();
  drawConnections();
  for (const node of state.nodes) {
    drawNode(node);
  }
  drawHud();
  drawScanlines();
  drawGameOver();
}

function selectNext(delta) {
  const list = [...state.nodes].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const index = list.findIndex((node) => node.id === state.selectedId);
  const next = list[(index + delta + list.length) % list.length];
  if (next) {
    state.selectedId = next.id;
  }
}

function selectDirection(dx, dy) {
  const current = getNodeById(state.selectedId);
  if (!current) {
    return;
  }
  let best = null;
  let bestScore = Infinity;
  for (const node of state.nodes) {
    if (node.id === current.id) {
      continue;
    }
    const offsetX = node.x - current.x;
    const offsetY = node.y - current.y;
    if (dx !== 0 && Math.sign(offsetX) !== dx) {
      continue;
    }
    if (dy !== 0 && Math.sign(offsetY) !== dy) {
      continue;
    }
    const primary = dx !== 0 ? Math.abs(offsetX) : Math.abs(offsetY);
    const secondary = dx !== 0 ? Math.abs(offsetY) : Math.abs(offsetX);
    const score = primary * 10 + secondary * 4;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }
  if (best) {
    state.selectedId = best.id;
  }
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab', 's', 'h'].includes(key)) {
    event.preventDefault();
  }
  if (key === 'tab') {
    selectNext(event.shiftKey ? -1 : 1);
    return;
  }
  if (key === 'arrowup') {
    selectDirection(0, -1);
  } else if (key === 'arrowdown') {
    selectDirection(0, 1);
  } else if (key === 'arrowleft') {
    selectDirection(-1, 0);
  } else if (key === 'arrowright') {
    selectDirection(1, 0);
  } else if (key === 's') {
    startScan(getNodeById(state.selectedId));
  } else if (key === 'h') {
    startHack(getNodeById(state.selectedId));
  }
}

function onPointerDown(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const inUi = state.ui.rects.some((rectItem) => isPointInRect(x, y, rectItem));
  state.pointer.active = true;
  state.pointer.dragging = false;
  state.pointer.startX = x;
  state.pointer.startY = y;
  state.pointer.lastX = x;
  state.pointer.lastY = y;
  state.pointer.mode = inUi ? 'ui' : 'map';
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!state.pointer.active) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const totalDx = x - state.pointer.startX;
  const totalDy = y - state.pointer.startY;
  const dx = x - state.pointer.lastX;
  const dy = y - state.pointer.lastY;
  if (state.pointer.mode === 'map') {
    if (!state.pointer.dragging && Math.hypot(totalDx, totalDy) > 4) {
      state.pointer.dragging = true;
    }
    if (state.pointer.dragging) {
      state.view.pan.x += dx;
      state.view.pan.y += dy;
    }
  }
  state.pointer.lastX = x;
  state.pointer.lastY = y;
}

function onPointerUp(event) {
  if (!state.pointer.active) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (!state.pointer.dragging) {
    if (state.pointer.mode === 'ui') {
      for (const action of state.ui.keyActions) {
        if (isPointInRect(x, y, action)) {
          const node = getNodeById(state.selectedId);
          if (action.type === 'scan') {
            startScan(node);
          } else if (action.type === 'hack') {
            startHack(node);
          }
          break;
        }
      }
    } else {
      const size = config.nodeSize;
      for (const node of state.nodes) {
        const pos = gridToScreen(node);
        if (Math.abs(x - pos.x) <= size / 2 && Math.abs(y - pos.y) <= size / 2) {
          state.selectedId = node.id;
          break;
        }
      }
    }
  }
  state.pointer.active = false;
  state.pointer.dragging = false;
  canvas.releasePointerCapture(event.pointerId);
}

function frame(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }
  const dt = (timestamp - state.lastTime) / 1000;
  state.lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

initNodes();
resize();
window.addEventListener('resize', resize);
window.addEventListener('keydown', onKeyDown);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
requestAnimationFrame(frame);
