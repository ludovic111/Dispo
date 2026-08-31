import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';
import * as ts from 'typescript';

import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import fr from '@/i18n/locales/fr.json';
import itCatalog from '@/i18n/locales/it.json';
import ja from '@/i18n/locales/ja.json';
import ko from '@/i18n/locales/ko.json';
import pt from '@/i18n/locales/pt.json';
import zhHans from '@/i18n/locales/zh-Hans.json';

const catalogs = { de, en, es, fr, it: itCatalog, ja, ko, pt, 'zh-Hans': zhHans };

type TranslationUse = {
  file: string;
  key: string;
  line: number;
};

type VisibleLiteralUse = TranslationUse & {
  kind: 'Alert' | 'JSX' | 'prop';
};

type SwiftCatalog = {
  strings: Record<
    string,
    {
      localizations?: Record<string, { stringUnit?: { value?: string } }>;
    }
  >;
};

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function literalTranslationUses(): TranslationUse[] {
  const sourceRoot = path.resolve(process.cwd(), 'src');

  return sourceFiles(sourceRoot).flatMap((file) => {
    const sourceText = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const uses: TranslationUse[] = [];

    function visit(node: ts.Node): void {
      const firstArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 't' &&
        firstArgument &&
        (ts.isStringLiteral(firstArgument) || ts.isNoSubstitutionTemplateLiteral(firstArgument))
      ) {
        uses.push({
          file: path.relative(process.cwd(), file),
          key: firstArgument.text,
          line:
            sourceFile.getLineAndCharacterOfPosition(firstArgument.getStart(sourceFile)).line + 1,
        });
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return uses;
  });
}

const visiblePropNames = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'description',
  'emptyMessage',
  'emptyTitle',
  'errorMessage',
  'eyebrow',
  'helper',
  'label',
  'message',
  'placeholder',
  'submitLabel',
  'subtitle',
  'title',
]);

// These are product marks, locale-neutral measurements, or country codes.
const visibleLiteralAllowlist = new Set([
  '100 km',
  '5 km',
  'BPM',
  'CH',
  'Dispo v',
  'dispo',
  'fr',
  'km',
  'v',
  '· dispoapp.net',
]);

function visibleLiteralUses(): VisibleLiteralUse[] {
  const roots = [
    'src/app',
    'src/features/auth',
    'src/features/connectivity',
    'src/features/discovery',
    'src/features/gigs',
    'src/features/groups',
    'src/features/location',
    'src/features/media',
    'src/features/messages',
    'src/features/navigation',
    'src/features/onboarding',
    'src/features/portfolio',
    'src/features/premium',
    'src/features/profiles',
    'src/features/schools',
    'src/features/sessions',
    'src/features/settings',
  ].map((directory) => path.resolve(process.cwd(), directory));

  return roots.flatMap((root) =>
    sourceFiles(root).flatMap((file) => {
      const sourceText = fs.readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(
        file,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const uses: VisibleLiteralUse[] = [];

      const add = (node: ts.Node, kind: VisibleLiteralUse['kind'], raw: string) => {
        const key = raw.replace(/\s+/g, ' ').trim();
        if (!/\p{L}/u.test(key) || visibleLiteralAllowlist.has(key)) return;
        uses.push({
          file: path.relative(process.cwd(), file),
          key,
          kind,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        });
      };

      const addVisibleExpression = (node: ts.Expression, kind: VisibleLiteralUse['kind']): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          add(node, kind, node.text);
          return;
        }
        if (ts.isTemplateExpression(node)) {
          add(node.head, kind, node.head.text);
          node.templateSpans.forEach((span) => add(span.literal, kind, span.literal.text));
          return;
        }
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression) && node.expression.text === 't') return;
          node.arguments.forEach((argument) => addVisibleExpression(argument, kind));
          return;
        }
        if (ts.isConditionalExpression(node)) {
          addVisibleExpression(node.whenTrue, kind);
          addVisibleExpression(node.whenFalse, kind);
          return;
        }
        if (
          ts.isBinaryExpression(node) &&
          [
            ts.SyntaxKind.AmpersandAmpersandToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.PlusToken,
            ts.SyntaxKind.QuestionQuestionToken,
          ].includes(node.operatorToken.kind)
        ) {
          addVisibleExpression(node.left, kind);
          addVisibleExpression(node.right, kind);
          return;
        }
        if (
          ts.isParenthesizedExpression(node) ||
          ts.isAsExpression(node) ||
          ts.isNonNullExpression(node)
        )
          addVisibleExpression(node.expression, kind);
      };

      function visit(node: ts.Node): void {
        if (ts.isJsxText(node)) add(node, 'JSX', node.text);
        if (
          ts.isJsxAttribute(node) &&
          ts.isIdentifier(node.name) &&
          visiblePropNames.has(node.name.text) &&
          node.initializer
        ) {
          if (ts.isStringLiteral(node.initializer)) add(node, 'prop', node.initializer.text);
          if (ts.isJsxExpression(node.initializer) && node.initializer.expression)
            addVisibleExpression(node.initializer.expression, 'prop');
        }
        if (
          ts.isJsxExpression(node) &&
          node.expression &&
          (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
        ) {
          addVisibleExpression(node.expression, 'JSX');
        }
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(sourceFile) === 'Alert' &&
          node.expression.name.text === 'alert'
        ) {
          node.arguments.slice(0, 2).forEach((argument) => addVisibleExpression(argument, 'Alert'));
          const buttons = node.arguments[2];
          if (buttons)
            ts.forEachChild(buttons, function inspectButton(child): void {
              if (ts.isPropertyAssignment(child) && child.name.getText(sourceFile) === 'text')
                addVisibleExpression(child.initializer, 'Alert');
              ts.forEachChild(child, inspectButton);
            });
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      return uses;
    }),
  );
}

describe('i18n catalogs', () => {
  it('contains every literal t(...) key used by the Expo source', () => {
    const missing = literalTranslationUses()
      .filter(({ key }) => !(key in fr))
      .map(({ file, key, line }) => `${file}:${line} — ${JSON.stringify(key)}`);

    expect(missing).toEqual([]);
  });

  it('keeps the same complete key set in all nine locales', () => {
    const frenchKeys = Object.keys(fr).sort();
    const differences = Object.entries(catalogs).flatMap(([locale, catalog]) => {
      const keys = Object.keys(catalog).sort();
      if (JSON.stringify(keys) === JSON.stringify(frenchKeys)) return [];

      return [
        {
          locale,
          extra: keys.filter((key) => !(key in fr)),
          missing: frenchKeys.filter((key) => !(key in catalog)),
        },
      ];
    });

    expect(differences).toEqual([]);
  });

  it('preserves every exact translation imported from the Swift catalog', () => {
    const swiftCatalogPath = path.resolve(process.cwd(), '..', 'Dispo', 'Localizable.xcstrings');
    const swiftCatalog = JSON.parse(fs.readFileSync(swiftCatalogPath, 'utf8')) as SwiftCatalog;
    const differences = Object.entries(swiftCatalog.strings).flatMap(([key, entry]) =>
      Object.entries(catalogs).flatMap(([locale, catalog]) => {
        const expected =
          locale === 'fr' ? key : (entry.localizations?.[locale]?.stringUnit?.value ?? key);
        const actual = (catalog as Record<string, string>)[key];
        return actual === expected ? [] : [{ actual, expected, key, locale }];
      }),
    );

    expect(differences).toEqual([]);
  });

  it('keeps visible literals behind i18n across every user-facing surface', () => {
    const raw = visibleLiteralUses().map(
      ({ file, key, kind, line }) => `${file}:${line} [${kind}] — ${JSON.stringify(key)}`,
    );

    expect(raw).toEqual([]);
  });
});
