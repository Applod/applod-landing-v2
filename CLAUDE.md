# Claude Code instructions — Applod Landing v2

This is the production Applod Live landing page. Read `AGENTS.md` completely before changing code. Also read the local `HANDOFF.md` when it exists; it contains the latest deployment and account state but is intentionally not committed.

## Project facts

- Canonical GitHub repository: `Applod/applod-landing-v2`
- Production URL: `https://applod-landing-v2.vercel.app`
- Production branch: `main`
- Architecture: static HTML/CSS/JavaScript with three.js loaded from unpkg; no install or build step
- Local preview: `python3 scripts/dev-server.py 4832`, then open `http://127.0.0.1:4832/`

## Before editing or pushing

1. Run `git status --short` and preserve unrelated changes.
2. Confirm `origin` is `https://github.com/Applod/applod-landing-v2.git`.
3. Before pushing, run `gh auth switch -h github.com -u Applod` and `gh auth setup-git`; both Applod and personal GitHub accounts exist on this Mac.
4. Never push to or delete the `personal-backup` remote without Joe's explicit approval.
5. Never commit `.vercel/`, credentials, transient files, or `HANDOFF.md`.

## Design constraints

Preserve the approved chronological stage process, dark “house lights down” color transition, Artboard 7 hero lockup, Artboard 9 masthead logo, real-logo particle splatter, particle-anchored Selected Work bubbles, fine-pointer hover warp, optional phone-tilt depth, mobile flat layout, and reduced-motion fallbacks. Critical content and navigation must never depend on WebGL, sensor permission, or animation completion.

Meaningful changes should be verified locally and on a Vercel preview before they reach production. Pushes to `main` deploy automatically; do not attach `applod.live` without Joe's approval.
