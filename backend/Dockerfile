FROM node:18-alpine

WORKDIR /app

# Installiere Dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Kopiere Source Code
COPY . .

# Build TypeScript
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
