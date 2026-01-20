# Get Hacken

Retro 80s hacker-themed HTML5 canvas game. Full-screen TUI/CRT aesthetic, keyboard + touch support.

## Run Locally
- `python -m http.server 8000` — open `http://localhost:8000`
- `npx serve .` — simple static server (requires Node)

## Build for Deployment
- `./scripts/build.sh` — creates `dist/` with only `index.html` and `src/`

Deploy the `dist/` folder to avoid publishing design docs like `GAME.md` and `AGENTS.md`.

## GitHub Pages (Recommended)
1. Push the repo to GitHub.
2. In GitHub: Settings → Pages.
3. Source: “GitHub Actions”.
4. On push to `main`, the workflow builds and deploys `dist/` automatically.

Note: deployment is handled by `.github/workflows/pages.yml`, which runs `./scripts/build.sh` and publishes the `dist/` artifact to Pages.

## Other Hosts
- Netlify: build command empty, publish directory `dist/`.
- Vercel: framework “Other”, build command empty, output directory `dist/`.
- Cloudflare Pages: build command empty, output directory `dist/`.
