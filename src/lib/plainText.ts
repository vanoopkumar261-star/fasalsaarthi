/**
 * Strips Markdown so a reply can be spoken aloud.
 *
 * The assistant writes Markdown, and until the chat learned to render it the
 * syntax was visible on screen. It was also being handed straight to the speech
 * synthesiser, which is the less obvious half of the same bug: a voice reading
 * "star star P M KISAN star star" is worse than one reading nothing, and it hits
 * exactly the farmers who most need the reply read to them.
 *
 * Deliberately a small regex pass rather than a real parser. The input is one
 * chat reply, the output is thrown at a speech engine, and pulling a Markdown
 * AST into the client to decide how to pronounce a bullet would cost more than
 * the problem is worth. It handles what the model actually emits — measured
 * across the stored replies: bold, italics, bullets, numbered lists, links,
 * tables and the bracketed source markers retrieval adds.
 */
export function toSpeakableText(md: string): string {
  if (!md) return "";

  return (
    md
      // Fenced code, then inline code — content kept, fences dropped.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")

      // Images first (they carry no spoken value), then links → their label.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")

      // Emphasis. Longest markers first so ** is not left as a stray *.
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1$2")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")

      // Headings and blockquote markers.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")

      // Bullets become sentence breaks so the voice pauses between points
      // instead of running them together.
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")

      // Tables. The separator row is deleted outright rather than blanked —
      // left as an empty line it becomes a spoken pause in the middle of the
      // data. Outer pipes go before the inner ones become commas, otherwise
      // every row is read starting with "comma".
      .replace(/^\s*\|?[-:\s|]+\|[-:\s|]*$\n?/gm, "")
      .replace(/^\s*\|/gm, "")
      .replace(/\|\s*$/gm, "")
      .replace(/\|/g, ", ")
      .replace(/^\s*([-*_])\1{2,}\s*$/gm, " ")

      // Source markers the retrieval prompt introduces — [1] and the 【1】 the
      // model sometimes prefers. Meaningful on screen beside the citation
      // chips, meaningless read aloud.
      .replace(/【\s*\d+\s*】/g, "")
      .replace(/\[\s*\d+\s*\]/g, "")

      // Collapse the whitespace the substitutions leave behind. Removing a
      // "[1]" mid-sentence strands a space before the punctuation that follows
      // it, so closing brackets are tidied alongside the usual suspects.
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/ +([,.;:!?)\]])/g, "$1")
      .replace(/\(\s+/g, "(")
      .replace(/\(\s*\)/g, "")
      .replace(/^[ ,]+|[ ,]+$/gm, "")
      .trim()
  );
}
