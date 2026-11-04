import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { useT } from "../i18n/LanguageProvider";
import { useSession } from "../../lib/session";
import { hydrateAgentContext, setAgentLocale, setAgentScreen } from "../../lib/agent/context";

/**
 * Mounted once in the root layout, beneath LanguageProvider (it needs the
 * locale) and needs no visual output of its own — Phase 0 infrastructure
 * only. Keeps the agent's offline read cache (src/lib/agent/context.ts) in
 * sync with three things that change during a session: who is signed in,
 * which language they're using, and which screen they're on.
 *
 * Nothing here calls a model or executes a tool. That starts in Phase 2.
 */
export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { locale } = useT();
  const pathname = usePathname();
  const hydratedForUser = useRef<string | null>(null);

  useEffect(() => {
    setAgentLocale(locale);
  }, [locale]);

  useEffect(() => {
    setAgentScreen(pathname);
  }, [pathname]);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) return;
    // Re-hydrate once per sign-in (and whenever the locale changes, so a
    // switched language is reflected without a full re-fetch loop) rather
    // than on every render.
    if (hydratedForUser.current === userId) return;
    hydratedForUser.current = userId;
    hydrateAgentContext(locale).catch(() => {
      // hydrateAgentContext already falls back to its own AsyncStorage cache
      // on failure — nothing further to do here.
    });
  }, [session?.user?.id, locale]);

  return <>{children}</>;
}
