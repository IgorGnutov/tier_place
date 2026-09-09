// Проміжні артефакти білда живуть у .build/ у корені репо — свідомо НЕ в dist/, інакше вони
// поїхали б на прод разом зі статикою.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../..', import.meta.url));
export const buildDir = `${root}.build`;

/** @param {string} name @returns {string} */
export function buildPath(name) {
  return `${buildDir}/${name}`;
}

/** @param {string} name @param {unknown} value */
export function writeBuildJson(name, value) {
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(buildPath(name), JSON.stringify(value));
}

/**
 * @template T
 * @param {string} name
 * @param {string} producedBy Назва кроку, який має його створити — щоб повідомлення про
 *   помилку одразу казало, який крок конвеєра не виконався.
 * @returns {T}
 */
export function readBuildJson(name, producedBy) {
  const path = buildPath(name);
  if (!existsSync(path)) {
    throw new Error(`немає .build/${name} — спершу мусить виконатись ${producedBy} (див. npm run build)`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}
