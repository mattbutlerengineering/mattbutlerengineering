import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * Gradients, glow and atmosphere are allowed when they are built from rialto
 * tokens (ADR-033, `.claude/rules/ui-quality.md`
 * `agent-built/gradient-background`). What stays banned is a raw colour: every
 * colour stop in a `linear-gradient(`, `radial-gradient(` or `conic-gradient(`
 * (and their `repeating-` forms) must be a `var(--rialto-*)` reference,
 * `transparent` or `currentColor`. A hex, a colour function (`rgb()`, `hsl()`,
 * …), a named colour or a non-rialto custom property fails.
 */
const GRADIENT_OPEN = /(?:linear|radial|conic)-gradient\(/g;
const RIALTO_TOKEN = /var\(\s*--rialto-[\w-]+\s*\)/g;
const ALLOWED_KEYWORD = /(?<![\w-])(?:transparent|currentcolor)(?![\w-])/gi;
const HEX = /#[0-9a-f]{3,8}\b/gi;
const COLOUR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const OTHER_VAR = /var\(/g;
const NAMED_COLOURS =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen";
const NAMED_COLOUR = new RegExp(
  `(?<![\\w-])(?:${NAMED_COLOURS.split(" ").join("|")})(?![\\w-])`,
  "gi"
);

/** The argument text of every gradient function in `css`, parentheses balanced. */
function gradientBodies(css: string): string[] {
  return [...css.matchAll(GRADIENT_OPEN)].map((open) => {
    const start = (open.index ?? 0) + open[0].length;
    let depth = 1;
    let end = start;
    while (end < css.length && depth > 0) {
      if (css[end] === "(") depth += 1;
      if (css[end] === ")") depth -= 1;
      end += 1;
    }
    return css.slice(start, end - 1);
  });
}

/** Every raw (non-token) colour used inside a gradient in `css`. Empty = passes. */
function rawGradientColours(css: string): string[] {
  return gradientBodies(css).flatMap((body) => {
    const rest = body.replace(RIALTO_TOKEN, "").replace(ALLOWED_KEYWORD, "");
    return [HEX, COLOUR_FUNCTION, OTHER_VAR, NAMED_COLOUR].flatMap((pattern) =>
      [...rest.matchAll(pattern)].map((match) => match[0])
    );
  });
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith(".css") ? [full] : [];
  });
}

describe("rawGradientColours", () => {
  it("passes a gradient whose every stop is a rialto token", () => {
    expect(
      rawGradientColours(
        "a { background: linear-gradient(to right, var(--rialto-surface) 0%, var(--rialto-accent-glow) 100%); }"
      )
    ).toEqual([]);
  });

  it("passes transparent, currentColor and color-mix over tokens", () => {
    expect(
      rawGradientColours(
        `a { background:
          radial-gradient(ellipse 600px 500px at 30% 20%, color-mix(in srgb, var(--rialto-accent) 7%, transparent) 0%, transparent 70%),
          conic-gradient(from 90deg, currentColor, var(--rialto-border)); }`
      )
    ).toEqual([]);
  });

  it("fails a hex stop", () => {
    expect(
      rawGradientColours("a { background: linear-gradient(#fff, var(--rialto-surface)); }")
    ).toEqual(["#fff"]);
  });

  it("fails rgb(), hsl() and named colours, in radial and conic gradients too", () => {
    expect(
      rawGradientColours("a { background: radial-gradient(rgb(0 0 0 / 0.4), transparent); }")
    ).toEqual(["rgb("]);
    expect(
      rawGradientColours("a { background: conic-gradient(hsl(40 60% 50%), purple); }")
    ).toEqual(["hsl(", "purple"]);
    expect(
      rawGradientColours(
        "a { background: repeating-linear-gradient(45deg, white 0 4px, blue 4px 8px); }"
      )
    ).toEqual(["white", "blue"]);
  });

  it("fails a non-rialto custom property and a token with a raw fallback", () => {
    expect(
      rawGradientColours("a { background: linear-gradient(var(--brand), transparent); }")
    ).toEqual(["var("]);
    expect(
      rawGradientColours(
        "a { background: linear-gradient(var(--rialto-accent, #c4922a), transparent); }"
      )
    ).toEqual(["#c4922a", "var("]);
  });

  it("ignores raw colours outside a gradient (other guards own those)", () => {
    expect(rawGradientColours("a { color: #fff; background: var(--rialto-surface); }")).toEqual([]);
  });
});

describe("hospitality CSS", () => {
  it("builds every gradient from rialto tokens, never a raw colour", () => {
    const offenders = cssFiles(SRC)
      .map((file) => ({
        file: relative(SRC, file),
        raw: rawGradientColours(readFileSync(file, "utf8")),
      }))
      .filter(({ raw }) => raw.length > 0);
    expect(offenders).toEqual([]);
  });
});
