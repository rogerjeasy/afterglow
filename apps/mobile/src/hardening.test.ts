import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ACC-17: the page is served with a strict Content-Security-Policy and the
 * standard hardening headers. This reads the same vercel.json Vercel applies, so
 * a regression in the headers fails the build.
 */
const config = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const all = config.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
const header = (key: string): string => all.find((h) => h.key === key)?.value ?? '';
const csp = Object.fromEntries(
  header('Content-Security-Policy')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [name, ...values] = d.split(/\s+/);
      return [name, values];
    }),
) as Record<string, string[]>;

describe('Page hardening (ACC-17)', () => {
  it('allows scripts only from our own origin, with no inline or eval', () => {
    expect(csp['script-src']).toEqual(["'self'"]);
    for (const [name, values] of Object.entries(csp)) {
      expect(values, name).not.toContain("'unsafe-eval'");
      expect(values, name).not.toContain('*');
      if (name === 'script-src' || name === 'default-src') {
        expect(values, name).not.toContain("'unsafe-inline'");
      }
    }
  });

  it('denies everything by default and never allows other origins to connect', () => {
    expect(csp['default-src']).toEqual(["'none'"]);
    expect(csp['connect-src']).toEqual(["'self'"]);
    for (const [name, values] of Object.entries(csp)) {
      expect(
        values.some((v) => /^https?:/.test(v)),
        name,
      ).toBe(false);
    }
  });

  it('forbids framing, base-uri changes, form posts and plugins', () => {
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'none'"]);
    expect(csp['form-action']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['upgrade-insecure-requests']).toBeDefined();
    expect(header('X-Frame-Options')).toBe('DENY');
  });

  it('sets the standard hardening headers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(header('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('allows camera and microphone to our own origin only; denies the rest', () => {
    const pp = header('Permissions-Policy');
    expect(pp).toContain('camera=(self)');
    expect(pp).toContain('microphone=(self)');
    expect(pp).toContain('geolocation=()');
    expect(pp).not.toMatch(/=\*/);
  });

  it('the built page contains no inline script and no external script or style', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const [, attrs, body] of scripts) {
      expect(body?.trim(), 'inline script').toBe('');
      expect(attrs).not.toMatch(/src="https?:/);
    }
    expect(html).not.toMatch(/<link[^>]+href="https?:/);
    expect(html).not.toMatch(/\son[a-z]+=/i); // no inline event handlers
  });
});
