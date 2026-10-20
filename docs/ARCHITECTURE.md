# Domainarchy application architecture

## Local / shared modes

**Standalone:** `client/index.html` loads CSS and JS and operates entirely within the browser. Every arena has an independent `localStorage` record (`da_worlds_v30`); only public UI assets require optional external font requests. A JSON backup/export controls is available.

**Shared:** if same-origin `GET /api/state?arena=<id>` responds successfully, the client treats the server as authoritative. The server supplies the entire sparse occupancy/advertising state and viewer data, and subsequent server-sent events at `/api/events?arena=<id>` apply snapshots to the canvas, radar, directory and profiles. Local random warfare is disabled. The browser may not commit shared actions when disconnected.

Both modes preserve v2.6’s canvas rendering and core interaction model. Some interface copy remains from the demonstration prototype and does not indicate a live transaction or externally verified event.

## State ownership

- `brands`: immutable placement brand records, identified by a server UUID; the visitor is associated with owned placements.
- `worlds[id].hexes`: sparse map keyed by axial coordinate `q,r` for the 61, 469, 4,921 arenas. Unoccupied positions are omitted.
- `worlds[id].boards`: exclusive advertising slots keyed by perimeter slot index.
- `worlds[id].airship`: scheduled campaign balance, with delivery countdown processed on the server.
- `worlds[id].flight`: current shared airship creative and flight epoch.
- `worlds[id].events`: recent territory changes for the War Wire.
- `visitors[id]`: signed cookie identity, daily cheer attendance, voucher ownership.

The server saves atomically by writing a temporary JSON file then renaming it over `state.json`. Claims and other mutations execute serially in a single Node process. A periodic sweeper expires bookings, resolves sieges and advances flights. Running several independent server processes against the same JSON file is **not supported**.

## API

- `GET /health`: ready indicator.
- `GET /api/state?arena=61|469|4921`: full viewer-specific state.
- `GET /api/events?arena=...`: SSE event stream, named `state`. Reconnects automatically.
- `POST /api/action?arena=...`: JSON mutations; action names `claim`, `siege`, `cheer`, `voucher`, `billboard`, `airship`.

Mutations are rejected for invalid coordinates, invalid products, shielded targets, already-occupied hexes, sold billboards and duplicate spectator cheers. `409` carries an explanatory JSON error. Voucher codes are not exposed in ordinary world snapshots and require an atomic redemption action.

## Access and limits

Signed `HttpOnly; SameSite=Lax` cookies establish distinct guest sessions. Cross-origin state-changing requests are refused. Shared pages should be served over HTTPS if exposed outside loopback, with a more mature identity, abuse and permission model considered before public deployment.

**Rendering:** Canvas 2D is kept intentionally; basic near/region/overview camera presets now use a minimum close-up zoom across board scales. Browser clip/rendering remains separate from authoritative world data.
