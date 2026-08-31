import { resolveSupabaseRuntimeKeys } from "./runtime_keys.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("préfère les dictionnaires runtime sans exposer les valeurs", () => {
  const keys = resolveSupabaseRuntimeKeys({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "new-admin" }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "new-public" }),
    SUPABASE_SERVICE_ROLE_KEY: "legacy-admin",
    SUPABASE_ANON_KEY: "legacy-public",
  });
  assert(keys.adminKey === "new-admin", "la clé secret runtime doit gagner");
  assert(keys.authKey === "new-public", "la clé publique runtime doit gagner");
});

Deno.test("garde la compatibilité avec les variables historiques", () => {
  const keys = resolveSupabaseRuntimeKeys({
    SUPABASE_SECRET_KEYS: "invalid-json",
    SUPABASE_SERVICE_ROLE_KEY: "legacy-admin",
    SUPABASE_ANON_KEY: "legacy-public",
  });
  assert(keys.adminKey === "legacy-admin", "repli service role");
  assert(keys.authKey === "legacy-public", "repli anon");
});
