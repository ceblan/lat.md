import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { checkMd } from '../src/cli/check.js';

const casesDir = join(import.meta.dirname, 'cases');

function latDir(name: string): string {
  return join(casesDir, name, 'lat.md');
}

describe('source-ref-php-valid', () => {
  // @lat: [[tests/check-md#Passes with valid links#Passes with PHP source symbol links]]
  it('check md passes for valid PHP source refs', async () => {
    const { errors } = await checkMd(latDir('source-ref-php-valid'));
    expect(errors).toHaveLength(0);
  });
});

describe('error-source-ref-php-missing', () => {
  // @lat: [[tests/check-md#Detects broken links#Detects missing PHP source symbols]]
  it('check md reports all missing PHP symbols', async () => {
    const { errors } = await checkMd(latDir('error-source-ref-php-missing'));
    expect(errors).toHaveLength(4);

    const byTarget = new Map(errors.map((e) => [e.target, e]));

    const fn = byTarget.get('src/app.php#nonexistent')!;
    expect(fn).toBeDefined();
    expect(fn.message).toContain('symbol "nonexistent" not found');

    const cls = byTarget.get('src/app.php#MissingClass')!;
    expect(cls).toBeDefined();
    expect(cls.message).toContain('symbol "MissingClass" not found');

    const method = byTarget.get('src/app.php#Greeter#missing')!;
    expect(method).toBeDefined();
    expect(method.message).toContain('symbol "Greeter#missing" not found');

    const nested = byTarget.get('src/app.php#Missing#method')!;
    expect(nested).toBeDefined();
    expect(nested.message).toContain('symbol "Missing#method" not found');
  });
});
