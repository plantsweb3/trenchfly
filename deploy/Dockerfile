FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/robinfly
COPY worker/package.json worker/package-lock.json ./worker/
RUN cd worker && npm ci
COPY brain/requirements-runtime.txt ./brain/
RUN python3 -m venv brain/.venv && brain/.venv/bin/pip install --no-cache-dir -r brain/requirements-runtime.txt
COPY worker/*.ts ./worker/
COPY worker/watchlist.json ./worker/
COPY lib/chain.ts lib/rpc-config.ts ./lib/
COPY brain/serve.py brain/kernel.py brain/display.py brain/sensory.py brain/populations.json brain/calibration.json ./brain/
RUN mkdir -p worker/runs brain/runs && chown -R node:node /opt/robinfly
USER node
WORKDIR /opt/robinfly/worker
ENV ROBINFLY_TELEMETRY_BIND=0.0.0.0
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","index.ts","--no-publish"]
