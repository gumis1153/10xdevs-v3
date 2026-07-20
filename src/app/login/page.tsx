import { signInWithGoogle } from '@/app/auth/actions'

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    'Logowanie zostało anulowane. Spróbuj ponownie, kiedy będziesz gotowy.',
  oauth:
    'Nie udało się rozpocząć logowania przez Google. Spróbuj ponownie za chwilę.',
  auth_callback:
    'Nie udało się dokończyć logowania. Spróbuj ponownie za chwilę.',
}

const FALLBACK_ERROR = 'Coś poszło nie tak podczas logowania. Spróbuj ponownie.'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { error } = await searchParams
  const errorMessage =
    typeof error === 'string' ? (ERROR_MESSAGES[error] ?? FALLBACK_ERROR) : null

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 font-sans">
      <main className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            english-talk
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Bezpieczne środowisko do ćwiczenia mówienia po angielsku.
          </p>
        </div>

        {errorMessage && (
          <p
            role="alert"
            className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {errorMessage}
          </p>
        )}

        <form action={signInWithGoogle} className="w-full">
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-solid border-black/[.08] px-5 text-base font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 48 48"
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Zaloguj się przez Google
          </button>
        </form>
      </main>
    </div>
  )
}
