# Get Hacken - Game Concepts

## Overview
Get Hacken is a retro 80s hacker-themed HTML5 game played on a full-screen canvas. The player explores a network map, scans unknown nodes, and hacks discovered targets to earn resources and expand deeper into the network.

## Core Game Loop
1) Start at the player home node (green square).
2) Reveal adjacent unknown nodes (gray squares).
3) Scan a node to reveal attributes over multiple passes.
4) Hack scanned nodes to gain resources and uncover new adjacent nodes.
5) Upgrade player stats to improve success odds and unlock harder targets.

## Player Stats
- Money (`$`): earned by stealing funds after a successful hack; spent on upgrades.
- Hacking level (`*`): increases hack success chance (range 1-5).
- Scanning level (`*`): reduces scan time (range 1-5).
- Stealth level (`*`): reduces the chance that a failed hack increases alert (range 1-5).

## Map, Nodes, and Discovery
- The map is an expanding grid of nodes connected by adjacency rules (orthogonal neighbors by default).
- New nodes use a distance-based difficulty curve so the starter area stays easy; harder types appear farther from home.
- Node states:
  - Home: green square.
  - Unknown: gray square; only position and adjacency are visible.
  - Scanned: white square; reveals attributes progressively with repeated scans.
  - Hacked: indicates success and can reveal 1-3 new adjacent unknown nodes.
- Scanning reveals attributes progressively: scan 1 shows node type, scan 2 shows security level, scan 3 shows resource level.
- After all attributes are known, additional scans can find vulnerabilities; each vulnerability reduces the target security by 1 (minimum 1).
- Nodes show their type label once known; unknown nodes remain labeled as unknown on the map.

## Node Types and Security Bands
- Housing (security 1): house, apartment.
- Shops (security 1-2): donut shop, coffee shop, restaurant, candy store, bookstore, arcade.
- Big shops (security 2-3): grocery, furniture, hardware, pharmacy, clothing.
- Services (security 2-4): train stations, hospitals, water treatment, schools, office buildings, town hall.
- Companies (security 3-4): pharma, tech, finance, insurance, media.
- Sensitive (security 4-5): military, police, banks, power stations, research labs.

## Actions and Timing
- Scan: 10s base duration, linearly reduced by scanning level; repeated scans reveal more detail; shows an ASCII progress bar on the node (for example, `[====      ]`).
- Hack: 10s base duration, also shows an ASCII progress bar.
- Success probability scales with player hacking level versus target security level.
- Hack failure increases an alert meter; at 5 stars the player is busted (game over).
- The alert meter decays by about one star per minute and hacks can be retried immediately.

## Visuals and UI
- CRT-inspired green-on-dark palette with subtle scanlines and glow.
- ASCII boxes, lines, and labels for a TUI-like interface.
- Input supports mouse/tap selection and keyboard shortcuts (arrow keys or tab to select, `S` to scan, `H` to hack).
- Touch controls: tap nodes to select, tap the bottom TUI action labels to scan/hack, drag to pan the map.
- Upgrade shop (`U`) overlays the map with a TUI list; use up/down to select and Enter/tap to buy.
- A small console in the top right logs recent actions in a hacker-terminal style.

## Progression and Rewards
- Hacking yields money and unlocks more nodes.
- Money purchases hacking, scanning, and stealth upgrades (`*`).
- Upgrade costs scale linearly: level 1->2 is $100, 2->3 is $200, 3->4 is $300, 4->5 is $400.
- Endless progression; difficulty ramps by increasing security levels and lowering discovery rates.
