import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/** Runs once before all e2e suites: brings the test database schema up to date. */
export default function globalSetup(): void {
  config({ path: resolve(__dirname, '../.env.test'), quiet: true });
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
