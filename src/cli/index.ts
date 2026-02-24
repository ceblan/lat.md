#!/usr/bin/env node

import { locate } from './locate.js';

const args = process.argv.slice(2);
const command = args[0];

const commands: Record<string, (args: string[]) => Promise<void>> = {
  locate,
};

const handler = commands[command];
if (!handler) {
  console.error(`Usage: lat <command>

Commands:
  locate <query>  Find sections by id`);
  process.exit(1);
}

await handler(args.slice(1));
