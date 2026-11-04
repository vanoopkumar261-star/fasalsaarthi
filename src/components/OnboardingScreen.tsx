import { colors as themeColors } from "@/theme/colors";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/constants/colors";
import { cardShadow, topEdgeShadow } from "@/constants/effects";
import { locationLabel } from "@/lib/geocode";
import {
  createCropCycles,
  createFarmerProfile,
  createFarms,
  effectiveCrop,
  farmIrrigationLabel,
  fetchRecommendations,
  makeFarm,
  makeSelection,
  todayISO,
  type CropRec,
  type CropSelection,
  type FarmDraft,
} from "@/lib/onboarding";
import { fieldLimit, PLANS, type Cycle, type PlanId } from "@/lib/plans";
import { suggestHarvestDate } from "@/lib/agronomy";
import { supabase } from "@/lib/supabase";
import {
  normalizeEmail,
  normalizePhone,
  validateArea,
  validateEmail,
  validatePhone,
} from "@/lib/validation";
import { useT } from "./i18n/LanguageProvider";
import { StepCrops } from "./onboarding/StepCrops";
import { StepFarms, MAX_FARMS } from "./onboarding/StepFarms";
import { StepPlan } from "./onboarding/StepPlan";
import { StepProfile, type ProfileDraft } from "./onboarding/StepProfile";
import { useVoiceInterview } from "./onboarding/useVoiceInterview";
import { themed } from "@/theme";

const STEPS = ["Profile", "Plan", "Farms", "Crops"] as const;
type Step = 0 | 1 | 2 | 3;

/**
 * Farm registration on the phone — the same four steps, the same fields and
 * the same three table writes as the web app's /onboarding page, so a farmer
 * can register from either surface and land with an identical profile.
 *
 * The plan is asked before any field exists, so the field counter on the next
 * step can be capped at what the farmer just chose rather than letting them
 * enter five plots and then telling them their tier allows two.
 *
 * Registration is gated behind an account (AppShell only renders this for a
 * signed-in session with no farmer profile yet), so there is no auth step here
 * the way there is on the web page.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  // PLANS carries i18n keys, not literals, so the tier name needs resolving.
  const { t } = useT();
  const [step, setStep] = useState<Step>(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileDraft>({
    name: "",
    phone: "",
    email: "",
    location: undefined,
  });
  const [plan, setPlan] = useState<PlanId>("free");
  const [planCycle, setPlanCycle] = useState<Cycle>("annual");
  const [farms, setFarms] = useState<FarmDraft[]>([makeFarm()]);
  const [selections, setSelections] = useState<CropSelection[]>([makeSelection()]);
  const [recs, setRecs] = useState<CropRec[][] | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  /**
   * The email comes from the account, not from the farmer a second time.
   *
   * Registration only ever runs for a signed-in session (the gate in
   * app/index.tsx guarantees it), so the address is already known and already
   * verified by the act of signing in. Asking for it again was asking the same
   * question twice, and it was the one field where a typo or a mishearing
   * puts a farmer's record under an address they cannot receive mail at.
   *
   * It stays editable: a farmer who signed up with a relative's address should
   * be able to correct it. Only the blank is filled, so this can never
   * overwrite something they have typed.
   */
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const address = data.user?.email;
        if (!alive || !address) return;
        setProfile((p) => (p.email ? p : { ...p, email: address }));
      })
      .catch(() => {
        // Offline, or the session is mid-refresh. The field stays empty and
        // the farmer can type it — never a blocker.
      });
    return () => {
      alive = false;
    };
  }, []);

  const markTouched = (key: string) => setTouched((t) => ({ ...t, [key]: true }));
  const shown = (key: string, error: string | null) => (touched[key] ? error : null);

  const nameError = profile.name.trim() ? null : "Name is required.";
  const phoneError = validatePhone(profile.phone);
  const emailError = validateEmail(profile.email);
  const farmAreaErrors = farms.map((f) => validateArea(f.area, "Area"));

  /**
   * What the chosen tier allows, never more than the registration ceiling.
   * Elite permits twenty fields; nobody types twenty into a phone at once and
   * "+ Add farm" covers the rest.
   */
  const farmCap = Math.min(fieldLimit(plan), MAX_FARMS);

  const canLeaveProfile = Boolean(
    profile.name.trim() && !phoneError && !emailError && profile.location
  );

  /**
   * A farm is answered when it has a soil type and a water regime — and, if it
   * is irrigated, both halves of the irrigation question. The method is what
   * sets application efficiency, so "irrigated, somehow" is not an answer the
   * water balance can use.
   */
  const canLeaveFarms =
    farmAreaErrors.every((e) => !e) &&
    farms.every(
      (f) =>
        f.soilType &&
        f.regime &&
        (f.regime === "rainfed" || (f.source && f.method))
    );

  const canFinish = useMemo(() => {
    if (!recs || !termsAccepted) return false;
    return selections.slice(0, farms.length).every((sel) => {
      if (!sel || !effectiveCrop(sel) || !sel.seedingDate) return false;
      if (sel.estimatedHarvestDate && sel.estimatedHarvestDate <= sel.seedingDate) return false;
      return true;
    });
  }, [recs, termsAccepted, selections, farms.length]);

  function setNumFarms(n: number) {
    const next = Math.max(1, Math.min(farmCap, n));
    setFarms((prev) => {
      const copy = [...prev];
      while (copy.length < next) copy.push(makeFarm());
      while (copy.length > next) copy.pop();
      return copy;
    });
    setSelections((prev) => {
      const copy = [...prev];
      while (copy.length < next) copy.push(makeSelection());
      while (copy.length > next) copy.pop();
      return copy;
    });
  }

  function updateFarm(index: number, patch: Partial<FarmDraft>) {
    setFarms((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  /**
   * Re-suggests the harvest date whenever the crop or seeding date moves —
   * unless the farmer has set the harvest date themselves, in which case their
   * value stands. Same rule as the web form.
   */
  function updateSelection(index: number, patch: Partial<CropSelection>) {
    setSelections((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const next = { ...s, ...patch };
        if (patch.estimatedHarvestDate !== undefined) next.harvestTouched = true;

        const cropOrDateMoved =
          patch.chosenCrop !== undefined ||
          patch.customCrop !== undefined ||
          patch.seedingDate !== undefined;

        if (cropOrDateMoved && !next.harvestTouched) {
          next.estimatedHarvestDate = suggestHarvestDate(effectiveCrop(next), next.seedingDate);
        }
        return next;
      })
    );
  }

  async function handleFetchRecommendations() {
    if (!profile.location) return;
    setLoadingAI(true);
    setFailure(null);
    setTermsAccepted(false);

    try {
      const result = await fetchRecommendations({
        locationAddress: locationLabel(profile.location),
        farms: farms.map((f) => ({
          area: Number(f.area),
          soilType: f.soilType,
          irrigation: farmIrrigationLabel(f),
        })),
      });

      setRecs(result);
      // Pre-select each farm's top recommendation and seed its harvest date
      // from that crop's cycle length; the farmer's own edits still win.
      setSelections((prev) =>
        prev.map((s, idx) => {
          const chosenCrop = result?.[idx]?.[0]?.cropName ?? s.chosenCrop;
          const seedingDate = s.seedingDate || todayISO();
          return {
            ...s,
            chosenCrop,
            customCrop: "",
            seedingDate,
            estimatedHarvestDate: s.harvestTouched
              ? s.estimatedHarvestDate
              : suggestHarvestDate(chosenCrop, seedingDate),
          };
        })
      );
      setStep(3);
    } catch (e: any) {
      setFailure(e?.message ?? "Could not reach the recommendation engine.");
    } finally {
      setLoadingAI(false);
    }
  }

  async function handleFinish() {
    setSubmitting(true);
    setFailure(null);

    try {
      const farmer = await createFarmerProfile({
        name: profile.name.trim(),
        // Stored as the bare ten digits, so "+91 98765 43210" and "9876543210"
        // end up as the same value on file.
        phone: normalizePhone(profile.phone),
        email: normalizeEmail(profile.email),
        location: profile.location,
        locationAddress: locationLabel(profile.location),
        plan,
        planCycle,
      });

      const inserted = await createFarms(farmer.id, farms);
      await createCropCycles(inserted, selections);
      onDone();
    } catch (e: any) {
      setFailure(e?.message ?? "Could not save your registration. Please try again.");
      setSubmitting(false);
    }
  }

  function goBack() {
    setFailure(null);
    setStep((s) => (s === 0 ? 0 : ((s - 1) as Step)));
  }

  const primary = (() => {
    if (step === 0) {
      return {
        label: "Continue",
        disabled: !canLeaveProfile,
        onPress: () => {
          ["name", "phone", "email"].forEach(markTouched);
          if (canLeaveProfile) setStep(1);
        },
      };
    }
    if (step === 1) {
      return {
        label: `Continue with ${t(PLANS[plan].nameKey)}`,
        disabled: false,
        onPress: () => setStep(2),
      };
    }
    if (step === 2) {
      return {
        label: loadingAI ? "Finding crops…" : "Get crop suggestions",
        disabled: !canLeaveFarms || loadingAI,
        onPress: () => {
          farms.forEach((_, i) => markTouched(`farm-${i}-area`));
          if (canLeaveFarms) handleFetchRecommendations();
        },
      };
    }
    return {
      label: submitting ? "Saving…" : "Finish registration",
      disabled: !canFinish || submitting,
      onPress: handleFinish,
    };
  })();

  // Voice first: the assistant asks each question aloud and fills the form;
  // once a step is fully answered it presses Continue, same checks as a tap.
  const answered = useVoiceInterview({
    step,
    recs,
    email: profile.email,
    setProfile: (patch) => setProfile((p) => ({ ...p, ...patch })),
    updateFarm,
    updateSelection,
    setTermsAccepted,
  });
  useEffect(() => {
    if (answered === step && !primary.disabled) primary.onPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, primary.disabled]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          {step > 0 ? (
            <Pressable style={styles.back} onPress={goBack} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
        </View>

        <View style={styles.stepper}>
          {STEPS.map((label, i) => (
            // The connector is a sibling of the step, not a child of it: only
            // then can it flex, and absorb whatever width the four steps leave.
            <Fragment key={label}>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepDot,
                    i === step && styles.stepDotActive,
                    i < step && styles.stepDotDone,
                  ]}
                >
                  {i < step ? (
                    <Ionicons name="checkmark" size={13} color={themeColors.onPrimary} />
                  ) : (
                    <Text style={[styles.stepNum, i === step && styles.stepNumActive]}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.stepLabel, i === step && styles.stepLabelActive]}
                >
                  {label}
                </Text>
              </View>
              {i < STEPS.length - 1 && <View style={styles.stepLine} />}
            </Fragment>
          ))}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.kicker}>REGISTRATION</Text>
          <Text style={styles.title}>
            {step === 0
              ? "About you"
              : step === 1
              ? "Choose your plan"
              : step === 2
              ? "Your land"
              : "Choose what to grow"}
          </Text>
          <Text style={styles.sub}>
            {step === 0
              ? "We need a way to reach you and where your farm sits."
              : step === 1
              ? "Start free and change it whenever you like — nothing is charged today."
              : step === 2
              ? "Tell us how your land is split, and what each plot is like."
              : "Suggestions are matched to your soil, water and location."}
          </Text>

          {step === 0 && (
            <StepProfile
              value={profile}
              onChange={(patch) => setProfile((p) => ({ ...p, ...patch }))}
              onBlurField={markTouched}
              errors={{
                name: shown("name", nameError),
                phone: shown("phone", phoneError),
                email: shown("email", emailError),
              }}
            />
          )}

          {step === 1 && (
            <StepPlan
              plan={plan}
              cycle={planCycle}
              onCycleChange={setPlanCycle}
              onChoose={(nextPlan, nextCycle) => {
                setPlan(nextPlan);
                setPlanCycle(nextCycle);
                // Dropping to a smaller tier has to bring the field count with
                // it, or the farmer arrives at the next step already over a
                // limit they have just agreed to.
                const cap = Math.min(fieldLimit(nextPlan), MAX_FARMS);
                if (farms.length > cap) setNumFarms(cap);
              }}
            />
          )}

          {step === 2 && (
            <StepFarms
              maxFarms={farmCap}
              farms={farms}
              farmAreaErrors={farms.map((_, i) => shown(`farm-${i}-area`, farmAreaErrors[i]))}
              onNumFarmsChange={setNumFarms}
              onFarmChange={updateFarm}
              onBlurField={markTouched}
            />
          )}

          {step === 3 && recs && (
            <StepCrops
              farms={farms}
              recs={recs}
              selections={selections}
              onSelectionChange={updateSelection}
              termsAccepted={termsAccepted}
              onTermsChange={setTermsAccepted}
            />
          )}

          {failure && (
            <View style={[styles.failure, cardShadow]}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.failureText}>{failure}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, topEdgeShadow]}>
          <Pressable
            style={[styles.cta, primary.disabled && styles.ctaOff]}
            onPress={primary.onPress}
            disabled={primary.disabled}
          >
            {loadingAI || submitting ? (
              <ActivityIndicator color={themeColors.onPrimary} />
            ) : (
              <Text style={styles.ctaText}>{primary.label}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, height: 36, justifyContent: "center" },
  back: { flexDirection: "row", alignItems: "center", gap: 2, height: 28 },
  backText: { fontSize: 15, fontWeight: "700", color: colors.primary },

  /*
    Four steps, not three. The old fixed widths fitted "Profile · Farms ·
    Crops" and overflowed the moment "Plan" joined them — the last label ran
    past its padding and sat against the screen edge, and a farmer with large
    system text lost it off-screen entirely. The row now shares out whatever
    space there is: the connectors flex, and the labels shrink before the row
    can overflow.
  */
  stepper: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 14,
    alignItems: "center",
  },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.sageLine,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { borderColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum: { fontSize: 12, fontWeight: "800", color: colors.textFaint },
  stepNumActive: { color: colors.primary },
  stepLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, flexShrink: 1 },
  stepLabelActive: { color: colors.ink },
  stepLine: {
    // flex, so three connectors absorb the slack instead of three fixed 38pt
    // blocks pushing the fourth step off the end.
    flex: 1,
    minWidth: 6,
    height: 1.5,
    backgroundColor: colors.sageLine,
    marginHorizontal: 5,
  },

  body: { paddingHorizontal: 20, paddingBottom: 32 },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: colors.leaf,
    marginBottom: 4,
  },
  title: { fontSize: 28, fontWeight: "800", color: colors.ink, marginBottom: 4 },
  sub: { fontSize: 15, color: colors.textFaint, marginBottom: 22, lineHeight: 20 },

  failure: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: colors.dangerBg,
    borderRadius: 16,
    padding: 14,
    marginTop: 18,
  },
  failureText: { flex: 1, fontSize: 13, color: colors.danger, lineHeight: 19 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
    backgroundColor: colors.surface,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: themeColors.onPrimary, fontSize: 16, fontWeight: "800" },
}));
