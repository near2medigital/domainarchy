# Deferred boundary: server options and deployment

The instructions for this build end at **completed local implementation**, including shared-state server code. The following are not performed until the next discussion:

1. Choosing hosting, server hardware/location or ongoing deployment platform.
2. Exposing the Node server to the public internet, DNS, TLS and reverse-proxy setup.
3. Migrating durable JSON storage to a production database and evaluating horizontal scaling.
4. Account authentication, anti-abuse controls, moderation, detailed monitoring and secure production configuration.
5. Payments, billing, eligibility claims or related commercial decisions.

## Local mode constraints

The canvas and UI use v2.6’s assets and contain generated demonstration tenants. Preview interactions in a browser do not imply payment. Browser `localStorage` persists per browser/origin only. Independent browsers cannot share a live arena without the server.

## Shared mode constraints

The server is deliberately single-process and loopback-bound. Guest identity is browser-cookie based; clearing cookies results in a new identity. Its authoritative rules include a fixed 90-second siege resolution timer, 7-day shields and 14- or 28-day bookings, mirroring the prototype fields. Those values can be made configurable before deployment. The recorded snapshots are durable, but persistent state depends on retaining `data/state.json` and `.session-secret`.

Browser-rendering checks can be expanded on the eventual target server/browser combination. This development package is not presented as a verified production deployment.
