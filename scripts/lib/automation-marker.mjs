/**
 * Hidden marker every automation-authored issue/PR comment carries (#9428).
 *
 * Routines and `reviewed-merge.yml` post as the human login via a PAT, so the
 * login cannot tell automation from the Owner. The marker can. Older comments
 * carry none and stay unclassifiable.
 */
export const AUTOMATION_MARKER = "<!-- mbe-automation -->";

/**
 * @param {unknown} body comment body
 * @returns {boolean} true when the body carries {@link AUTOMATION_MARKER}
 */
export function isAutomationComment(body) {
  return typeof body === "string" && body.includes(AUTOMATION_MARKER);
}
