import { run } from "./run-cli.js";

process.exit(
  run(process.argv, {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  }),
);
