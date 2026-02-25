import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const rootDir = path.dirname(fileURLToPath(import.meta.url))
  const srcDir = path.resolve(rootDir, './src')
  const base = command === 'build' ? process.env.VITE_BASE ?? '/' : '/'

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        ...(command === 'build'
          ? [
              {
                find: /^@\/data\/loadSakuraSpotsFromYamlAssets$/,
                replacement: path.resolve(
                  srcDir,
                  './data/loadSakuraSpotsFromYamlAssets.prod.ts',
                ),
              },
            ]
          : []),
        {
          find: '@',
          replacement: srcDir,
        },
      ],
    },
  }
})
