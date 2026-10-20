# Domainarchy v3.0 local build

This is an integrated, maintainable continuation of the supplied **Domainarchy v2.6** visual prototype. It includes a standalone browser mode and an optional, authoritative shared-world server. The visual identity, map engine and three main application modes are retained.

**Boundary:** server selection, hosting configuration, public deployment, payments and production operations are deliberately NOT undertaken in this package.

## Live demo

**https://near2medigital.github.io/domainarchy/**

The live site is the `client/` folder published by GitHub Pages (see `.github/workflows/pages.yml`) on every push to `main`. It runs in standalone mode: the full interface and map engine, with state saved to each visitor's own browser storage. The shared-world server is not part of the hosted site. Add `?public` to the URL to show fictional placeholder brands in place of the real SEO directory entries.

## Files

| Path | Purpose |
| --- | --- |
| `.github/workflows/pages.yml` | Tests, then deploys `client/` to GitHub Pages |
| `client/index.html` | The existing interface with adjusted navigation, status, backup and system guidance |
| `client/style.css` | Extracted/updated v2.6 styling |
| `client/client.js` | Canvas renderer, interactions, local state and multiplayer transport |
| `server/index.mjs` | Dependency-free Node HTTP server, authoritative actions, server-sent events and durable state |
| `data/` | Automatically generated server storage, ignored by Git |
| `tests/server.test.mjs` | Server interaction regression suite |
| `archive/Domainarchy-v2.6-original.html` | Unaltered source backup |
| `docs/ARCHITECTURE.md` | State boundaries and networking protocol |
| `docs/DEFERRED.md` | Work deferred to the server/deployment discussion |

## Standalone mode (no server)

Open `client/index.html` in a modern browser. State is saved to localStorage by arena, independent of the companion server. The System menu restores JSON backups; the Back Up navigation item exports local data. Browser storage is local to the origin/profile and does not synchronise between devices.

## Shared-world mode (local machine only)

Requires Node.js 22 or newer. No npm install or other runtime packages required.

```powershell
cd 'E:\ExxoCortexian Vault\70-DOMAINS\Domainarchy'
node server/index.mjs
```

Open `http://127.0.0.1:8787` in two separate browser profiles to use distinct visitor sessions. Both users see the same three world states; mutations propagate through server-sent events. The server binds to loopback by default and is **not configured for public deployment**.

```powershell
npm run check
npm test
```

To stop, press `Ctrl+C` in the server terminal. At that point the data remains in `data/state.json` (and its `.session-secret` identity file). Preserve both if migrating to different server infrastructure.

## Improvements over v2.6

- Preserve a complete independent world when changing arena scale, rather than regenerating user placements.
- Persistence of locally claimed territory, spectator interactions, billboard campaigns and airship bookings across reloads.
- Shared-world live updates over HTTP + server-sent events, including atomic conflict resolution for competing claims.
- Signed visitor sessions, separate owners, server-controlled shields and expiring terms.
- Server-controlled siege initiation and resolution, one-per-day spectator cheers and finite voucher claims.
- Billboard exclusivity and scheduled airship flight delivery.
- Correct faction index zero, studio voucher connection, safe handling of brand identity per placement, and expired content removal.
- Fixed desktop navigation breakpoint, improved large-world close-up and lower-detail hex interaction geometry.
- Directory filtering and explicit connection status.
- Offline export and restore controls, modular file structure and original source archive.

## Important limitations

This is a **locally runnable multiplayer prototype**, not a public production service. It has temporary guest identity rather than accounts; JSON storage is designed for **a single Node server process**. No payment or billing integrations are wired. Initial territory examples are demonstration data. See `docs/DEFERRED.md`.
