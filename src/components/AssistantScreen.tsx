import { colors as themeColors } from "@/theme/colors";
import { useRef, useState } from "react";
import { useT } from "./i18n/LanguageProvider";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { sendChat, type ChatMessage } from "@/lib/chat";
import { colors } from "@/constants/colors";
import AssistantMarkdown from "./AssistantMarkdown";
import { themed } from "@/theme";

export function AssistantScreen() {
  const { t, locale } = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm your FasalSaarthi assistant. Ask me anything about your crops, weather, market or schemes." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    const reply = await sendChat(next, locale);
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
    setSending(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.headerRow}>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
              {item.role === "user" ? (
                /* The farmer's own words, exactly as typed. Parsing these would
                   let a stray asterisk in a question turn into italics. */
                <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{item.content}</Text>
              ) : (
                <AssistantMarkdown>{item.content}</AssistantMarkdown>
              )}
            </View>
          )}
        />

        {sending && <ActivityIndicator color={colors.primary} style={{ marginBottom: 8 }} />}

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("assistant.inputPlaceholder")}
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
            onSubmitEditing={send}
          />
          <Pressable onPress={send} disabled={sending || !input.trim()} style={[styles.sendBtn, (sending || !input.trim()) && styles.sendBtnDisabled]}>
            <Text style={styles.sendBtnText}>{t("assistant.sendAria")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  headerRow: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 3 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: colors.leaf },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.ink },

  list: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  bubble: { maxWidth: "85%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.sageLine, alignSelf: "flex-start" },
  bubbleUser: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  bubbleText: { fontSize: 13, lineHeight: 19, color: colors.ink },
  bubbleTextUser: { color: themeColors.onPrimary },

  inputRow: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.sageLine,
    backgroundColor: colors.surface,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.bg,
    maxHeight: 100,
  },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: themeColors.onPrimary, fontWeight: "700", fontSize: 13 },
}));
