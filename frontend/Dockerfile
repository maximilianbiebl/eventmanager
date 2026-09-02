FROM node:18-alpine AS builder

WORKDIR /app

# Installiere Dependencies
COPY package*.json ./
RUN npm install

# Kopiere Source Code und baue
COPY . .
RUN npm run build

# Production Stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Vite kopiert alles aus public/ (sw.js, manifest.json, icon*) unveraendert
# nach dist/ - inklusive der Dateirechte aus dem Arbeitsverzeichnis. Docker
# COPY behaelt sie ebenfalls bei. Steht eine dieser Dateien auf dem Host auf
# 600 (z. B. nach einer Uebertragung per SMB/File Station), kann der
# nginx-Worker sie nicht lesen und antwortet mit 403 - waehrend index.html
# und die gebauten Assets funktionieren, weil die im Container entstehen.
# Hier werden die Rechte deshalb einmal geradegezogen.
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
