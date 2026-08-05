import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const translationsDir = path.join(root, 'src', 'translations');
const locales = ['sv', 'en'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function flattenKeys(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      flattenKeys(child, prefix ? `${prefix}.${key}` : key)
    );
  }

  return [prefix];
}

function flattenStrings(value, prefix = '') {
  if (typeof value === 'string') {
    return [[prefix, value]];
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      flattenStrings(child, prefix ? `${prefix}.${key}` : key)
    );
  }

  return [];
}

const translations = Object.fromEntries(
  locales.map(locale => [
    locale,
    readJson(path.join(translationsDir, `${locale}.json`)),
  ])
);

const errors = [];

for (const locale of locales) {
  if (translations[locale].lang !== locale) {
    errors.push(`${locale}.json has lang="${translations[locale].lang}", expected "${locale}"`);
  }
}

const [svKeys, enKeys] = locales.map(locale => new Set(flattenKeys(translations[locale])));

for (const key of svKeys) {
  if (!enKeys.has(key)) errors.push(`en.json is missing key: ${key}`);
}

for (const key of enKeys) {
  if (!svKeys.has(key)) errors.push(`sv.json is missing key: ${key}`);
}

const swedishLeaksInEnglish = [
  /\bLeveranstid\b/i,
  /\bProduktinformation\b/i,
  /\bKöpvillkor\b/i,
  /\bVarukorg\b/i,
  /\bKontakta\b/i,
  /\bUtforska\b/i,
  /\bProdukten hittades inte\b/i,
  /\bLägg i varukorgen\b/i,
  /\bexkl\. moms\b/i,
];

const englishLeaksInSwedish = [
  /\bToggle menu\b/i,
  /\bProduct not found\b/i,
  /\bBrowse\b/i,
  /\bLoad more\b/i,
  /\bContact us\b/i,
  /\bLog in\b/i,
  /\bAdd to cart\b/i,
];

function checkLeaks(locale, patterns) {
  for (const [key, value] of flattenStrings(translations[locale])) {
    for (const pattern of patterns) {
      if (pattern.test(value)) {
        errors.push(`${locale}.json ${key} contains "${value}"`);
        break;
      }
    }
  }
}

checkLeaks('en', swedishLeaksInEnglish);
checkLeaks('sv', englishLeaksInSwedish);

if (errors.length) {
  console.error('Localization check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Localization check passed.');
