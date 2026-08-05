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

/**
 * Vitest ustawia `NODE_ENV=test` tylko wtedy, gdy zmienna jest nieustawiona —
 * a build Vercela ustawia `production`. Wtedy Vite rozwiązuje produkcyjny
 * export Reacta, który nie eksponuje `React.act`, na którym stoi
 * `@testing-library/react`: suite pada na `React.act is not a function`
 * z powodu, który nie ma nic wspólnego z testowanym kodem.
 *
 * Sprawdzony i **nieskuteczny** wariant: `resolve: { conditions: ['development'] }`
 * — nadal daje `React.act is not a function`. Nie próbuj go drugi raz.
 *
 * `Object.assign`, a nie zwykłe przypisanie, bo `next/types/global.d.ts`
 * deklaruje `readonly NODE_ENV` i `next build` odrzuciłby typecheck.
 */
Object.assign(process.env, { NODE_ENV: 'test' })

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
