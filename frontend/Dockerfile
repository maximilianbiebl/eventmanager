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

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
