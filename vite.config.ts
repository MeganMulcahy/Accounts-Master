import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/renderer'), // root = renderer folder
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
    // Prefer .ts/.tsx over .js so renderer uses TypeScript sources from src/shared
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html'), // absolute path
    },
  },
  server: {
    port: 5173,
  },
  base: './',
});
