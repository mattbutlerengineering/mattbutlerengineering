import { Text } from "../../components/Text/Text";
import { Button } from "../../components/Button/Button";
import { Badge } from "../../components/Badge/Badge";
import { Tag } from "../../components/Tag/Tag";
import { Avatar } from "../../components/Avatar/Avatar";
import { Divider } from "../../components/Divider/Divider";
import { Kbd } from "../../components/Kbd/Kbd";
import css from "../showcase.module.css";

const BUTTON_VARIANTS = ["primary", "secondary", "ghost"] as const;
const BUTTON_SIZES = ["sm", "md", "lg"] as const;
const BADGE_VARIANTS = ["neutral", "accent", "success", "warning", "error"] as const;

function Typography() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-sm)" }}>
      <Text variant="display">Display text</Text>
      <Text variant="body">Body text — the standard for readable paragraphs.</Text>
      <Text variant="label">Label text</Text>
      <Text variant="caption" color="secondary">
        Caption text (secondary)
      </Text>
      <Text variant="detail" color="tertiary">
        Detail text (tertiary)
      </Text>
      <Text variant="body" color="accent">
        Accent colored text
      </Text>
      <Text variant="body" color="error">
        Error colored text
      </Text>
      <Text variant="body" color="success">
        Success colored text
      </Text>
      <Text variant="body" mono>
        Monospace text
      </Text>
      <Divider />
      <div className={css.row}>
        <Kbd>Cmd</Kbd>
        <Kbd>K</Kbd>
        <Text variant="caption" color="secondary">
          Keyboard shortcut display
        </Text>
      </div>
    </div>
  );
}

function Buttons() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-lg)" }}>
      {BUTTON_VARIANTS.map((variant) => (
        <div key={variant}>
          <Text
            variant="caption"
            color="secondary"
            style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
          >
            {variant}
          </Text>
          <div className={css.row}>
            {BUTTON_SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {size.toUpperCase()} Button
              </Button>
            ))}
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} isLoading loadingText="Saving...">
              Loading
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Badges() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-lg)" }}>
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Badge variants
        </Text>
        <div className={css.row}>
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Badges with dot
        </Text>
        <div className={css.row}>
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v} dot>
              {v}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Small badges
        </Text>
        <div className={css.row}>
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v} size="sm">
              {v}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Tags
        </Text>
        <div className={css.row}>
          {BADGE_VARIANTS.map((v) => (
            <Tag key={v} variant={v}>
              {v}
            </Tag>
          ))}
          <Tag variant="neutral" removable onRemove={() => {}}>
            Removable
          </Tag>
        </div>
      </div>
    </div>
  );
}

function Avatars() {
  return (
    <div className={css.row}>
      <Avatar name="Matt Butler" />
      <Avatar name="Jane Doe" src="https://i.pravatar.cc/150?u=jane" />
      <Avatar name="AB" />
    </div>
  );
}

export function FoundationSection({
  which,
}: {
  which: "typography" | "buttons" | "badges" | "avatars";
}) {
  switch (which) {
    case "typography":
      return <Typography />;
    case "buttons":
      return <Buttons />;
    case "badges":
      return <Badges />;
    case "avatars":
      return <Avatars />;
  }
}
