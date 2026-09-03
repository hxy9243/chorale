import { defaultRehypePlugins } from 'streamdown';

// Keep Streamdown's sanitizer and URL hardening, but omit its raw HTML parser.
export const CHORALE_STREAMDOWN_REHYPE_PLUGINS = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];
