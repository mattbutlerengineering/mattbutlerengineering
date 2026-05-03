const tailwindPatterns = /\b(flex|grid|mt-|p-|text-|bg-|w-|h-|absolute|relative|z-|rounded)\b/;

export default {
  rules: {
    "no-tailwind-classes": {
      meta: {
        type: "problem",
        docs: {
          description: "Prohibit Tailwind CSS utility classes in favor of Rialto CSS Modules",
        },
        schema: [],
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name.name === "className" && node.value && node.value.type === "Literal") {
              if (tailwindPatterns.test(node.value.value)) {
                context.report({
                  node,
                  message:
                    "Tailwind utility classes are prohibited. Use @mattbutlerengineering/rialto components or CSS Modules. See ADR-001.",
                });
              }
            }
          },
        };
      },
    },
    "require-rfc-7807-errors": {
      meta: {
        type: "problem",
        docs: {
          description: "Require RFC 7807 (Problem Details) structure for API error responses",
        },
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            // Check for reply.code(4xx/5xx).send(...) or res.status(...).json(...)
            const isErrorStatus = (statusNode) => {
              if (statusNode.type === "Literal" && typeof statusNode.value === "number") {
                return statusNode.value >= 400;
              }
              return false;
            };

            // Simplified detection for this first iteration
            const callee = node.callee;
            if (
              callee.type === "MemberExpression" &&
              (callee.property.name === "send" || callee.property.name === "json")
            ) {
              const parent = callee.object;
              if (
                parent.type === "CallExpression" &&
                (parent.callee.property?.name === "code" ||
                  parent.callee.property?.name === "status")
              ) {
                if (isErrorStatus(parent.arguments[0])) {
                  const payload = node.arguments[0];
                  if (payload && payload.type === "ObjectExpression") {
                    const keys = payload.properties.map((p) => p.key?.name);
                    const required = ["type", "title", "status", "detail"];
                    const missing = required.filter((k) => !keys.includes(k));
                    if (missing.length > 0) {
                      context.report({
                        node: payload,
                        message: `Error response is missing RFC 7807 fields: ${missing.join(", ")}`,
                      });
                    }
                  }
                }
              }
            }
          },
        };
      },
    },
    "prefer-rialto-components": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "Encourage use of @mattbutlerengineering/rialto components over native HTML elements",
        },
        fixable: "code",
        schema: [],
      },
      create(context) {
        // Skip Rialto package itself to avoid circularity
        if (context.filename.includes("packages/rialto")) {
          return {};
        }

        const MAPPING = {
          button: "Button",
          input: "Input",
          textarea: "TextArea",
          table: "Table",
          h1: "Heading",
          h2: "Heading",
          h3: "Heading",
          h4: "Heading",
          h5: "Heading",
          h6: "Heading",
          span: "Text",
          p: "Text",
        };

        return {
          JSXOpeningElement(node) {
            if (node.name.type !== "JSXIdentifier") return;
            const name = node.name.name;
            const rialtoName = MAPPING[name];

            if (rialtoName) {
              context.report({
                node,
                message: `<${name}> is prohibited. Use <${rialtoName}> from @mattbutlerengineering/rialto instead.`,
                fix(fixer) {
                  // Only auto-fix simple identifiers (not components with namespaced names or members)
                  if (node.name.type === "JSXIdentifier") {
                    return [
                      fixer.replaceText(node.name, rialtoName),
                      // Note: closing tag fix is handled by the JSXClosingElement visitor
                    ];
                  }
                  return null;
                },
              });
            }
          },
          JSXClosingElement(node) {
            if (node.name.type !== "JSXIdentifier") return;
            const name = node.name.name;
            const rialtoName = MAPPING[name];

            if (rialtoName) {
              context.report({
                node,
                message: `</${name}> is prohibited. Use </${rialtoName}> from @mattbutlerengineering/rialto instead.`,
                fix(fixer) {
                  return fixer.replaceText(node.name, rialtoName);
                },
              });
            }
          },
        };
      },
    },
  },
};
