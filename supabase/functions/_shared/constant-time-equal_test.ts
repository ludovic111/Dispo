import { constantTimeEqual } from "./constant-time-equal.ts";

Deno.test("constantTimeEqual only accepts identical strings", () => {
  if (!constantTimeEqual("secret", "secret")) throw new Error("equal rejected");
  if (constantTimeEqual("secret", "secreT")) throw new Error("case ignored");
  if (constantTimeEqual("secret", "secret ")) throw new Error("length ignored");
  if (constantTimeEqual("", "x")) throw new Error("empty matched");
  if (!constantTimeEqual("", "")) throw new Error("empty pair rejected");
});
