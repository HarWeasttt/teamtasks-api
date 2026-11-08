import { config } from 'dotenv';
import { resolve } from 'node:path';

// .env.test values are defaults; real env vars (e.g. in CI) win.
config({ path: resolve(__dirname, '../.env.test'), quiet: true });
