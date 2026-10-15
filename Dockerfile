# Playwright + Chromium hazır imaj
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
