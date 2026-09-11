# RobinFly continuous paper worker

This package runs the full connectome and a public, read-only telemetry origin. It does not run a live-money trader. The website stays on Vercel. No signing key belongs on this host.

## Host choice and budget

The owner chose to run on the existing laptop on September 10, 2026. **Do not purchase a server under the earlier $25 discussion.** This package is retained for a future explicitly requested migration.

A future host should have 8 GB RAM preferred (4 GB minimum after a memory test), 2+ vCPUs and 20+ GB disk. Benchmark the full model on the selected machine and confirm a new concrete budget before provisioning.

## Deployment contents

- `Dockerfile`: Node 22, Python, the pinned three-library runtime and worker source.
- `compose.yaml`: paper-only command, no signing key, loopback telemetry port, persistent model and run folders, bounded logs.
- `Caddyfile`: HTTPS for an owned feed subdomain; only read-only telemetry paths are proxied.
- `robinfly-paper.service`: boot startup. A clean stop or application error stays stopped for inspection; there is no blind provider-denial retry loop.

## Concrete setup after a host is available

1. Install Docker Engine/Compose and Caddy on the owned host; place this checkout at `/opt/robinfly`. Restrict SSH to the owner's key/IP. Allow HTTPS for the feed origin.
2. Create `deploy/data/worker-runs` and `deploy/data/brain-runs`, writable by UID 1000. Copy the existing `brain/graph.npz` to `deploy/data/graph.npz` and verify its SHA-256 against the source. The model is intentionally excluded from Git and the image build.
3. Stop the old worker before copying its `worker/runs` state and `brain/runs` frames. Preserve `markets.json`, `paper-state.json`, and `rpc-budget.json`; do not transplant an active `worker.lock`. Never reset the paper ledger just to improve its displayed record.
4. Create `deploy/worker.env` from the example using the owner's authenticated RPC. Keep it mode 600, out of Git and image layers. Transfer only the RPC setting, never the Mac's whole `.env` or `FLY_PRIVATE_KEY`. Approval to put the endpoint in Vercel does not by itself authorize putting it on a newly chosen host.
5. Build the image. Run the offline worker tests and a bounded paper pilot on that host. Verify `/health`, `/latest.json`, referenced frame hashes, neural bins, block catch-up and state continuity. Docker is not installed on the development Mac, so this container has not been built or benchmarked there.
6. Point an owned feed subdomain to the host and configure Caddy's `FEED_DOMAIN`. Verify HTTPS. Configure Vercel's server-only `ROBINFLY_FEED_ORIGIN` with that HTTPS origin, then redeploy. The browser never chooses the proxy destination.
7. Enable the service only after those checks. Its command is paper-only. `/health` returns 503 on stale ingestion or degraded/stopped state. Monitor the actual Alchemy dashboard as well as the local estimate.

## RPC plan and latency

The current free Alchemy app accepts a maximum of 10 blocks per log query. The adapter groups ten permitted requests, paces estimated usage at 400 CU/s, and stops at an estimated 24M CU per calendar month. This is a local estimate, not the provider's bill or a guarantee covering other processes/apps. Provider 401/403/429 errors stop operation. The public RPC that denied access is not a fallback.

Continuous polling can exhaust a free monthly allowance in days. Do not call the free plan a permanent 24/7 solution. A paid provider plan needs the owner's billing setup and cap; its cost is separate from the server authorization. A verified plan permitting wider log ranges can use `ROBINFLY_LOG_RANGE` up to 500. Streaming ingestion is a future optimization, not implemented here.

A chart expires 45 seconds after its quote timestamp; stale observations cannot produce orders. Each 500 ms neural observation currently costs roughly 12–14 seconds on the Mac, and a slower host may reject more observations. The worker uses software selection of candidates, not learned neural attention.

## Current public delivery

The development preview reads loopback telemetry directly. Production is configured to read the laptop through a temporary Cloudflare Quick Tunnel, with the browser checking the Vercel feed proxy every three seconds. This is periodic delivery of recorded observations, not a per-spike live stream. GitHub remains the archive.

The owner must keep the laptop open, powered and online. The worker is detached from the terminal and has an idle-sleep inhibitor; shutdown, closing the lid or connection loss can interrupt it. The temporary tunnel has no uptime guarantee, and restarting it can change its address. After a reboot, reconnect the relay and update the Vercel origin before expecting the public feed to resume. Start/stop paper controls preserve the paper ledger and do not enable real-money trading.
