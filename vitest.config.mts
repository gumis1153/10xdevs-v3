import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Runner testów jednostkowych/komponentowych (test-plan.md §4).
 *
 * Rozszerzenie `.mts` jest wymuszone przez `tsconfig.json`: `include` łapie
 * `**\/*.mts`, ale nie `**\/*.mjs` — dzięki temu ten plik jest typowany tym
 * samym programem TS, którym buduje Next.
 *
 * `globals: true` jest sprzężone z `"vitest/globals"` w `tsconfig.json`
 * `compilerOptions.types` — jedno bez drugiego daje typy bez runtime'u albo
 * runtime bez typów.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
