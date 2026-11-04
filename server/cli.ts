// Entry when running from source with Node (`pnpm start`); the release binary embeds the UI instead.
import { runCli } from './main';

runCli(process.argv.slice(2)).catch((e: Error) => {
  console.error('[intent] ' + e.message);
  process.exit(1);
});
