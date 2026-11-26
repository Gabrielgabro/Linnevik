/**
 * Databastesterna kör mot en egen Neon-gren, aldrig mot produktionen
 * (source_of_truth §17.3).
 *
 * Grenen skapas från `main` och får alla migreringar i drizzle/ körda på sig,
 * så att en ny migrering provas här innan en deploy kör den i produktionen.
 * Efteråt raderas grenen. Kräver att `neon login` är gjort och att
 * NEON_PROJECT_ID finns i .env.local.
 *
 * TEST_DATABASE_URL hoppar över allt det här och kör mot en befintlig
 * testdatabas, till exempel en gren som behålls för felsökning.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const root = resolve(import.meta.dirname, '../..');

function neon(args: string[]): string {
  return execFileSync('neonctl', [...args, '--project-id', projectId()], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function projectId(): string {
  const id = process.env.NEON_PROJECT_ID?.replace(/"/g, '').trim();
  if (!id) throw new Error('NEON_PROJECT_ID saknas i .env.local.');
  return id;
}

function host(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // Den poolade och den direkta adressen skiljer sig bara på "-pooler".
    return new URL(url).hostname.replace('-pooler', '');
  } catch {
    return null;
  }
}

export default async function setup(project: TestProject) {
  try {
    process.loadEnvFile(resolve(root, '.env.local'));
  } catch {
    // CI sätter variablerna direkt.
  }
  const production = new Set([host(process.env.DATABASE_URL), host(process.env.DATABASE_URL_UNPOOLED)]);

  let branch: string | null = null;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    branch = `test-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    neon(['branches', 'create', '--name', branch, '--parent', 'main', '--output', 'json']);
    url = neon(['connection-string', branch]);
  }

  // Spärren: hur grenen än kom till får testerna aldrig skriva i produktionen.
  const target = host(url);
  if (!target || production.has(target)) {
    if (branch) neon(['branches', 'delete', branch]);
    throw new Error('Testdatabasen pekar på produktionen. Avbryter.');
  }

  try {
    // Samma migreringskörning som en deploy. migrate.mjs läser .env.local,
    // men process.loadEnvFile skriver inte över en variabel som redan finns.
    execFileSync('node', ['scripts/migrate.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url },
    });
  } catch (error) {
    if (branch) neon(['branches', 'delete', branch]);
    throw error;
  }

  project.provide('databaseUrl', url);

  return () => {
    if (branch) neon(['branches', 'delete', branch]);
  };
}
