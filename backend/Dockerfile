FROM node:18-alpine AS builder

WORKDIR /app

# Installiere ALLE Dependencies (inkl. TypeScript)
COPY package*.json ./
RUN npm install

# Kopiere Source Code
COPY . .

# Build TypeScript
RUN npm run build

# Production Stage
FROM node:18-alpine

WORKDIR /app

# Kopiere package.json für production install
COPY package*.json ./
RUN npm install --omit=dev

# Kopiere gebauten Code aus Builder
COPY --from=builder /app/dist ./dist

# Die SQL-Dateien der Migrationen werden von tsc nicht mitkopiert - ohne sie
# findet der kompilierte Migrations-Runner im Container nichts vor.
COPY --from=builder /app/src/database/migrations ./dist/database/migrations

EXPOSE 3001

CMD ["npm", "start"]
