import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Select, Text } from "@mattbutlerengineering/rialto";
import styles from "./MenuEditor.module.css";

type QrFormat = "png" | "svg";

const SIZES = ["256", "512", "1024"] as const;
const QUIET_ZONE_MODULES = 2;

interface MenuQrDownloadProps {
  /** Absolute public URL of the menu, `/menu/:venueSlug/:menuSlug`. */
  url: string;
  /** Guests can only open Active menus; anything else shows a hint. */
  active: boolean;
  menuSlug: string;
}

function save(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function MenuQrDownload({ url, active, menuSlug }: MenuQrDownloadProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<QrFormat>("png");
  const [size, setSize] = useState<(typeof SIZES)[number]>("512");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      // Lazy: keeps the generator out of the main entry chunk.
      const { default: QRCode } = await import("qrcode");
      const width = Number(size);
      const filename = `${menuSlug}-qr-${size}.${format}`;
      if (format === "png") {
        save(await QRCode.toDataURL(url, { width, margin: QUIET_ZONE_MODULES }), filename);
      } else {
        const svg = await QRCode.toString(url, {
          type: "svg",
          width,
          margin: QUIET_ZONE_MODULES,
        });
        const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        save(blobUrl, filename);
        URL.revokeObjectURL(blobUrl);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-label={t("menus.qr.title")}>
      <Text as="h2" variant="label">
        {t("menus.qr.title")}
      </Text>
      {!active && (
        <Text variant="body" color="secondary">
          {t("menus.qr.draftHint")}
        </Text>
      )}
      <Select
        label={t("menus.qr.format")}
        value={format}
        options={[
          { value: "png", label: "PNG" },
          { value: "svg", label: "SVG" },
        ]}
        onChange={(value) => setFormat(value as QrFormat)}
      />
      <Select
        label={t("menus.qr.size")}
        value={size}
        options={SIZES.map((value) => ({ value, label: t("menus.qr.pixels", { size: value }) }))}
        onChange={(value) => setSize(value as (typeof SIZES)[number])}
      />
      <div>
        <Button variant="primary" onClick={() => void download()} disabled={busy}>
          {t("menus.qr.download")}
        </Button>
      </div>
    </section>
  );
}
