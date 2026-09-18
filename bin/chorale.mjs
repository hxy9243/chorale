#!/usr/bin/env node

import { runCli } from '../server/cli.mjs';

runCli({ entrypoint: process.argv[1] })
  .then((result) => {
    if (result?.statusCode) process.exit(result.statusCode);
  })
  .catch((error) => {
    console.error('Chorale CLI error:', error.message);
    process.exit(1);
  });
