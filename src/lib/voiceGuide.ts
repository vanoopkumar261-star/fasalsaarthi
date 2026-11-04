import AsyncStorage from "@react-native-async-storage/async-storage";
import { speak, stopSpeaking } from "./speech";

/**
 * "Talking app": for farmers who can't read, every screen says its name as
 * it opens, and home greets them with how to use it. On by default; a switch
 * in Settings turns it off for those who'd rather read.
 */
const KEY = "voiceGuide";
let on = true;

export function loadVoiceGuide(): void {
  AsyncStorage.getItem(KEY)
    .then((v) => {
      on = v !== "off";
    })
    .catch(() => {});
}

export const voiceGuideOn = () => on;

/** While the always-on assistant is awake it does the talking itself (VoiceAgent.tsx). */
let agentAwake = false;
export function setAgentAwake(v: boolean): void {
  agentAwake = v;
}

export function setVoiceGuide(v: boolean): void {
  on = v;
  AsyncStorage.setItem(KEY, v ? "on" : "off").catch(() => {});
}

/** Speaks only when the guide is on; cuts off whatever was speaking. */
export function guide(text: string, locale: string): void {
  if (!on || agentAwake || !text.trim()) return;
  stopSpeaking();
  speak(text, locale);
}
