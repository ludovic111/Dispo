import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(here, '../../Dispo/Localizable.xcstrings');
const output = resolve(here, '../src/i18n/locales');
const catalog = JSON.parse(await readFile(input, 'utf8'));
const languages = new Set([catalog.sourceLanguage ?? 'fr']);

for (const entry of Object.values(catalog.strings)) {
  for (const language of Object.keys(entry.localizations ?? {})) languages.add(language);
}

await mkdir(output, { recursive: true });
for (const language of [...languages].sort()) {
  const messages = {};
  for (const [source, entry] of Object.entries(catalog.strings)) {
    const translated = entry.localizations?.[language]?.stringUnit?.value;
    messages[source] = translated ?? source;
  }
  await writeFile(resolve(output, `${language}.json`), `${JSON.stringify(messages, null, 2)}\n`);
}

console.log(
  `Exported ${catalog.strings ? Object.keys(catalog.strings).length : 0} strings for ${languages.size} locales.`,
);
