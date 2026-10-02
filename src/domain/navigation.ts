export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]|%5c/i.test(value)) return '/'
  const origin = 'https://hitchtracker.invalid'
  try {
    const destination = new URL(value, origin)
    return destination.origin === origin ? destination.pathname + destination.search + destination.hash : '/'
  } catch { return '/' }
}
