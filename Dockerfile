# XYON Command Centre / Reddit Radar — container image.
# Works on Railway, Render, Fly.io, or any VPS with Docker.
FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# Persist the SQLite DB outside the image by mounting a volume at /var/data
# and leaving DB_PATH pointed here (override at deploy time if needed).
ENV DB_PATH=/var/data/xyon.db

EXPOSE 3000

CMD ["node", "server.js"]
