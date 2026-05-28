/**
 * Parse REDLINE / END_REDLINE blocks from an agent response.
 *
 * Format (per buildSystemMessage instruction):
 *   REDLINE:
 *   <proposed replacement text>
 *   END_REDLINE
 *
 * Multiple blocks per response are allowed. Returns the proposed text of
 * each block in order. The caller pairs each with a target range (the
 * most recent Cmd+L / Send-to-Chat selection).
 */
export function extractRedlineBlocks(response: string): string[] {
  const blocks: string[] = []
  // Match REDLINE: anywhere — some local models (Gemma) like to prefix the
  // marker with decorative characters (e.g. "🍣 REDLINE:" or "**REDLINE:**"),
  // so we don't anchor to start-of-line. The format is specific enough
  // (REDLINE:, newline, content, newline, END_REDLINE) that false positives
  // in prose are vanishingly unlikely.
  const re = /REDLINE:[ \t]*\n([\s\S]*?)\nEND_REDLINE\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(response)) !== null) {
    const proposed = m[1].trim()
    if (proposed.length > 0) blocks.push(proposed)
  }
  return blocks
}
