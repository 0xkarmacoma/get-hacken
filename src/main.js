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
  maxUpgradeLevel: 5,
  labelOffset: 10,
  logLines: 6,
};

const NODE_TYPE_GROUPS = [
  { tier: 0, names: ['House', 'Apartment'], secMin: 1, secMax: 1 },
  { tier: 1, names: ['Donut Shop', 'Coffee Shop', 'Restaurant', 'Candy Store', 'Bookstore', 'Arcade'], secMin: 1, secMax: 2 },
  { tier: 2, names: ['Grocery Store', 'Furniture Store', 'Hardware Store', 'Pharmacy', 'Clothing Store'], secMin: 2, secMax: 3 },
  { tier: 2.5, names: ['Train Station', 'Hospital', 'Water Treatment', 'School', 'Office Building', 'Town Hall'], secMin: 2, secMax: 4 },
  { tier: 3.5, names: ['Pharma Co', 'Tech Co', 'Finance Co', 'Insurance Co', 'Media Co'], secMin: 3, secMax: 4 },
  { tier: 4.5, names: ['Military Base', 'Police HQ', 'Bank', 'Power Station', 'Research Lab'], secMin: 4, secMax: 5 },
];

const UPGRADE_OPTIONS = [
  { id: 'hacking', label: 'Hacking Level', shortLabel: 'Hack Lvl.' },
  { id: 'scanning', label: 'Scanning Level', shortLabel: 'Scan Lvl.' },
  { id: 'stealth', label: 'Stealth Level', shortLabel: 'Stealth' },
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
  usedIps: new Set(),
  alertDecayTimer: 0,
  alertPulse: {
    active: false,
    time: 0,
    duration: 0.6,
    seed: 0,
  },
  moneyDisplay: 0,
  moneyAnim: {
    active: false,
    time: 0,
    duration: 0.9,
    startValue: 0,
    endValue: 0,
  },
  log: {
    entries: [],
  },
  shop: {
    open: false,
    selectedIndex: 0,
    itemRects: [],
  },
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

function generateIp() {
  const oct1Options = [10, 20, 30, 40];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const oct1 = oct1Options[randomInt(0, oct1Options.length - 1)];
    const oct2 = randomInt(0, 99);
    const oct3 = randomInt(0, 99);
    const oct4 = randomInt(1, 254);
    const ip = `${oct1}.${oct2}.${oct3}.${oct4}`;
    if (!state.usedIps.has(ip)) {
      state.usedIps.add(ip);
      return ip;
    }
  }
  return `${oct1Options[0]}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function triggerAlertPulse() {
  state.alertPulse.active = true;
  state.alertPulse.time = 0;
  state.alertPulse.seed = Math.random() * 1000;
}

function logEvent(message) {
  state.log.entries.push(`> ${message}`);
  while (state.log.entries.length > config.logLines) {
    state.log.entries.shift();
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function addMoney(amount) {
  state.player.money += amount;
  state.moneyAnim.active = true;
  state.moneyAnim.time = 0;
  state.moneyAnim.startValue = state.moneyDisplay;
  state.moneyAnim.endValue = state.player.money;
}

function upgradeCost(level) {
  return 100 * level;
}

function toggleShop() {
  state.shop.open = !state.shop.open;
  if (state.shop.open) {
    state.shop.selectedIndex = clamp(state.shop.selectedIndex, 0, UPGRADE_OPTIONS.length - 1);
  }
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

function getUpgradeState(option) {
  const level = state.player[option.id];
  const maxed = level >= config.maxUpgradeLevel;
  const cost = maxed ? null : upgradeCost(level);
  return {
    level,
    maxed,
    cost,
    canBuy: !maxed && state.player.money >= cost,
  };
}

function attemptPurchase(index) {
  const option = UPGRADE_OPTIONS[index];
  if (!option) {
    return;
  }
  const info = getUpgradeState(option);
  if (info.maxed) {
    logEvent(`${option.label} maxed`);
    return;
  }
  if (!info.canBuy) {
    logEvent(`funds low ${option.label}`);
    return;
  }
  addMoney(-info.cost);
  state.player[option.id] += 1;
  logEvent(`purchase ${option.label} ${stars(state.player[option.id])} -$${info.cost}`);
}

function createNode(x, y, status) {
  if (status === 'home') {
    const ip = '10.0.0.1';
    state.usedIps.add(ip);
    return {
      id: nextNodeId++,
      x,
      y,
      status,
      type: 'Home',
      ip,
      security: 1,
      resources: 1,
      action: null,
      failTimer: 0,
      scanLevel: config.maxScanLevel,
      vulnerabilities: 0,
    };
  }
  const typeInfo = pickNodeType(distanceFromHome(x, y));
  const ip = generateIp();
  return {
    id: nextNodeId++,
    x,
    y,
    status,
    type: typeInfo.name,
    ip,
    security: randomInt(typeInfo.secMin, typeInfo.secMax),
    resources: 1 + Math.floor(Math.random() * 5),
    action: null,
    failTimer: 0,
    scanLevel: 0,
    vulnerabilities: 0,
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
  const scanLabel = node.scanLevel < config.maxScanLevel ? 'scanning' : 'vuln scan';
  logEvent(`${scanLabel} ${node.ip}...`);
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
    const reward = node.resources * 25;
    addMoney(reward);
    logEvent(`successfully hacked ${node.ip} reward $${reward}`);
    revealAdjacent(node);
    return;
  }
  node.failTimer = 1.5;
  logEvent(`hack failed ${node.ip}`);
  const stealthChance = clamp((state.player.stealth - 1) * 0.15, 0, 0.6);
  if (Math.random() < stealthChance) {
    logEvent(`stealth bypass ${node.ip} alert suppressed`);
    return;
  }
  state.player.alert = clamp(state.player.alert + 1, 0, config.maxAlert);
  triggerAlertPulse();
  logEvent(`alert level ${stars(state.player.alert)}`);
  if (state.player.alert >= config.maxAlert) {
    state.gameOver = true;
  }
}

function update(dt) {
  state.time += dt;
  if (state.alertPulse.active) {
    state.alertPulse.time += dt;
    if (state.alertPulse.time >= state.alertPulse.duration) {
      state.alertPulse.active = false;
    }
  }
  if (state.moneyAnim.active) {
    state.moneyAnim.time += dt;
    const t = clamp(state.moneyAnim.time / state.moneyAnim.duration, 0, 1);
    const eased = easeOutCubic(t);
    const value = state.moneyAnim.startValue + (state.moneyAnim.endValue - state.moneyAnim.startValue) * eased;
    state.moneyDisplay = Math.round(value);
    if (t >= 1) {
      state.moneyAnim.active = false;
      state.moneyDisplay = state.moneyAnim.endValue;
    }
  } else {
    state.moneyDisplay = state.player.money;
  }
  if (!state.gameOver && state.player.alert > 0) {
    state.alertDecayTimer += dt;
    while (state.alertDecayTimer >= 60 && state.player.alert > 0) {
      state.player.alert -= 1;
      state.alertDecayTimer -= 60;
      logEvent(`alert level ${stars(state.player.alert)}`);
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
      if (node.scanLevel < config.maxScanLevel) {
        node.scanLevel = Math.min(config.maxScanLevel, node.scanLevel + 1);
        if (node.status === 'unknown') {
          node.status = 'scanned';
        }
        if (node.scanLevel === 1) {
          logEvent(`${node.ip} identified as ${node.type.toLowerCase()}`);
        } else if (node.scanLevel === 2) {
          logEvent(`${node.ip} security ${stars(node.security)}`);
        } else if (node.scanLevel === 3) {
          logEvent(`${node.ip} resources ${stars(node.resources)}`);
        }
      } else if (node.security > 1) {
        node.security = Math.max(1, node.security - 1);
        node.vulnerabilities += 1;
        logEvent(`vulnerability found ${node.ip}`);
      } else {
        logEvent(`vuln scan clean ${node.ip}`);
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

function maxLineLength(lines) {
  let max = 0;
  for (const line of lines) {
    max = Math.max(max, line.length);
  }
  return max;
}

function frameColumnsForPairs(title, pairs, minCols) {
  const labelLength = title ? title.length + 2 : 0;
  const contentLength = maxPairLength(pairs);
  const innerWidth = Math.max(contentLength, labelLength, minCols - 2);
  return innerWidth + 2;
}

function frameColumnsForLines(title, lines, minCols) {
  const labelLength = title ? title.length + 2 : 0;
  const contentLength = maxLineLength(lines);
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

function drawFrameLines(lines, x, y, lineHeight, skipIndex) {
  for (let i = 0; i < lines.length; i += 1) {
    if (i === skipIndex) {
      continue;
    }
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

function drawConsole() {
  ctx.font = '16px "VT323", "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#8bffb0';

  const lineHeight = 18;
  const lines = state.log.entries.slice(-config.logLines);
  while (lines.length < config.logLines) {
    lines.unshift('');
  }
  const cols = frameColumnsForLines('CONSOLE', lines, 28);
  const frame = buildFrameLines('CONSOLE', lines, cols);
  const charWidth = ctx.measureText('M').width;
  const width = frame[0].length * charWidth;
  const x = state.view.width - width - 20;
  const y = 16;
  drawFrameLines(frame, x, y, lineHeight);

  state.ui.rects.push({
    x,
    y,
    width,
    height: frame.length * lineHeight,
  });
}

function drawShop() {
  ctx.fillStyle = 'rgba(3, 7, 4, 0.92)';
  ctx.fillRect(0, 0, state.view.width, state.view.height);

  ctx.font = '20px "VT323", "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#8bffb0';

  const lineHeight = 22;
  const items = UPGRADE_OPTIONS.map((option) => {
    const info = getUpgradeState(option);
    const current = stars(info.level).padEnd(5, ' ');
    const next = info.maxed ? 'MAX'.padEnd(5, ' ') : stars(info.level + 1).padEnd(5, ' ');
    const price = info.maxed ? '----' : `$${info.cost}`;
    return {
      line: `${option.label.padEnd(16, ' ')} ${current} -> ${next}  ${price}`,
    };
  });

  const headerLines = [
    'Upgrade Console',
    'Up/Down to select',
    'Enter or tap to buy',
    'U to exit',
    '',
  ];
  const itemLines = items.map((item, index) => `${index === state.shop.selectedIndex ? '>' : ' '} ${item.line}`);
  const footerLines = [
    '',
    `Funds $${state.moneyDisplay}`,
  ];
  const lines = [...headerLines, ...itemLines, ...footerLines];
  const cols = frameColumnsForLines('UPGRADE SHOP', lines, 42);
  const frame = buildFrameLines('UPGRADE SHOP', lines, cols);

  const charWidth = ctx.measureText('M').width;
  const width = frame[0].length * charWidth;
  const height = frame.length * lineHeight;
  const x = (state.view.width - width) / 2;
  const y = (state.view.height - height) / 2;

  drawFrameLines(frame, x, y, lineHeight);

  const firstItemIndex = headerLines.length + 1;
  const selectedFrameIndex = firstItemIndex + state.shop.selectedIndex;
  ctx.fillStyle = '#d7ffe7';
  ctx.fillText(frame[selectedFrameIndex], x, y + selectedFrameIndex * lineHeight);

  state.shop.itemRects = [];
  for (let i = 0; i < items.length; i += 1) {
    const lineIndex = firstItemIndex + i;
    state.shop.itemRects.push({
      index: i,
      x,
      y: y + lineIndex * lineHeight,
      width,
      height: lineHeight,
    });
  }
  state.ui.rects.push({ x, y, width, height });
}

function drawHud() {
  drawConsole();
  if (state.shop.open) {
    return;
  }
  ctx.font = '18px "VT323", "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#8bffb0';
  const charWidth = ctx.measureText('M').width;

  const lineHeight = 20;
  const statsPairs = [
    ['Money', `\u0024${state.moneyDisplay}`],
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
    if (target.status === 'scanned' || target.status === 'hacked') {
      targetPairs.push(['Vulnerabilities', `${target.vulnerabilities}`]);
    }
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
  const alertLineIndex = 1 + statsPairs.findIndex((pair) => pair[0] === 'Alert');
  const pulseActive = state.alertPulse.active && state.alertPulse.time < state.alertPulse.duration;
  const blinkActive = state.player.alert >= 4;
  const blinkOn = !blinkActive || Math.floor(state.time * 4) % 2 === 0;
  drawFrameLines(statsFrame, x, y, lineHeight, alertLineIndex);

  if (alertLineIndex >= 0) {
    const alertStars = stars(state.player.alert);
    const alertValue = blinkOn ? alertStars : ' '.repeat(alertStars.length);
    const alertContent = buildKeyValueLines([['Alert', alertValue]], innerWidth)[0];
    const line = `│${alertContent.padEnd(innerWidth, ' ')}│`;
    const intensity = clamp(state.player.alert / config.maxAlert, 0, 1);
    const t = state.alertPulse.time / state.alertPulse.duration;
    const envelope = Math.pow(1 - t, 2);
    const amplitude = (2 + 6 * intensity) * envelope;
    const scale = 1 + (0.1 + 0.15 * intensity) * envelope;
    const shakeX = Math.sin(state.time * 50 + state.alertPulse.seed) * amplitude;
    const shakeY = Math.cos(state.time * 62 + state.alertPulse.seed * 0.7) * amplitude;
    const lineX = x;
    const lineY = y + alertLineIndex * lineHeight;
    const lineWidth = line.length * charWidth;
    const centerX = lineX + lineWidth / 2;
    const centerY = lineY + lineHeight * 0.5;

    if (pulseActive) {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scale, scale);
      ctx.translate(-centerX, -centerY);
      ctx.translate(shakeX, shakeY);
      ctx.fillStyle = '#d7ffe7';
      ctx.fillText(line, lineX, lineY);
      ctx.restore();
    } else {
      ctx.fillStyle = '#8bffb0';
      ctx.fillText(line, lineX, lineY);
    }
  }
  y += statsFrame.length * lineHeight + 10;
  drawFrameLines(targetFrame, x, y, lineHeight);

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
  state.ui.rects.push(statsRect, targetRect);

  const actions = [
    {
      type: 'scan',
      label: 'Scan (s)',
      underlineIndex: 'Scan (s)'.indexOf('(s)') + 1,
      clickable: true,
    },
    {
      type: 'hack',
      label: 'Hack (h)',
      underlineIndex: 'Hack (h)'.indexOf('(h)') + 1,
      clickable: true,
    },
    {
      type: 'shop',
      label: 'Shop (u)',
      underlineIndex: 'Shop (u)'.indexOf('(u)') + 1,
      clickable: true,
    },
    {
      type: 'select',
      label: 'Select (tab)',
      underlineIndex: 'Select (tab)'.indexOf('tab'),
      clickable: false,
    },
  ];

  const gap = 12;
  const buttonLineHeight = 20;
  const buttonHeight = 3 * buttonLineHeight;
  const buttonData = actions.map((action) => {
    const text = ` ${action.label} `;
    const cols = text.length + 2;
    const frame = buildFrameLines('', [text], cols);
    const width = frame[0].length * charWidth;
    return { action, text, frame, width };
  });
  const totalWidth = buttonData.reduce((sum, button) => sum + button.width, 0) + gap * (buttonData.length - 1);
  const maxWidth = state.view.width - 40;
  const rows = [];
  if (totalWidth > maxWidth && buttonData.length > 2) {
    const split = Math.ceil(buttonData.length / 2);
    rows.push(buttonData.slice(0, split));
    rows.push(buttonData.slice(split));
  } else {
    rows.push(buttonData);
  }
  const rowGap = 10;
  const totalHeight = rows.length * buttonHeight + rowGap * (rows.length - 1);
  let buttonY = state.view.height - totalHeight - 14;

  for (const row of rows) {
    const rowWidth = row.reduce((sum, button) => sum + button.width, 0) + gap * (row.length - 1);
    let buttonX = (state.view.width - rowWidth) / 2;
    for (const button of row) {
      drawFrameLines(button.frame, buttonX, buttonY, buttonLineHeight);
      const underlineIndex = button.action.underlineIndex + 1;
      const underlineX = buttonX + charWidth * (1 + underlineIndex);
      const underlineY = buttonY + buttonLineHeight * 2 - 4;
      ctx.fillStyle = '#8bffb0';
      ctx.fillRect(underlineX, underlineY, charWidth, 2);

      const rect = {
        x: buttonX,
        y: buttonY,
        width: button.width,
        height: buttonHeight,
      };
      state.ui.rects.push(rect);
      if (button.action.clickable) {
        state.ui.keyActions.push({
          type: button.action.type,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
      }
      buttonX += button.width + gap;
    }
    buttonY += buttonHeight + rowGap;
  }
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
  ctx.fillText(shortLabel, pos.x, pos.y + size / 2 + config.labelOffset);

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
  state.ui.rects = [];
  state.ui.keyActions = [];
  drawBackground();
  drawConnections();
  for (const node of state.nodes) {
    drawNode(node);
  }
  if (state.shop.open) {
    drawShop();
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
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab', 's', 'h', 'u', 'enter', 'escape'].includes(key)) {
    event.preventDefault();
  }
  if (state.shop.open) {
    if (key === 'arrowup') {
      state.shop.selectedIndex = (state.shop.selectedIndex - 1 + UPGRADE_OPTIONS.length) % UPGRADE_OPTIONS.length;
    } else if (key === 'arrowdown') {
      state.shop.selectedIndex = (state.shop.selectedIndex + 1) % UPGRADE_OPTIONS.length;
    } else if (key === 'enter') {
      attemptPurchase(state.shop.selectedIndex);
    } else if (key === 'u' || key === 'escape') {
      toggleShop();
    }
    return;
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
  } else if (key === 'u') {
    toggleShop();
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
  if (state.shop.open) {
    state.pointer.mode = 'shop';
  } else {
    state.pointer.mode = inUi ? 'ui' : 'map';
  }
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
  if (state.pointer.mode === 'map' && !state.shop.open) {
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
  if (state.shop.open) {
    if (!state.pointer.dragging) {
      for (const item of state.shop.itemRects) {
        if (isPointInRect(x, y, item)) {
          state.shop.selectedIndex = item.index;
          attemptPurchase(item.index);
          break;
        }
      }
    }
  } else if (!state.pointer.dragging) {
    if (state.pointer.mode === 'ui') {
      for (const action of state.ui.keyActions) {
        if (isPointInRect(x, y, action)) {
          const node = getNodeById(state.selectedId);
          if (action.type === 'scan') {
            startScan(node);
          } else if (action.type === 'hack') {
            startHack(node);
          } else if (action.type === 'shop') {
            toggleShop();
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
