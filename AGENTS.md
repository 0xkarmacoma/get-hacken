# Repository Guidelines

## Project Structure & Module Organization
- Entry point: `index.html` loads the full-screen canvas and `src/main.js`.
- Runtime code lives in `src/` (current files: `src/main.js`, `src/style.css`).
- Add tests under `tests/` and design notes under `docs/` as the project expands.
- Group modules by feature (for example, `src/world/`, `src/ui/`, `src/systems/`) rather than by file type.

## Build, Test, and Development Commands
- The game runs as static files, and a small build script can stage a deployable `dist/` folder.
- Run the game locally from the repo root:
  - `python -m http.server 8000` — serves the project at `http://localhost:8000`.
  - Alternative: `npx serve .` — simple static server if Node is installed.
- Build a deployable folder:
  - `./scripts/build.sh` — copies `index.html` and `src/` into `dist/` (use this for Pages/Netlify/Vercel).
- Tests: no automated tests are set up yet.

## Coding Style & Naming Conventions
- No language or formatter is chosen yet. Add tooling (formatter, linter) with explicit config files and reference them here.
- Use clear, consistent naming: `PascalCase` for types/classes and `camelCase` for functions/variables.

## Testing Guidelines
- No test framework is configured. Document test layout and naming once selected (for example, `tests/map_generation.test.ts`).
- Record any coverage thresholds or required test categories when established.

## Commit & Pull Request Guidelines
- The repo has no commit history yet, so no convention exists. If you adopt one, record it here (for example, `feat: add scan action`).
- PRs should include a concise description, rationale, and issue links; add screenshots or recordings for UI changes.

## Technical Decisions
- Rendering: full-screen HTML5 `canvas` with `requestAnimationFrame`, time-based updates, and DPI-aware scaling.
- UI style: retro 80s hacker aesthetic, green-on-dark CRT look, ASCII/TUI lines, and keyboard-first controls.
- Gameplay UI: on-map ASCII progress bars for long actions (scan/hack), with action durations measured in seconds rather than frames.
- Assets: avoid heavy image pipelines early; use procedural lines/boxes and bitmap-style text rendering.

## Security & Configuration Tips
- Do not commit secrets. Use environment variables for keys and document them in `README.md` (for example, `API_BASE_URL`).
