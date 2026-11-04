import { useEffect, useRef, useState } from "react";
import { useVoiceAgent } from "@/components/agent/VoiceAgent";
import { useT } from "@/components/i18n/LanguageProvider";
import { extractField, type FieldKind } from "@/lib/agent/onboardVoice";
import { geocode } from "@/lib/geocode";
import { SOIL_TYPES, type CropRec, type CropSelection, type FarmDraft } from "@/lib/onboarding";
import {
  IRRIGATION_METHODS,
  IRRIGATION_SOURCES,
  WATER_REGIMES,
  type IrrigationMethod,
  type IrrigationSource,
  type WaterRegime,
} from "@/lib/irrigationCatalog";
import { validateArea } from "@/lib/validation";
import { voiceGuideOn } from "@/lib/voiceGuide";
import type { ProfileDraft } from "./StepProfile";

type Lang = "hi" | "en";

/** Voice tries at one field before it falls back to the keyboard (phone is manual regardless). */
const MAX_FIELD_ATTEMPTS = 4;

const Q = {
  hello: { hi: "नमस्ते! चलिए आपका खाता बनाते हैं। बस बोलकर जवाब दीजिए।", en: "Let's set up your farm. Just answer out loud." },
  name: { hi: "आपका नाम क्या है?", en: "What is your name?" },
  phone: { hi: "आपका मोबाइल नंबर क्या है?", en: "What is your mobile number?" },
  place: { hi: "आपका गाँव और ज़िला कौन सा है? या पिन कोड बोलिए।", en: "Which village and district is your farm in? Or say the PIN code." },
  placeOk: { hi: "मुझे यह जगह मिली: {place}। क्या यह सही है?", en: "I found: {place}. Is that right?" },
  tapMap: { hi: "जगह नहीं मिली। नक्शे पर अपनी जगह दबाइए, फिर आगे बढ़ें दबाइए।", en: "I could not find it. Tap your place on the map, then tap Continue." },
  area: { hi: "आपके पास कुल कितने एकड़ ज़मीन है?", en: "How many acres of land do you have in total?" },
  soil: { hi: "मिट्टी कैसी है? जलोढ़, काली, लाल, रेतीली या चिकनी?", en: "What is your soil like? Alluvial, black, red, sandy or clay?" },
  water: { hi: "क्या खेत सिंचाई वाला है या सिर्फ़ बारिश पर?", en: "Is the field irrigated, or does it depend on rain only?" },
  waterSource: { hi: "पानी कहाँ से आता है? बोरवेल, नहर, नदी, तालाब, पोखर या लिफ्ट?", en: "Where does the water come from? Borewell, canal, river, tank, farm pond or lift?" },
  waterMethod: { hi: "पानी खेत तक कैसे पहुँचता है? ड्रिप, फव्वारा, रेन गन, क्यारी, थाला, बाढ़ या पाइप से?", en: "How does the water reach the crop? Drip, sprinkler, rain gun, furrow, basin, flood or a hose?" },
  findingCrops: { hi: "धन्यवाद। आपकी ज़मीन के लिए फ़सल ढूँढ रहा हूँ।", en: "Thank you. Finding the best crops for your land." },
  crop: { hi: "आपकी ज़मीन के लिए {crop} सबसे अच्छी है। क्या यही उगाएँगे? नहीं तो फ़सल का नाम बोलिए।", en: "{crop} suits your land best. Will you grow it? If not, say the crop name." },
  cropName: { hi: "कौन सी फ़सल उगाएँगे?", en: "Which crop will you grow?" },
  sown: { hi: "बुवाई कब की, या कब करेंगे? जैसे आज, या पिछले हफ़्ते।", en: "When did you sow, or when will you? For example today, or last week." },
  terms: { hi: "आपकी जानकारी सिर्फ़ खेती की सलाह के लिए रखी जाएगी। क्या आप सहमत हैं? हाँ या नहीं बोलिए।", en: "Your details are kept only to give you farming advice. Do you agree? Say yes or no." },
  termsNeeded: { hi: "सहमति के बिना खाता नहीं बन सकता। जब तैयार हों, नीचे सहमति वाला डिब्बा दबाइए।", en: "The account needs your agreement. Tick the box below when you are ready." },
  again: { hi: "माफ़ कीजिए, समझ नहीं आया। फिर से बोलिए।", en: "Sorry, I did not get that. Please say it again." },
  typeIt: { hi: "कोई बात नहीं, इसे हाथ से भर दीजिए।", en: "No problem, please fill this one in by hand." },
} as const;

type Props = {
  step: 0 | 1 | 2 | 3;
  recs: CropRec[][] | null;
  email: string;
  setProfile: (patch: Partial<ProfileDraft>) => void;
  updateFarm: (index: number, patch: Partial<FarmDraft>) => void;
  updateSelection: (index: number, patch: Partial<CropSelection>) => void;
  setTermsAccepted: (v: boolean) => void;
};

/**
 * Registration as a spoken conversation: one question at a time, each answer
 * written into the visible form, which stays editable by hand throughout.
 * Returns the step whose questions are all answered, so the screen can press
 * its own Continue button (with its own fresh validation) for the farmer.
 *
 * ponytail: voice fills the first farm only; a farmer with several plots adds
 * the rest by hand. Loop over farms here if that turns out to be common.
 */
export function useVoiceInterview(p: Props): number | null {
  const { ask, say } = useVoiceAgent();
  const { setLocale } = useT();
  const [answered, setAnswered] = useState<number | null>(null);
  const ran = useRef(new Set<number>());
  const lang = useRef<Lang>("hi");
  const stopped = useRef(false);
  const alive = useRef(true);
  const props = useRef(p);
  useEffect(() => {
    props.current = p;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!voiceGuideOn() || stopped.current || ran.current.has(p.step)) return;
    if (p.step === 3 && !p.recs) return;
    ran.current.add(p.step);

    const text = (key: keyof typeof Q, vars: Record<string, string> = {}) =>
      Object.entries(vars).reduce<string>((s, [k, v]) => s.replace(`{${k}}`, v), Q[key][lang.current]);

    /**
     * Asks until the answer yields an ACCEPTABLE value (twice at most); null
     * stops the interview and hands the field to the keyboard.
     *
     * `accept` is the important half. Without it this wrote whatever the
     * extractor returned straight into the visible form, so a misheard
     * "nine eight seven six..." became a seven-digit phone number sitting in
     * the farmer's field — data they never gave, which the Continue gate then
     * refused without explaining why. A value the form itself would reject is
     * not an answer: ask again, and if that fails leave the field EMPTY and
     * say so, because an empty field is a question and a wrong one is a lie.
     */
    const field = async (
      key: keyof typeof Q,
      kind: FieldKind,
      vars?: Record<string, string>,
      options?: string[],
      accept?: (value: string | number | boolean) => boolean
    ) => {
      // Give the farmer several tries before handing a field to the keyboard —
      // a vague or misheard answer should prompt "say it again", not give up on
      // the first miss. Only after this many failed attempts does it fall back
      // to manual entry.
      for (let attempt = 0; attempt < MAX_FIELD_ATTEMPTS && alive.current; attempt++) {
        const question = text(key, vars);
        const heard = await ask(attempt ? `${text("again")} ${question}` : question, lang.current);
        if (!heard || !alive.current) continue;
        const value = await extractField(kind, heard.text, question, options);
        if (value !== null && (!accept || accept(value))) return value;
      }
      if (alive.current) await say(text("typeIt"), lang.current);
      stopped.current = true;
      return null;
    };

    /** A name has to contain a letter and be more than a grunt. */
    const isName = (v: string | number | boolean) => {
      const s = String(v).trim();
      return s.length >= 2 && /\p{L}/u.test(s);
    };
    /** A spoken choice must be one of the options we offered, not a near-miss. */
    const oneOf = (list: readonly string[]) => (v: string | number | boolean) =>
      list.includes(String(v));

    (async () => {
      const set = props.current;
      if (p.step === 0) {
        await say(Q.hello.hi, "hi");
        await say(Q.hello.en, "en");
        // The first answer also settles the language: whatever they answer in, the app speaks.
        const first = await ask(`${Q.name.hi} ${Q.name.en}`, "hi");
        if (!alive.current) return;
        if (first?.locale === "en") lang.current = "en";
        setLocale(lang.current);
        const name = first ? await extractField("name", first.text, Q.name.en) : null;
        const finalName =
          name !== null && isName(name) ? name : await field("name", "name", undefined, undefined, isName);
        if (finalName === null) return;
        set.setProfile({ name: String(finalName) });

        // The mobile number is NOT asked by voice, on purpose: typing ten digits
        // is faster and surer than dictating them, and a misheard digit in a
        // phone number is the worst kind of wrong (it is both the login and the
        // one field a farmer can check at a glance). It is left blank here for
        // the keyboard, like the email below.

        // The email is never asked for and never spoken: it is the address
        // this account was created with, filled in by the screen before the
        // interview starts. Asking a farmer to dictate an email they already
        // typed is both a second chance to get it wrong and the one field
        // where a mishearing would lock them out of their own account.

        for (let attempt = 0; attempt < 2; attempt++) {
          const place = await field("place", "place");
          if (place === null) return;
          const loc = await geocode(String(place));
          if (!alive.current) return;
          if (!loc) continue;
          const short = (loc.address ?? String(place)).split(",").slice(0, 3).join(",");
          const ok = await field("placeOk", "yesno", { place: short });
          if (ok === null) return;
          if (ok) {
            set.setProfile({ location: loc });
            setAnswered(0);
            return;
          }
        }
        await say(text("tapMap"), lang.current);
        return;
      }

      // The plan step has no questions: it is a choice with prices on it,
      // and reading three tiers aloud is worse than showing them.
      if (p.step === 1) return;

      if (p.step === 2) {
        const area = await field("area", "number", undefined, undefined, (v) => validateArea(String(v), "Area") === null);
        if (area === null) return;
        // The total is the sum of the plots now, so there is nothing separate
        // to set — writing the farm's own area is what moves both figures.
        set.updateFarm(0, { area: String(area) });
        const soil = await field("soil", "choice", undefined, SOIL_TYPES, oneOf(SOIL_TYPES));
        if (soil === null) return;
        set.updateFarm(0, { soilType: String(soil) });
        /*
          Three questions where there used to be one. The method is the half
          that sets application efficiency, and asking for both at once meant
          the farmer answered with whichever came to mind and the other was
          lost. Rain-fed farms skip the follow-ups: they have no source and no
          method, and recording one would be a contradiction.
        */
        const regime = await field("water", "choice", undefined, [...WATER_REGIMES], oneOf(WATER_REGIMES));
        if (regime === null) return;
        set.updateFarm(0, { regime: regime as WaterRegime });

        if (regime === "irrigated") {
          const source = await field("waterSource", "choice", undefined, [...IRRIGATION_SOURCES], oneOf(IRRIGATION_SOURCES));
          if (source === null) return;
          set.updateFarm(0, { source: source as IrrigationSource });

          const method = await field("waterMethod", "choice", undefined, [...IRRIGATION_METHODS], oneOf(IRRIGATION_METHODS));
          if (method === null) return;
          set.updateFarm(0, { method: method as IrrigationMethod });
        }
        await say(text("findingCrops"), lang.current);
        setAnswered(2);
        return;
      }

      const top = set.recs?.[0]?.[0]?.cropName;
      if (top) {
        const keep = await field("crop", "yesno", { crop: top });
        if (keep === null) return;
        if (!keep) {
          const crop = await field("cropName", "name", undefined, undefined, isName);
          if (crop === null) return;
          set.updateSelection(0, { customCrop: String(crop) });
        }
      }
      const sown = await field("sown", "date");
      if (sown === null) return;
      set.updateSelection(0, { seedingDate: String(sown) });
      const agree = await field("terms", "yesno");
      if (agree === null) return;
      if (!agree) {
        stopped.current = true;
        await say(text("termsNeeded"), lang.current);
        return;
      }
      set.setTermsAccepted(true);
      setAnswered(3);
    })().catch((e) => console.error("VOICE ONBOARDING failed:", e));
  }, [p.step, p.recs, ask, say, setLocale]);

  return answered;
}
