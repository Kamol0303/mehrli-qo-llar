import { resolveApiBase } from './api/client';

/** Origin hosting the app's own API (no trailing slash). */
export function resolveApiOrigin(): string {
  const base = resolveApiBase();
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return base.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}
