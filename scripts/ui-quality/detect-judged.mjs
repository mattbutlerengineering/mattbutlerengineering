/**
 * detect-judged.mjs — `detect.mjs judged`: lands in the next breakdown item
 * (Judged-output validation). Until then the subcommand refuses.
 */
export function judgedCommand(ctx) {
  ctx.stderr("detect.mjs judged: not implemented yet\n");
  return 2;
}
