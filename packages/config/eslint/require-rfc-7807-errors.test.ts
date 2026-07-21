import { RuleTester } from "eslint";
import localRules from "./local-rules.js";

const rule = localRules.rules["require-rfc-7807-errors"];

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const missingMessage = (...fields: string[]) =>
  `Error response is missing RFC 7807 fields: ${fields.join(", ")}`;

ruleTester.run("require-rfc-7807-errors", rule, {
  valid: [
    // Not a MemberExpression callee at all — nothing to inspect.
    {
      code: 'doSomething("ok");',
    },
    // MemberExpression callee, but the method is neither `send` nor `json`.
    {
      code: "reply.code(500).end();",
    },
    // `send`/`json` called directly on a non-call object (no `.code()`/
    // `.status()` in the chain) — `callee.object` is an Identifier, not a
    // CallExpression, so the rule never inspects the status.
    {
      code: 'res.json({ message: "oops" });',
    },
    // Chained through a call, but not `.code()`/`.status()` — the optional
    // chain `parent.callee.property?.name` evaluates to a name that isn't
    // in the allow-list.
    {
      code: 'reply.header("x-request-id", "abc").send({ message: "oops" });',
    },
    // Chained through a call whose own callee is an Identifier (not a
    // MemberExpression), so `parent.callee.property` is undefined and the
    // optional chain short-circuits to undefined.
    {
      code: 'factory(500).send({ message: "oops" });',
    },
    // Status argument isn't a numeric Literal — `isErrorStatus` returns
    // false for any non-literal (e.g. a variable) status.
    {
      code: 'reply.code(statusCode).send({ message: "oops" });',
    },
    // Numeric status below the error threshold (< 400) — success codes are
    // exempt even with a non-conformant payload.
    {
      code: 'reply.code(200).send({ message: "ok" });',
    },
    // Error status but no payload argument at all — `payload` is
    // `undefined`, so the `payload &&` guard short-circuits.
    {
      code: "reply.code(500).send();",
    },
    // Error status with a non-object payload (string) — `payload.type` is
    // not `ObjectExpression`.
    {
      code: 'reply.code(500).send("Internal Server Error");',
    },
    // Error status with an object payload containing all four required
    // RFC 7807 fields via `.code()`.
    {
      code: 'reply.code(404).send({ type: "not-found", title: "Not Found", status: 404, detail: "no such resource" });',
    },
    // Same, but chained via Express-style `.status()` and with extra,
    // non-required fields present — extras don't trigger a report.
    {
      code: 'res.status(500).json({ type: "internal", title: "Internal Error", status: 500, detail: "boom", instance: "/api/x" });',
    },
    // String-literal keys (`"type": "x"`) are a Literal key node with a
    // `.value`, not a `.name`. All four required fields are present here
    // using quoted keys, so no report.
    {
      code: 'reply.code(500).send({ "type": "x", "title": "y", "status": 500, "detail": "z" });',
    },
    // Spread properties (`...base`) have no `.key`, so we can't statically
    // prove what fields the spread source supplies. The rule skips the
    // required-field check entirely when a spread is present rather than
    // false-positive on fields it can't see.
    {
      code: 'reply.code(500).send({ ...base, status: 500, detail: "z" });',
    },
  ],
  invalid: [
    // Missing all four required fields.
    {
      code: 'reply.code(500).send({ message: "oops" });',
      errors: [{ message: missingMessage("type", "title", "status", "detail") }],
    },
    // Missing a single field (`detail`) via `.status()`/`.json()`.
    {
      code: 'res.status(400).json({ type: "bad-request", title: "Bad Request", status: 400 });',
      errors: [{ message: missingMessage("detail") }],
    },
    // Missing two fields, order of the report follows the required-field
    // declaration order, not the payload's key order.
    {
      code: 'reply.code(422).send({ detail: "invalid", type: "validation-error" });',
      errors: [{ message: missingMessage("title", "status") }],
    },
    // Boundary: exactly 400 counts as an error status.
    {
      code: 'reply.code(400).send({ message: "bad" });',
      errors: [{ message: missingMessage("type", "title", "status", "detail") }],
    },
  ],
});
