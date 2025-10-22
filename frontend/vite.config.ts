import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';

// Lade Konfiguration mit Fallback für Docker Build
let config = {
  ports: {
    frontend: 3000,
    backend: 3001,
    database: 5432,
  },
};

try {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (error) {
  console.warn('config.json nicht gefunden, verwende Default-Werte');
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: config.ports.frontend,
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${config.ports.backend}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: config.ports.frontend,
    host: true,
  },
  // Für Production: Nutze /api Proxy statt direktem Backend-Zugriff
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || '/api'
    ),
  },
});
