/**
 * Minimal TypeScript loader for the balance probe: strips types with esbuild
 * (already present as a Vite dependency) so the engine can be imported in
 * plain Node without a build step. Also resolves extensionless relative
 * imports the way a bundler would.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

function resolveTs(specifier, parentURL) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const base = new URL(specifier, parentURL);
  const candidates = specifier.endsWith('.ts')
    ? [base]
    : [new URL(`${base.href}.ts`), new URL(`${base.href}/index.ts`)];
  for (const candidate of candidates) {
    if (existsSync(fileURLToPath(candidate))) return candidate.href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const url = resolveTs(specifier, context.parentURL ?? import.meta.url);
  if (url) return { url, shortCircuit: true, format: 'module' };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
    return { format: 'module', source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
