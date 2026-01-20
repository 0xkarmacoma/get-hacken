# Get Hacken

Retro 80s hacker-themed HTML5 canvas game. Full-screen TUI/CRT aesthetic, keyboard + touch support.

## Run Locally
- `python -m http.server 8000` — open `http://localhost:8000`
- `npx serve .` — simple static server (requires Node)

## Build for Deployment
- `./scripts/build.sh` — creates `dist/` with only `index.html` and `src/`

Deploy the `dist/` folder to avoid publishing design docs like `GAME.md` and `AGENTS.md`.

## GitHub Pages (Recommended)
1. Run `./scripts/build.sh`.
2. Push the repo to GitHub.
3. In GitHub: Settings → Pages.
4. Source: “Deploy from a branch”.
5. Branch: `main`, folder: `/dist`.

## Other Hosts
- Netlify: build command empty, publish directory `dist/`.
- Vercel: framework “Other”, build command empty, output directory `dist/`.
- Cloudflare Pages: build command empty, output directory `dist/`.
