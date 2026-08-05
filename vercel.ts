import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'npm run test:run && npm run build',
  // Frankfurt: użytkownicy PL/EU + przyszły Postgres w eu-central-1.
  // Hobby dopuszcza dokładnie jeden region; nadpisuje default iad1.
  regions: ['fra1'],
};
