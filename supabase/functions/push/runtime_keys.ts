export type SupabaseRuntimeKeyEnvironment = {
  SUPABASE_SECRET_KEYS?: string;
  SUPABASE_PUBLISHABLE_KEYS?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

const nonEmpty = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const defaultDictionaryKey = (serialized: string | undefined) => {
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return nonEmpty((parsed as Record<string, unknown>).default);
  } catch {
    return null;
  }
};

/**
 * Prend en charge les dictionnaires du nouveau runtime Edge et les variables
 * singulieres historiques, sans jamais journaliser leurs valeurs.
 */
export const resolveSupabaseRuntimeKeys = (
  environment: SupabaseRuntimeKeyEnvironment,
) => ({
  adminKey: defaultDictionaryKey(environment.SUPABASE_SECRET_KEYS) ??
    nonEmpty(environment.SUPABASE_SERVICE_ROLE_KEY) ??
    nonEmpty(environment.SUPABASE_SECRET_KEY),
  authKey: defaultDictionaryKey(environment.SUPABASE_PUBLISHABLE_KEYS) ??
    nonEmpty(environment.SUPABASE_ANON_KEY) ??
    nonEmpty(environment.SUPABASE_PUBLISHABLE_KEY),
});
