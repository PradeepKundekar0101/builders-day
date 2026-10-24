FROM node:26-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends zip ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.4.2
WORKDIR /app
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile
RUN mkdir -p /work && chown node:node /work
USER node
ENV PROVN_BUILD_WORKDIR=/work
CMD ["pnpm", "--filter", "@buildwise/worker", "start"]
