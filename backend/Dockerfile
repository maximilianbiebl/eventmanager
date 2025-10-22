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

EXPOSE 3001

CMD ["npm", "start"]
