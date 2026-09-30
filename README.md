# Zoologist

OSRS creature exploration frontend prototype.

## Current prototype

This version is a UI-first prototype aligned to the current Zoologist specification:

- square top-down tile map
- explored / revealed frontier / fog-of-war states
- revealed tiles visibly show their creature
- revealed incomplete tiles are visually distinct from completed tiles
- tile detail panel is independently collapsible
- no persistent "current tile" concept in the UI
- top-level Map / Skills / Quests / Diaries navigation
- creature progress header using the current launch-pool size of 440
- mock completion reward slot ready for future reward metadata
- responsive layout for desktop and mobile
- GitHub Pages deployment workflow included
- Supabase package already included for the later persistence/auth stage

## Data note

The visual prototype uses a curated sample of the supplied Master Candidate List to demonstrate the interface. The authoritative 440-row CSV should be imported as the next data stage; the UI is not dependent on a hard-coded 440 tile board.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Production files are generated in `dist/`.

## GitHub Pages

Push the repository to GitHub and enable GitHub Pages using the **GitHub Actions** source. The included workflow builds the Vite project and deploys `dist/`.

## Next implementation stages

1. Import the full Master Candidate List from CSV into a versioned master dataset.
2. Add local creature image assets and an asset audit.
3. Define reward metadata and creature requirement data.
4. Implement deterministic seed-based procedural generation.
5. Implement persistent fog/frontier/map state.
6. Add Supabase authentication and player-state storage.
7. Connect Skills / Quests / Diaries to account state.
8. Add proper creature completion validation.
