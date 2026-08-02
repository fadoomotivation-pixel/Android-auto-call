# Baileys worker. Any host that runs a container for months will do —
# Railway, Render, Fly, a small VPS.
FROM node:20-slim

WORKDIR /app

# Baileys pulls native-ish deps; installing before the source copy keeps the
# layer cached across code changes.
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

# MOUNT A PERSISTENT VOLUME HERE. Without one the WhatsApp session is wiped on
# every deploy and the founder is asked to rescan a QR each time — which is how
# this quietly stops being used.
ENV AUTH_DIR=/data/auth
VOLUME ["/data"]

ENV PORT=8080
EXPOSE 8080

# No healthcheck curl on slim; the platform polls /health over HTTP instead.
CMD ["node", "src/server.js"]
