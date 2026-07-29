/**
 * Matchery jest-dom (`toBeInTheDocument`, `toHaveTextContent`, …) dla Vitest.
 *
 * Entrypoint `/vitest` jest istotny: zwykły `@testing-library/jest-dom`
 * rejestruje matchery w `expect` Jesta. Ta ścieżka NIE idzie przez
 * `compilerOptions.types` w `tsconfig.json` — typy matcherów wchodzą właśnie
 * przez ten import, który obecny `include` (`**\/*.ts`) już łapie do programu TS.
 */
import '@testing-library/jest-dom/vitest'
