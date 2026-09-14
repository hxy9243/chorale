#!/usr/bin/env node

import { runCli } from '../mcp/cli.mjs';

runCli({ entrypoint: process.argv[1] })
  .then((result) => {
    if (result?.statusCode) process.exit(result.statusCode);
  })
  .catch((error) => {
    console.error('Chorale CLI error:', error.message);
    process.exit(1);
  });
