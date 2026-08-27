import { resolveSupabaseRuntimeKeys } from "./runtime_keys.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("les dictionnaires runtime fournissent leurs cles default", () => {
  const keys = resolveSupabaseRuntimeKeys({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "secret-dictionary" }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
      default: "publishable-dictionary",
    }),
    SUPABASE_SERVICE_ROLE_KEY: "legacy-admin",
    SUPABASE_ANON_KEY: "legacy-auth",
  });

  assert(keys.adminKey === "secret-dictionary", "la cle admin runtime prime");
  assert(
    keys.authKey === "publishable-dictionary",
    "la cle publique runtime prime",
  );
});

Deno.test("les variables singulieres assurent les replis runtime et legacy", () => {
  const legacy = resolveSupabaseRuntimeKeys({
    SUPABASE_SECRET_KEYS: "JSON invalide",
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 42 }),
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_SECRET_KEY: "secret-fallback",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_PUBLISHABLE_KEY: "publishable-fallback",
  });
  assert(legacy.adminKey === "service-role", "service_role reste prioritaire");
  assert(legacy.authKey === "anon-key", "anon reste prioritaire");

  const modern = resolveSupabaseRuntimeKeys({
    SUPABASE_SECRET_KEY: "secret-fallback",
    SUPABASE_PUBLISHABLE_KEY: "publishable-fallback",
  });
  assert(
    modern.adminKey === "secret-fallback",
    "le secret moderne est accepte",
  );
  assert(
    modern.authKey === "publishable-fallback",
    "la cle publiable moderne est acceptee",
  );
});

Deno.test("une configuration vide ou mal formee echoue fermee", () => {
  const keys = resolveSupabaseRuntimeKeys({
    SUPABASE_SECRET_KEYS: "[]",
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "   " }),
  });
  assert(keys.adminKey === null, "aucune fausse cle admin ne doit sortir");
  assert(keys.authKey === null, "aucune fausse cle auth ne doit sortir");
});
