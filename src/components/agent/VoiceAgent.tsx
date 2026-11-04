import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { usePathname, useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable } from "../ui/Pressable";
import { useT } from "../i18n/LanguageProvider";
import { LOCALES, type Locale } from "../../lib/i18n/config";
import type { ChatMessage } from "../../lib/chat";
import { speak, stopSpeaking } from "../../lib/speech";
import { transcribe } from "../../lib/voice";
import { setAgentAwake } from "../../lib/voiceGuide";
import { resetTour } from "../../lib/tour";
import { useTheme } from "../../theme/ThemeProvider";
import { audioState, beginRecording, endRecording } from "../../lib/agent/audioLock";
import { agentContextStore } from "../../lib/agent/context";
import { publishIntent } from "../../lib/agent/intents";
import { matchLocalCommand } from "../../lib/agent/localCommands";
import { isAffirmative, isNegative } from "../../lib/agent/affirm";
import { lastUndoable, markUndone } from "../../lib/agent/log";
import { describeScreen, waitForDescription } from "../../lib/agent/screenRegistry";
import { executeInverse, executeToolCall } from "../../lib/agent/tools";
import { sendTurn } from "../../lib/agent/turn";
import { vadStart, vadStep } from "../../lib/agent/vad";
import { bodyFont, colors, radius, space, type, themed } from "../../theme";

export type VoicePhase = "off" | "sleeping" | "listening" | "transcribing" | "thinking" | "speaking";

type Heard = { text: string; locale?: string };

type VoiceAgentValue = {
  phase: VoicePhase;
  heard: string;
  reply: string;
  /** Orb tap: wake when asleep, cut speech short, or mute while listening. */
  toggle: () => void;
  /** Onboarding: speak a question, listen for one answer. Null if nothing was said. */
  ask: (question: string, locale?: string) => Promise<Heard | null>;
  say: (text: string, locale?: string) => Promise<void>;
  /** Read out what the current screen shows, in the farmer's language (e.g. a fresh diagnosis). */
  narrate: () => void;
  /**
   * Speak a short yes/no question and run `onYes` only if the farmer's NEXT
   * spoken turn is a clear "yes". Used so a scan result offers an explanation
   * before reciting it. Unlike `ask()`, this does not record on its own — it
   * leans on the always-on loop to capture the answer, and wakes it if asleep.
   */
  offer: (question: string, onYes: () => void) => void;
};

const Ctx = createContext<VoiceAgentValue | null>(null);

export function useVoiceAgent(): VoiceAgentValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoiceAgent outside VoiceAgentProvider");
  return v;
}

/**
 * "Switched to X", in X.
 *
 * Not an i18n key, on purpose: a key resolves in whatever locale is active,
 * and the whole point of this line is that it is spoken in the language the
 * farmer just asked for — before the rest of the app has caught up. One
 * literal per locale is the only way to say it in the target language.
 */
const LANGUAGE_SWITCHED: Record<Locale, string> = {
  en: "Switched to English.",
  hi: "अब मैं हिन्दी में बोलूँगा।",
  kn: "ಈಗ ನಾನು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡುತ್ತೇನೆ.",
  ta: "இனி நான் தமிழில் பேசுவேன்.",
  te: "ఇప్పుడు నేను తెలుగులో మాట్లాడతాను.",
  ml: "ഇനി ഞാൻ മലയാളത്തിൽ സംസാരിക്കാം.",
  mr: "आता मी मराठीत बोलेन.",
  bn: "এখন আমি বাংলায় কথা বলব।",
  pa: "ਹੁਣ ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਬੋਲਾਂਗਾ।",
};

/** Screens the server's navigate tool may name (agent-farmer api/agent/turn SCREENS). */
const SCREENS = new Set([
  "hub", "today", "crops", "scan", "soil",
  "alerts", "settings", "language", "irrigation",
]);

/**
 * What to call each screen out loud.
 *
 * Reuses label keys the dictionary already carries in all nine languages, so
 * naming the screen in the acknowledgement costs no new strings. A screen
 * missing from this map is announced by its route word, which is ugly but
 * never silent.
 */
const SCREEN_LABEL: Record<string, string> = {
  hub: "nav.dashboard",
  today: "hub.today",
  crops: "nav.crops",
  scan: "hub.scan",
  soil: "hub.soil",
  alerts: "hub.alerts",
  settings: "nav.settings",
  language: "hub.language",
  irrigation: "hub.irrigation",
};

/**
 * Why a screen is being opened, which decides what the farmer hears.
 *
 * - "open": they asked to go somewhere. Acknowledge and stop — no model call.
 * - { ask }: they said something while navigating. Acknowledge first, then
 *   answer from the screen once it has loaded.
 * - "narrate": they are already here and want it read out. No acknowledgement
 *   (they know where they are), just the summary.
 */
type PresentMode = "open" | "narrate" | { ask: string };

/** Where the conversation loop must not run: signed out, gate, or onboarding (which uses ask()). */
const OUTSIDE_APP = new Set(["/", "/auth", "/onboarding"]);

/** Screens with their own big mic, where the floating orb would only duplicate it. */
const OWN_MIC = new Set(["/hub", "/voice"]);

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Empty/unheard turns in a row before the loop sleeps and waits for a tap. */
const MAX_QUIET_TURNS = 4;

/**
 * What colour the mic button shows, so a farmer glancing at it knows what to do
 * without reading a word:
 *   - RED    — off / asleep: not listening right now, tap to start.
 *   - YELLOW — listening: your turn, speak now.
 *   - BLUE   — transcribing / thinking / speaking: it is working, wait.
 * Red and blue track the theme; yellow is a fixed, unmistakable "go". Red for
 * the resting state (not green) so the farmer can tell at a glance when the
 * assistant is NOT listening versus actively listening.
 */
export function phaseColor(phase: VoicePhase): string {
  switch (phase) {
    case "listening":
      return "#F4C20D";
    case "transcribing":
    case "thinking":
    case "speaking":
      return colors.info;
    default:
      return colors.danger;
  }
}

/**
 * The always-on assistant: while the app is open and the farmer is signed
 * in, it is in conversation. It listens, answers aloud, opens the screen that
 * shows the answer, and listens again. 20 s of quiet puts it to sleep until
 * the orb is tapped; backgrounding the app closes the mic outright.
 *
 * The mic only opens through audioLock, which every speak() also takes, so
 * the app can never transcribe its own voice.
 */
export function VoiceAgentProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale, setLocale } = useT();
  const { setAppearance } = useTheme();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });

  const [phase, setPhase] = useState<VoicePhase>("sleeping");
  const [asking, setAsking] = useState(false); // onboarding's ask(), the one use outside the app
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");

  const inApp = !OUTSIDE_APP.has(pathname);
  const awake = useRef(false); // the farmer wants the loop running
  const looping = useRef(false);
  const greeted = useRef(false);
  const history = useRef<ChatMessage[]>([]);
  const lastReply = useRef("");
  const localeRef = useRef(locale);
  const tRef = useRef(t);
  const setLocaleRef = useRef(setLocale);
  // Same reason as setLocaleRef: handle() runs deep inside an async loop
  // that may have been created several utterances ago.
  const setAppearanceRef = useRef(setAppearance);
  /** A language heard once but not yet acted on — see adoptSpokenLocale. */
  const pendingLocale = useRef<{ code: Locale; count: number } | null>(null);
  /** A yes/no question awaiting the farmer's next turn — see offer(). */
  const pendingConfirm = useRef<{ onYes: () => void } | null>(null);
  useEffect(() => {
    localeRef.current = locale;
    tRef.current = t;
    setLocaleRef.current = setLocale;
    setAppearanceRef.current = setAppearance;
  }, [locale, t, setLocale, setAppearance]);
  const shown: VoicePhase = inApp || asking ? phase : "off";

  const say = useCallback(async (text: string, loc?: string) => {
    if (!text.trim()) return;
    setReply(text);
    lastReply.current = text;
    setPhase("speaking");
    await speak(text, loc ?? localeRef.current);
    if (!awake.current) setPhase("sleeping");
  }, []);

  /**
   * Make the app's language follow the farmer's voice — and then leave it alone.
   *
   * The old rule switched on every single reading, and only between Hindi and
   * English. One utterance Whisper misfiled as English was enough to flip the
   * entire interface mid-conversation, and flip it back on the next sentence;
   * the app's language visibly chased the farmer around instead of settling.
   *
   * So a new language has to be heard twice in a row before it is adopted. A
   * farmer who has genuinely changed language says more than one sentence in
   * it; a misdetection almost never repeats. Asking outright — "switch to
   * English" — still takes effect immediately, through the set_language tool,
   * which is the one path that should never need convincing.
   *
   * Note the server only auto-detects while the app is on English or Hindi;
   * on the other seven it transcribes in the language it was told and echoes
   * that locale back, which lands here as "same as now" and correctly changes
   * nothing.
   */
  const adoptSpokenLocale = useCallback((spoken?: string) => {
    const code = LOCALES.find((l) => l.code === spoken)?.code;
    if (!code || code === localeRef.current) {
      pendingLocale.current = null;
      return;
    }
    const heardSoFar = pendingLocale.current?.code === code ? pendingLocale.current.count + 1 : 1;
    pendingLocale.current = { code, count: heardSoFar };
    if (heardSoFar < 2) return;
    pendingLocale.current = null;
    // Silently: the farmer's answer arrives in the new language a moment
    // later, and hearing it is a clearer confirmation than being told.
    localeRef.current = code;
    setLocaleRef.current(code);
  }, []);

  /** One utterance: record until the farmer stops talking. "sleep" if nobody spoke, null if cut off. */
  const record = useCallback(async (): Promise<string | "sleep" | null> => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return "sleep";
    if (audioState() !== "idle") return null;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    beginRecording(() => {
      recorder.stop().catch(() => {});
    });
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      endRecording();
      return "sleep";
    }

    let vad = vadStart(Date.now());
    let last = Date.now();
    let lo = 0;
    let hi = -160;
    let verdict: "done" | "sleep" | null = null;
    while (!verdict) {
      await pause(100);
      // Someone else took the audio (a speak() elsewhere, or the app went to the background).
      if (audioState() !== "recording" || !awake.current) {
        if (audioState() === "recording") {
          await recorder.stop().catch(() => {});
          endRecording();
        }
        return null;
      }
      const now = Date.now();
      const db = recorder.getStatus().metering ?? -160;
      if (db > -100) lo = Math.min(lo, db);
      hi = Math.max(hi, db);
      const r = vadStep(vad, db, now, now - last);
      last = now;
      vad = r.state;
      if (r.verdict !== "continue") verdict = r.verdict;
    }
    await recorder.stop().catch(() => {});
    endRecording();
    // One line per utterance in logcat (ReactNativeJS): enough to tune the thresholds on a real phone.
    console.log(`VOICE utterance ${verdict} after ${Date.now() - vad.startedAt}ms, meter ${lo.toFixed(0)}..${hi.toFixed(0)} dB, floor ${vad.floor?.toFixed(0)}, speech ${vad.speechMs}ms`);
    return verdict === "done" ? recorder.uri : "sleep";
  }, [recorder]);

  /** Opens a screen and says the right thing about it — see PresentMode. */
  const present = useCallback(
    async (route: string, mode: PresentMode) => {
      const path = route.replace("/(app)", "");
      if (agentContextStore.getState().screen !== path) router.push(route as never);

      /*
        Acknowledge the moment we navigate.

        This function used to make no sound at all until the screen's data had
        arrived AND a second model call had come back — so "open the market"
        bought six to twelve seconds of silence. Worse, a screen that never
        produced a description (no network, an empty mandi response, a route
        whose data call failed) returned here without speaking, which is
        indistinguishable from the app never having heard the farmer. That is
        what "the voice tools are not set" on market, soil and input prices
        actually was.

        An acknowledgement is one i18n lookup and lands in well under a
        second, which turns the rest of the wait into something the farmer
        watches rather than wonders about.
      */
      if (mode !== "narrate") {
        const screen = path.replace(/^\//, "");
        const label = SCREEN_LABEL[screen];
        await say(tRef.current("agent.screenOpened", { screen: label ? tRef.current(label) : screen }));
      }

      // They asked to go somewhere and they are there. Asking the model to
      // also summarise it doubled the latency of every navigation to buy a
      // sentence nobody requested.
      if (mode === "open") return;

      setPhase("thinking");
      const summary = await waitForDescription(path);
      // The screen cannot say what it shows yet. The acknowledgement already
      // told the farmer where they are, so stop rather than apologise for a
      // screen sitting in front of them.
      if (!summary) return;

      // Screens describe themselves as plain English data; the model turns that
      // into two spoken sentences in the farmer's language.
      const question = mode === "narrate" ? "Briefly tell me the most important thing on this screen." : mode.ask;
      const r = await sendTurn([...history.current.slice(-4), { role: "user", content: question }], localeRef.current, summary, true);
      const text = r.kind === "reply" && r.text ? r.text : summary;
      history.current.push({ role: "assistant", content: text });
      await say(text);
    },
    [router, say]
  );

  const handle = useCallback(
    async (text: string) => {
      const loc = localeRef.current;
      const t = tRef.current;

      // A pending yes/no offer (e.g. "explain the diagnosis?") claims this turn.
      // A clear yes runs the action; a clear no drops it quietly; anything else
      // is treated as a fresh command (the offer is abandoned, not retried).
      if (pendingConfirm.current) {
        const p = pendingConfirm.current;
        const yes = isAffirmative(text);
        const no = isNegative(text);
        if (yes || no) {
          pendingConfirm.current = null;
          console.log(`VOICE decision: CONFIRM ${yes ? "yes" : "no"}`);
          if (yes) p.onYes();
          return;
        }
        // Neither: abandon the offer and let the utterance route normally.
        pendingConfirm.current = null;
      }

      const local = matchLocalCommand(text, loc);
      if (local) console.log(`VOICE decision: LOCAL ${local.type}${"route" in local ? " → " + local.route : ""}`);
      // A literal "open the market" matched locally: no model was consulted to
      // get here and none is needed after it either.
      if (local?.type === "navigate") return present(local.route, "open");
      if (local?.type === "setLanguage") {
        // Matched on-device: switch at once and confirm in the NEW language
        // (hearing it is the confirmation), same path as the set_language tool.
        const target = LOCALES.find((l) => l.code === local.code);
        if (!target) return say(t("agent.errorGeneric"));
        if (target.code === localeRef.current) {
          return say(t("agent.languageAlready", { language: target.label }));
        }
        pendingLocale.current = null;
        localeRef.current = target.code;
        setLocaleRef.current(target.code);
        return say(LANGUAGE_SWITCHED[target.code], target.code);
      }
      if (local?.type === "repeat") return say(lastReply.current || t("agent.nothingToRepeat"));
      if (local?.type === "undo") {
        const entry = await lastUndoable();
        if (!entry?.inverse) return say(t("agent.nothingToUndo"));
        const ok = await executeInverse(entry.inverse);
        if (ok) await markUndone(entry.id);
        return say(t(ok ? "agent.undone" : "agent.errorGeneric"));
      }

      setPhase("thinking");
      history.current.push({ role: "user", content: text });
      const screen = agentContextStore.getState().screen;
      const r = await sendTurn(history.current.slice(-6), loc, describeScreen(screen) ?? undefined);
      // One line per decision, so the live log on the laptop shows not just what
      // the AI heard but what it chose to do with it — the fastest way to see a
      // mis-route (wrong tool) or a stray reply.
      console.log(
        r.kind === "reply"
          ? `VOICE decision: REPLY — ${r.text}`
          : `VOICE decision: TOOL ${r.call.name} ${JSON.stringify(r.call.args)}`
      );
      if (r.kind === "reply") {
        history.current.push({ role: "assistant", content: r.text });
        return say(r.text || t("agent.errorGeneric"));
      }

      const { name, args } = r.call;
      if (name === "navigate") {
        const target = String(args.screen ?? "");
        return SCREENS.has(target) ? present(`/(app)/${target}`, { ask: text }) : say(t("agent.errorGeneric"));
      }
      if (name === "go_back") {
        if (router.canGoBack()) router.back();
        return;
      }
      if (name === "sleep") {
        awake.current = false;
        return say(t("agent.bye"));
      }
      if (name === "scan_leaf") {
        publishIntent("scan", { camera: true });
        router.push("/(app)/scan" as never);
        return say(t("agent.openingCamera"));
      }
      if (name === "read_soil_meter") {
        // Same shape as scan_leaf: land on the screen and open its camera, so
        // the farmer never has to put the meter down to tap anything.
        publishIntent("soil", { camera: true });
        router.push("/(app)/soil" as never);
        return say(t("agent.openingMeter"));
      }
      if (name === "add_farm") {
        // The sheet is a modal on the crops screen, so the intent is left for
        // that screen to claim as it mounts — navigate alone cannot open it.
        publishIntent("addFarm", { open: true });
        router.push("/(app)/crops" as never);
        return say(t("agent.addingFarm"));
      }
      if (name === "replay_tutorial") {
        const farmerId = agentContextStore.getState().farmerId;
        if (!farmerId) return say(t("agent.errorOffline"));
        await resetTour(farmerId);
        await say(t("agent.tutorialStarting"));
        // replace(), not push(): the hub decides whether to run the tour in a
        // mount effect, so it has to arrive as a fresh mount rather than a
        // screen already sitting underneath this one.
        router.replace("/(app)/hub" as never);
        return;
      }
      if (name === "set_theme") {
        const mode = args.mode === "dark" ? "dark" : args.mode === "light" ? "light" : null;
        if (!mode) return say(t("agent.errorGeneric"));
        setAppearanceRef.current(mode);
        return say(t(mode === "dark" ? "agent.themeDark" : "agent.themeLight"));
      }
      if (name === "set_language") {
        const code = String(args.locale ?? "");
        const target = LOCALES.find((l) => l.code === code);
        if (!target) return say(t("agent.errorGeneric"));
        // localeRef, not the `locale` binding: this runs deep inside an async
        // loop that may have been created several utterances ago, and the
        // captured value would be whatever the language was back then.
        if (target.code === localeRef.current) {
          return say(t("agent.languageAlready", { language: target.label }));
        }
        // Asked for outright, so it outranks anything half-heard: drop a
        // pending auto-switch that would otherwise fire on the next sentence.
        pendingLocale.current = null;
        setLocaleRef.current(target.code);
        // Confirmed in the NEW language and spoken in its own voice: the
        // farmer asked to be addressed in it, so hearing it IS the
        // confirmation. say() defaults to localeRef, which React has not
        // updated yet this tick, so the code is passed explicitly.
        return say(LANGUAGE_SWITCHED[target.code], target.code);
      }
      const exec = await executeToolCall(r.call, t);
      if (!exec.ok) return say(exec.reason || t("agent.errorGeneric"));
      // A committed write is a finished transaction, not an open thread. Drop
      // the short history so the model cannot re-see "I sold cotton for 40k" on
      // the next (possibly self-echoed) utterance and log it all over again.
      if (name === "log_expense" || name === "set_soil_ph") history.current = [];
      /*
        say() ignores empty text, so a tool that succeeded without producing a
        sentence would leave the farmer in silence — indistinguishable, hands
        free, from the app having failed to hear them at all. Every executed
        tool owes an answer out loud, even a generic one.
      */
      const spoken =
        name === "log_expense" ? `${t("agent.saved")} ${exec.summary}` : exec.summary;
      await say(spoken.trim() || t("agent.done"));
    },
    [present, router, say]
  );

  const loop = useCallback(async () => {
    if (looping.current) return;
    looping.current = true;
    // How many turns in a row with nothing to act on before the assistant
    // stops listening and waits for a deliberate tap. The old loop gave up on
    // the very first silence, which made it feel like it had stopped hearing
    // the farmer; a hands-free user often needs a moment to start. After this
    // many empty turns the mic closes so it is not left open indefinitely —
    // tapping the mic starts a fresh cycle.
    let quietTurns = 0;
    const giveUp = async () => {
      awake.current = false;
      await say(tRef.current("agent.bye")); // "Tap the mic when you need me."
    };
    try {
      while (awake.current) {
        setPhase("listening");
        const uri = await record();
        if (!awake.current) break;
        if (uri === "sleep") {
          // Nobody spoke this turn. Try a few times before giving up.
          if (++quietTurns >= MAX_QUIET_TURNS) {
            await giveUp();
            break;
          }
          continue;
        }
        if (!uri) {
          // Cut off by something else speaking: wait for the speaker to finish, then listen again.
          while (audioState() !== "idle" && awake.current) await pause(150);
          continue;
        }
        setPhase("transcribing");
        const result = await transcribe(uri, localeRef.current);
        if (!awake.current) break;
        if (result.error) {
          awake.current = false;
          await say(tRef.current("agent.errorOffline"));
          break;
        }
        console.log(`VOICE heard [${result.locale ?? "?"}]: ${result.text}`);
        if (!result.text) {
          // Heard noise but no words — an unproductive turn, same patience cap.
          if (++quietTurns >= MAX_QUIET_TURNS) {
            await giveUp();
            break;
          }
          continue;
        }
        quietTurns = 0; // a real utterance resets the counter
        setHeard(result.text);
        adoptSpokenLocale(result.locale);
        try {
          await handle(result.text);
        } catch (e) {
          console.error("VOICE AGENT turn failed:", e);
          await say(tRef.current("agent.errorGeneric"));
        }
      }
    } finally {
      looping.current = false;
      setPhase("sleeping");
    }
  }, [record, handle, say, adoptSpokenLocale]);

  const wake = useCallback(() => {
    awake.current = true;
    loop();
  }, [loop]);

  const sleep = useCallback(() => {
    awake.current = false;
    stopSpeaking();
  }, []);

  const toggle = useCallback(() => {
    if (shown === "speaking") return stopSpeaking(); // the loop moves on to listening
    if (shown === "sleeping") return wake();
    if (shown === "listening") return sleep();
  }, [shown, wake, sleep]);

  // Entering the app: greet once, then listen. Leaving it (sign out): stop.
  useEffect(() => {
    if (!inApp) {
      sleep();
      return;
    }
    if (greeted.current) return;
    greeted.current = true;
    awake.current = true;
    say(t("agent.greeting")).then(wake);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inApp]);

  // The mic is for the open app only: background closes it, coming back resumes.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        if (inApp && greeted.current) wake();
      } else {
        sleep();
      }
    });
    return () => sub.remove();
  }, [inApp, wake, sleep]);

  // While awake the assistant does the talking; the per-screen voice guide stays quiet.
  useEffect(() => setAgentAwake(shown !== "off" && shown !== "sleeping"), [shown]);

  const narrate = useCallback(() => {
    present(`/(app)${agentContextStore.getState().screen}`, "narrate").catch(() => {});
  }, [present]);

  const offer = useCallback(
    (question: string, onYes: () => void) => {
      pendingConfirm.current = { onYes };
      // Ask, then make sure the loop is awake to hear the answer — the farmer
      // may have gone quiet during the scan and let it fall asleep.
      say(question).then(() => {
        if (!awake.current) wake();
      });
    },
    [say, wake]
  );

  const ask = useCallback(
    async (question: string, loc?: string): Promise<Heard | null> => {
      setAsking(true);
      try {
        await say(question, loc);
        awake.current = true;
        setPhase("listening");
        const uri = await record();
        awake.current = false;
        if (!uri || uri === "sleep") return null;
        setPhase("transcribing");
        const result = await transcribe(uri, loc ?? localeRef.current);
        if (result.error || !result.text) return null;
        setHeard(result.text);
        return { text: result.text, locale: result.locale };
      } finally {
        awake.current = false;
        setPhase("sleeping");
        setAsking(false);
      }
    },
    [record, say]
  );

  return (
    <Ctx.Provider value={{ phase: shown, heard, reply, toggle, ask, say, narrate, offer }}>
      {children}
      {inApp && !OWN_MIC.has(pathname) ? <VoiceOrb /> : null}
    </Ctx.Provider>
  );
}

const ICON: Record<VoicePhase, keyof typeof MaterialCommunityIcons.glyphMap> = {
  off: "microphone-off",
  sleeping: "microphone-outline",
  listening: "microphone",
  transcribing: "dots-horizontal",
  thinking: "dots-horizontal",
  speaking: "volume-high",
};

/** Tap target for the whole loop, floating over every screen without its own mic. */
export function VoiceOrb({ size = 64 }: { size?: number }) {
  const { phase, heard, reply, toggle } = useVoiceAgent();
  const { t, locale } = useT();
  const insets = useSafeAreaInsets();
  const live = phase === "listening";

  // The same feedback the hub shows under its mic, carried to every other
  // screen: a colour change alone left the farmer unsure whether the assistant
  // was listening, thinking or talking. The label names the phase; the snippet
  // shows what it heard (while it works) or is saying (while it speaks), so the
  // orb reads like a tiny transcript rather than a mystery light.
  const busy = phase !== "sleeping" && phase !== "off";
  const label = busy ? t(`voice.${phase}`) : null;
  const snippet =
    phase === "speaking" ? reply : phase === "transcribing" || phase === "thinking" ? heard : "";

  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: insets.bottom + space.lg }]}>
      {busy ? (
        <View style={styles.orbCaption} pointerEvents="none">
          <Text style={[styles.orbCaptionLabel, { fontFamily: bodyFont(locale, "semi") }]}>{label}</Text>
          {snippet ? (
            <Text numberOfLines={2} style={[styles.orbCaptionText, { fontFamily: bodyFont(locale) }]}>
              {snippet}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={t(phase === "sleeping" ? "agent.tapToTalk" : `voice.${phase === "off" ? "ready" : phase}`)}
        style={[
          styles.orb,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: phaseColor(phase) },
          live && styles.orbLive,
        ]}
      >
        <MaterialCommunityIcons name={ICON[phase]} size={size * 0.45} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

/** One line under the big mic on the hub and voice screens: what the assistant is doing. */
export function VoiceStatus({ onDark = false }: { onDark?: boolean }) {
  const { phase } = useVoiceAgent();
  const { t, locale } = useT();
  const label = phase === "sleeping" || phase === "off" ? t("agent.tapToTalk") : t(`voice.${phase}`);
  return (
    <Text style={[styles.status, onDark && { color: colors.textOnDark }, { fontFamily: bodyFont(locale) }]}>{label}</Text>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    dock: { position: "absolute", right: space.lg, alignItems: "flex-end" },
    orb: { alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, elevation: 6 },
    // A bright ring while listening, so "speak now" reads even at a glance.
    orbLive: { borderWidth: 5, borderColor: "rgba(255,255,255,0.65)" },
    status: { ...type.secondary, color: colors.textSecondary, textAlign: "center", borderRadius: radius.card },
    // The status bubble above the floating orb, mirroring the hub's mic caption.
    orbCaption: {
      maxWidth: 260,
      marginBottom: space.xs,
      paddingVertical: space.xs,
      paddingHorizontal: space.sm,
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      elevation: 4,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    orbCaptionLabel: { ...type.meta, color: colors.primary, fontWeight: "700", textAlign: "right" },
    orbCaptionText: { ...type.secondary, color: colors.textSecondary, textAlign: "right", marginTop: 2 },
  })
);
