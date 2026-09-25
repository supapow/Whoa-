# Whoa! — Agent Guide

This file is shared by every AI coding tool that works on this repo.

**Read `Project Context`, `Repo Map`, `Toolchain` and `Repo Conventions` first** — those apply to every agent regardless of which tool or model is running. Tool-specific run/verify instructions live in per-tool sections at the bottom.

**Each tool owns its own section.** Add or edit *your own* `### <Tool>` section; do not edit another tool's section.

## Project Context

**Whoa!** — a mobile-first banner builder, graphic designer, and animation editor.

- **The app is called Whoa!** Not "OpenCut", not "Bannr", not "Woah!". `README.md` and `memory/PRD.md` still carry older names (see *Known Stale Docs*).
- **This repo is a fork of OpenCut**, kept as a starting point for two reasons:
  1. to be able to reuse OpenCut's **video tooling later**, and
  2. to make adding/adjusting the **desktop app** (`apps/desktop`) easier down the road.
  The fork is optionality, not an upstream we track. Nothing needs to stay in sync with OpenCut.
- **Only `apps/web` is actively developed.** `apps/api` and `apps/desktop` are out of scope for now.
- **Mobile-first.** Land all functionality on mobile first. Only after that does the UI become responsive / gain desktop-specific web components. When reviewing UI, think mobile viewport before desktop.
- **Video features come later** — after the web app's core functionality is in place. Build *for* them, don't build them yet.
- **Frontend-first with mock data.** No backend is wired into the web app yet; data is in-memory mock data.

## Repo Map

- `apps/web` — **the active project.** Vite + React 19 + Tailwind CSS v4 SPA. Path alias `#` → `apps/web/src` (see `vite.config.ts`, `tsconfig.json`). Routing via TanStack Router (`src/router.tsx`, `src/routes/`, generated `routeTree.gen.ts`).
- `apps/api` — Cloudflare Worker (Elysia). Not referenced by the web app.
- `apps/desktop` — Rust/GPUI desktop app. Not needed for web work.
- `moon.yml`, `apps/*/moon.yml` — moon task runner config (`moon run web:dev`, …).
- `.prototools` — pins the workspace toolchain via proto: `moon 2.3.3`, `bun 1.3.11`, `rust 1.97.0`.
- `memory/PRD.md` — original product requirements. Useful for intent, but partly out of date.
- `design_guidelines.json`, `brand/`, `changelog/` — design/reference material.

## Toolchain

- **Package manager: Bun.** `bun.lock` is the committed lockfile and `.prototools` pins bun. Use `bun install` / `bun run …`, and commit changes to `bun.lock` when `package.json` changes.
- **Never commit `package-lock.json`.** It is an npm artifact; some legacy paths still generate it.
- ⚠️ **Known npm remnants (don't add more):** the root `package.json` scripts shell out to `npm run …`, and `docker-compose.base44.yml` runs `npm install`. The Base44 section below intentionally keeps npm — that is Base44's setup, not the repo default.
- **No environment variables or secrets are required** for the web app — it runs fully standalone.

### Common commands (run from repo root unless noted)

```sh
bun install                                   # install/refresh deps from bun.lock
cd apps/web && bun run dev                    # dev server → http://localhost:3000
cd apps/web && bun run test                   # bun test suite (apps/web/tests/)
bun run lint                                  # tsc --noEmit (verified passing)
```

> The dev server binds `strictPort: 3000`. If the port is already in use, a previous server is still running — kill it first.

## Repo Conventions

- **Branches:** `type/description` — e.g. `feature/outer-and-inner-shadows`, `v0/fix-colorpicker`.
- **Commits:** Conventional Commits — `feat: …`, `fix: …`, `feat(editor): …`.
- **Keep the app name as Whoa!** in new files, UI copy, and docs.
- Prefer fixing a stale doc over copying from it (see below).

## Known Stale Docs (don't trust these blindly)

- `README.md` — still upstream OpenCut's README. Says `moon run web:dev` → localhost:**5173**; the app actually runs on **3000**.
- `memory/PRD.md` — uses the old name "Bannr" and claims the app has **no routing**; it now uses TanStack Router.
- `metadata.json` — spells the name **"Woah!"** (should be "Whoa!").

---

# Tool Sections

## OpenCode

OpenCode sessions here run different models over time — mostly **MiMo**, sometimes **Muse Spark**. These instructions are model-agnostic: nothing below needs changing when the model changes.

### Run

```sh
cd apps/web && bun run dev     # Vite, live reload, http://localhost:3000
```

Notes:
- `bun` is installed via the bun.sh installer at `~/.bun/bin/bun`. It is on `PATH` in interactive shells; in non-interactive shells call `~/.bun/bin/bun` directly.
- If you stopped a background dev server, confirm port 3000 is actually free before restarting.

### Verify

```sh
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/   # expect 200
curl -s http://localhost:3000/src/main.tsx | head -5            # expect transformed JS
bun run lint                                 # expect exit 0
```

### Working agreements

- Branch off `main` before starting a feature; keep lockfile/doc housekeeping commits separate from feature commits.
- Don't reintroduce npm-only workflows; `bun.lock` is the source of truth.
- Check UI at a mobile viewport first.

<!-- Base44-owned section below. Verbatim — other tools: add your own section instead of editing this one. -->

# Base44 Dev Environment

## Project Overview
OpenCut / "Bannr" — a mobile-first banner builder and animation editor. Monorepo with:
- `apps/web` — Vite + React 19 + Tailwind CSS v4 frontend (the main preview target)
- `apps/api` — Cloudflare Worker (Elysia) — not referenced by the web app, not needed for preview
- `apps/desktop` — Rust/GPUI desktop app — not needed for preview

## Running the App
```sh
docker compose -f docker-compose.base44.yml up -d
```
- Web app serves on **port 3000** via Vite dev server (live reload enabled)
- `node:22-slim` base image, source bind-mounted at `/app`
- `npm install` runs at container startup (no lockfile; deps resolve fresh)
- Named volumes keep `node_modules` persistent across restarts

## Key Details
- No environment variables or secrets required — the web app is fully standalone
- Vite config already has `host: 0.0.0.0`, `allowedHosts: true`, and HMR on port 443/wss
- The `#` path alias maps to `apps/web/src` (see `vite.config.ts` and `tsconfig.json`)
- Health check: `GET /` returns 200

## Verification
```sh
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/   # expect 200
curl -s http://localhost:3000/src/main.tsx | head -5            # expect transformed JS
```

<!-- Invitation for other tools -->

## Other tools (Google AI Studio, v0, …)

You're welcome here. Add your own `### <Tool name>` section below with whatever run steps, constraints, or preferences you need, then stop. Don't edit other tools' sections — the shared context at the top of this file is the common ground.
