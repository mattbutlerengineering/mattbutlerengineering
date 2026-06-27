/**
 * Token counting for context pack generation.
 *
 * Approximation: 1 token ≈ 4 UTF-16 code units (chars).
 * This is the widely-cited rule of thumb for English prose in GPT-style
 * tokenizers (cl100k_base, claude tokenizer). Actual token counts vary by
 * content type (code tends toward 3-5 chars/token), but the approximation is
 * fast, dependency-free, and accurate enough for budget warnings.
 *
 * For exact counts, swap in a real tokenizer (e.g. gpt-tokenizer) here.
 */

const CHARS_PER_TOKEN = 4;

/**
 * Estimate the number of tokens in `text` using the 4-chars-per-token heuristic.
 * Returns 0 for empty input.
 */
export function countTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
