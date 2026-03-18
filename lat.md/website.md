# Website

Standalone Next.js app in `website/`. Deployed to Vercel at `lat.md`.

Completely separate from the npm package — has its own `package.json`, `tsconfig.json`, and `.gitignore`. Never included in `dist`.

## Current State

Black page with centered monospace ASCII art logo (inlined — Vercel can't access `templates/`).

Includes a "What's New" changelog showing only the 5 most recent versions. Text-brightness gradient fades older entries darker. When adding a new version, drop the oldest entry to keep the count at 5.
