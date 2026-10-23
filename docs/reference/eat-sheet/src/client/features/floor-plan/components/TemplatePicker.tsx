import { useCallback, useState } from "react";
import { TEMPLATES, TEMPLATE_SIZES, type FloorPlanTemplate } from "../templates";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--rialto-surface, #1e1c1a)",
  border: "1px solid var(--rialto-border, rgba(255,255,255,0.1))",
  borderRadius: "var(--rialto-radius-soft, 12px)",
  padding: "var(--rialto-space-3xl, 32px)",
  width: 700,
  maxHeight: "80vh",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "var(--rialto-space-xl, 20px)",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--rialto-font-display, system-ui)",
  fontSize: "var(--rialto-text-xl, 22px)",
  fontWeight: 300,
  color: "var(--rialto-text-primary, #e8e2d8)",
  letterSpacing: "-0.01em",
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: "var(--rialto-font-sans, system-ui)",
  fontSize: "var(--rialto-text-xs, 12px)",
  color: "var(--rialto-text-tertiary, rgba(232,226,216,0.4))",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "var(--rialto-space-md, 12px)",
};

const sizeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--rialto-space-sm, 8px)",
  alignItems: "center",
};

const sizeLabelStyle: React.CSSProperties = {
  fontFamily: "var(--rialto-font-sans, system-ui)",
  fontSize: "var(--rialto-text-xs, 11px)",
  color: "var(--rialto-text-tertiary, rgba(232,226,216,0.4))",
  textTransform: "uppercase" as const,
  letterSpacing: "var(--rialto-tracking-wide, 0.12em)",
};

const ICON_MAP: Record<string, React.ReactNode> = {
  blank: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="24" height="24" rx="2" stroke="rgba(232,226,216,0.2)" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  ),
  "fine-dining": (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="10" cy="12" r="4" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <circle cx="22" cy="12" r="4" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <circle cx="10" cy="24" r="4" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <circle cx="22" cy="24" r="4" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
    </svg>
  ),
  casual: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="6" width="8" height="8" rx="1" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <rect x="16" y="6" width="12" height="8" rx="1" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <rect x="4" y="18" width="12" height="8" rx="1" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <rect x="20" y="18" width="8" height="8" rx="1" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
    </svg>
  ),
  bar: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <line x1="6" y1="10" x2="26" y2="10" stroke="rgba(232,226,216,0.35)" strokeWidth="2.5" />
      <circle cx="8" cy="20" r="3" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <circle cx="16" cy="20" r="3" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <circle cx="24" cy="20" r="3" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
    </svg>
  ),
  cafe: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="8" cy="8" r="3" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <circle cx="8" cy="18" r="3" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <circle cx="8" cy="28" r="3" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <rect x="18" y="6" width="8" height="8" rx="1" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <rect x="18" y="18" width="8" height="8" rx="1" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
    </svg>
  ),
  banquet: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="6" width="16" height="6" rx="1" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <rect x="4" y="16" width="16" height="6" rx="1" stroke="rgba(232,226,216,0.3)" strokeWidth="1.2" />
      <circle cx="26" cy="10" r="4" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <circle cx="26" cy="22" r="4" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
    </svg>
  ),
  "open-kitchen": (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="14" height="10" rx="1" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
      <line x1="20" y1="18" x2="28" y2="18" stroke="rgba(232,226,216,0.35)" strokeWidth="2" />
      <rect x="20" y="20" width="8" height="8" rx="1" stroke="rgba(232,226,216,0.2)" strokeWidth="1.2" fill="rgba(224,112,80,0.1)" />
      <circle cx="8" cy="22" r="3" stroke="rgba(232,226,216,0.25)" strokeWidth="1.2" />
    </svg>
  ),
};


interface TemplateCardProps {
  readonly template: FloorPlanTemplate;
  readonly isSelected: boolean;
  readonly accentColor: string;
  readonly onClick: () => void;
}

function TemplateCard({ template, isSelected, accentColor, onClick }: TemplateCardProps) {
  const [hovered, setHovered] = useState(false);

  const style: React.CSSProperties = {
    padding: "var(--rialto-space-md, 16px)",
    borderRadius: "var(--rialto-radius-default, 8px)",
    border: `1.5px solid ${isSelected ? accentColor : hovered ? "rgba(232,226,216,0.15)" : "rgba(232,226,216,0.08)"}`,
    background: isSelected
      ? `${accentColor}12`
      : hovered
        ? "rgba(232,226,216,0.03)"
        : "transparent",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "var(--rialto-space-sm, 8px)",
    transition: "border-color 0.15s ease, background 0.15s ease",
    textAlign: "left",
  };

  return (
    <button
      type="button"
      style={style}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ opacity: isSelected ? 1 : 0.6 }}>
        {ICON_MAP[template.icon] ?? ICON_MAP["blank"]}
      </div>
      <div style={{
        fontFamily: "var(--rialto-font-sans, system-ui)",
        fontSize: "var(--rialto-text-sm, 13px)",
        fontWeight: 600,
        color: isSelected ? accentColor : "var(--rialto-text-primary, #e8e2d8)",
      }}>
        {template.name}
      </div>
      <div style={{
        fontFamily: "var(--rialto-font-sans, system-ui)",
        fontSize: "var(--rialto-text-xs, 11px)",
        color: "var(--rialto-text-tertiary, rgba(232,226,216,0.4))",
        lineHeight: 1.4,
      }}>
        {template.description}
      </div>
    </button>
  );
}

interface TemplatePickerProps {
  readonly accentColor: string;
  readonly onSelect: (template: FloorPlanTemplate, width: number, height: number) => void;
  readonly onClose: () => void;
}

export function TemplatePicker({ accentColor, onSelect, onClose }: TemplatePickerProps) {
  const [selectedIdx, setSelectedIdx] = useState(1); // Default to Fine Dining
  const [sizeIdx, setSizeIdx] = useState(1); // Default to Medium

  const handleCreate = useCallback(() => {
    const template = TEMPLATES[selectedIdx]!;
    const size = TEMPLATE_SIZES[sizeIdx]!;
    onSelect(template, size.width, size.height);
  }, [selectedIdx, sizeIdx, onSelect]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={dialogStyle} data-theme="dark">
        <div>
          <div style={titleStyle}>Choose a Template</div>
          <div style={subtitleStyle}>Start with a layout or customize from scratch</div>
        </div>

        <div style={gridStyle}>
          {TEMPLATES.map((t, i) => (
            <TemplateCard
              key={t.name}
              template={t}
              isSelected={selectedIdx === i}
              accentColor={accentColor}
              onClick={() => setSelectedIdx(i)}
            />
          ))}
        </div>

        <div>
          <div style={sizeLabelStyle}>Floor Plan Size</div>
          <div style={{ ...sizeRowStyle, marginTop: 8 }}>
            {TEMPLATE_SIZES.map((size, i) => {
              const active = sizeIdx === i;
              return (
                <button
                  key={size.label}
                  type="button"
                  onClick={() => setSizeIdx(i)}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    border: `1px solid ${active ? `${accentColor}55` : "rgba(232,226,216,0.08)"}`,
                    borderRadius: "var(--rialto-radius-sharp, 6px)",
                    background: active ? `${accentColor}15` : "transparent",
                    color: active ? accentColor : "var(--rialto-text-tertiary, rgba(232,226,216,0.4))",
                    fontFamily: "var(--rialto-font-sans, system-ui)",
                    fontSize: "var(--rialto-text-xs, 11px)",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                  }}
                >
                  <div>{size.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{size.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--rialto-space-sm, 8px)" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 20px",
              borderRadius: "var(--rialto-radius-sharp, 6px)",
              border: "1px solid var(--rialto-border, rgba(255,255,255,0.1))",
              background: "transparent",
              color: "var(--rialto-text-secondary, rgba(232,226,216,0.5))",
              fontFamily: "var(--rialto-font-sans, system-ui)",
              fontSize: "var(--rialto-text-xs, 12px)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            style={{
              padding: "8px 24px",
              borderRadius: "var(--rialto-radius-sharp, 6px)",
              border: "none",
              background: accentColor,
              color: "var(--rialto-text-on-accent, #1a1918)",
              fontFamily: "var(--rialto-font-sans, system-ui)",
              fontSize: "var(--rialto-text-xs, 12px)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create Floor Plan
          </button>
        </div>
      </div>
    </div>
  );
}
