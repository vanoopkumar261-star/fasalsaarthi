import { Linking } from "react-native";
import Markdown from "@ronradtke/react-native-markdown-display";
import { colors } from "@/constants/colors";

import { themed } from "@/theme";
/**
 * Renders the assistant's replies as formatted text instead of raw syntax.
 *
 * The model writes Markdown — every chat model does, and the server prompt asks
 * for "a tight bullet list", which all but guarantees it. This screen printed
 * that string through a plain <Text>, so farmers read
 *
 *   "Yes, you are eligible for **PM-KISAN**."
 *
 * asterisks and all. Measured on the server's stored replies, 61 of 93 contain
 * bold, so it was the common case rather than an edge one.
 *
 * ── Why a library rather than a hand-rolled subset ───────────────────────────
 * The same server text feeds this app and the web dashboard. If mobile rendered
 * only the handful of marks we expect and the model emitted something else, the
 * two clients would disagree — one formatted, one showing raw syntax — and the
 * difference would only surface in front of a farmer. The web side uses
 * react-markdown; this is its React Native counterpart, so both clients accept
 * the same input.
 *
 * Pure JavaScript, no native module, so Expo needs no rebuild.
 *
 * ── Styling ──────────────────────────────────────────────────────────────────
 * Every rule is set explicitly against the bubble's own typography (13.5px /
 * 19px line height). The library's defaults are sized for a document — larger
 * headings, wide margins, blue links — which inside a chat bubble reads as a
 * different app.
 *
 * Only ever used for ASSISTANT turns. The farmer's own messages stay plain
 * <Text>: their words should appear exactly as typed, and a stray asterisk in a
 * question should not quietly become italics.
 */

const BODY = 13.5;
const LINE = 19;

const styles = themed(() => ({
  body: { fontSize: BODY, lineHeight: LINE, color: colors.ink },

  // Paragraph spacing is done with margin-bottom only; the library's default
  // adds top margin too, which double-spaces a run of short paragraphs.
  paragraph: { marginTop: 0, marginBottom: 8, fontSize: BODY, lineHeight: LINE, color: colors.ink },

  strong: { fontWeight: "700" as const, color: colors.ink },
  em: { fontStyle: "italic" as const },
  s: { textDecorationLine: "line-through" as const },

  bullet_list: { marginTop: 2, marginBottom: 6 },
  ordered_list: { marginTop: 2, marginBottom: 6 },
  list_item: { flexDirection: "row" as const, justifyContent: "flex-start" as const, marginBottom: 3 },
  bullet_list_icon: { color: colors.leaf, fontSize: BODY, lineHeight: LINE, marginRight: 6 },
  ordered_list_icon: { color: colors.textFaint, fontSize: BODY, lineHeight: LINE, marginRight: 6 },

  // The model does not currently emit headings, but if it starts they should
  // read as emphasis inside a bubble, not as page titles.
  heading1: { fontSize: BODY + 1, fontWeight: "700" as const, color: colors.ink, marginTop: 6, marginBottom: 3 },
  heading2: { fontSize: BODY + 1, fontWeight: "700" as const, color: colors.ink, marginTop: 6, marginBottom: 3 },
  heading3: { fontSize: BODY, fontWeight: "700" as const, color: colors.ink, marginTop: 6, marginBottom: 3 },
  heading4: { fontSize: BODY, fontWeight: "700" as const, color: colors.ink, marginTop: 6, marginBottom: 3 },

  link: { color: colors.leaf, textDecorationLine: "underline" as const },

  code_inline: {
    fontFamily: undefined,
    fontSize: BODY - 1,
    backgroundColor: colors.sage,
    color: colors.ink,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  code_block: { backgroundColor: colors.sage, borderRadius: 8, padding: 10, fontSize: BODY - 1 },
  fence: { backgroundColor: colors.sage, borderRadius: 8, padding: 10, fontSize: BODY - 1 },

  blockquote: {
    backgroundColor: "transparent",
    borderLeftWidth: 2,
    borderLeftColor: colors.sageLine,
    paddingLeft: 10,
    marginVertical: 4,
  },

  hr: { backgroundColor: colors.sageLine, height: 1, marginVertical: 8 },

  // Tables turn up in roughly one reply in fifteen, usually mandi prices. Kept
  // narrow-friendly: a phone cannot scroll a table sideways here, so the cells
  // wrap rather than overflow the bubble.
  table: { borderWidth: 1, borderColor: colors.sageLine, borderRadius: 8, marginVertical: 6 },
  thead: { backgroundColor: colors.sage },
  th: { padding: 6, fontSize: BODY - 1.5, fontWeight: "700" as const, color: colors.ink },
  td: { padding: 6, fontSize: BODY - 1.5, color: colors.ink, flexWrap: "wrap" as const },
  tr: { borderBottomWidth: 1, borderColor: colors.sageLine, flexDirection: "row" as const },
}));

export default function AssistantMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      style={styles}
      // Links are opened deliberately rather than by the library's default
      // handler: this is model-authored text, so only http(s) is followed and
      // anything else is ignored instead of handed to the OS.
      onLinkPress={(url) => {
        if (/^https?:\/\//i.test(url)) void Linking.openURL(url);
        return false;
      }}
    >
      {children}
    </Markdown>
  );
}
