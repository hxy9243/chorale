const engine = process.argv[2] || 'copisteria';
if (process.argv.length > 3 || !['copisteria', 'audiveris'].includes(engine)) {
  throw new Error('Usage: npm run setup:scanner -- [copisteria|audiveris]');
}
if (engine === 'audiveris') await import('./setup-audiveris.mjs');
else await import('./setup-copisteria.mjs');
