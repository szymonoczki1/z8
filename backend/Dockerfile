# stage 1 - builder, tworzymy node_modules w tym etapie zeby pozniej skopiowac tylko
# node_modules do etapu runtime, dzieki temu oszczedamy miejsce na nie wrzucaniu build tools i npm cache

FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# stage 2 - runtime, tutaj faktycznie wrzucamy wszystkie pliki z katalogu, 
# ale node_modules juz z buildera, dzieki temu obraz jest mniejszy i bez zbędnych narzędzi do budowania
# i na koniec mowimy dockerowi jaka komende odpalic przy starcie kontenera czyli node server.js
FROM node:20-alpine AS runtime

ARG IMAGE_VERSION
LABEL version=$IMAGE_VERSION

ENV NODE_ENV=production PORT=3000

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
USER node

CMD ["node", "server.js"]
