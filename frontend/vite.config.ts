import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';

// Lade Konfiguration
const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

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
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || `http://localhost:${config.ports.backend}`
    ),
  },
});
