import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Divider,
  Input,
  Select,
  Skeleton,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { AccessToken, MintedAccessToken } from "@mbe/types";
import {
  useAccessTokens,
  useMintAccessToken,
  useRevokeAccessToken,
} from "../../hooks/useAccessTokens.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import styles from "./AccessTokensCard.module.css";

const EXPIRY_DAYS = ["30", "90", "365", "never"] as const;
type ExpiryChoice = (typeof EXPIRY_DAYS)[number];

const CONFLICT_STATUS = 409;

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: number }).status
    : undefined;
}

interface TokenRowProps {
  readonly token: AccessToken;
  readonly onRevoke: (token: AccessToken) => void;
}

function TokenRow({ token, onRevoke }: TokenRowProps) {
  const { t } = useTranslation();
  const { formatInstant } = useVenueFormat();
  const date = (iso: string) => formatInstant(iso, { dateStyle: "medium" });

  return (
    <li className={styles.token} aria-label={token.name}>
      <div className={styles.tokenInfo}>
        <Text variant="body" color="primary">
          {token.name}
        </Text>
        <Text variant="caption" color="secondary">
          {t("settings.accessTokens.created", {
            prefix: token.prefix,
            date: date(token.createdAt),
          })}
        </Text>
        <Text variant="caption" color="secondary">
          {token.lastUsedAt
            ? t("settings.accessTokens.lastUsed", { date: date(token.lastUsedAt) })
            : t("settings.accessTokens.neverUsed")}
          {" · "}
          {token.expiresAt
            ? t("settings.accessTokens.expires", { date: date(token.expiresAt) })
            : t("settings.accessTokens.neverExpires")}
        </Text>
      </div>
      <Button
        variant="secondary"
        aria-label={t("settings.accessTokens.revokeNamed", { name: token.name })}
        onClick={() => onRevoke(token)}
      >
        {t("settings.accessTokens.revoke")}
      </Button>
    </li>
  );
}

interface MintedSecretProps {
  readonly minted: MintedAccessToken;
  readonly onDone: () => void;
}

/** The one place the plaintext is ever shown; it lives in this component's props only. */
function MintedSecret({ minted, onDone }: MintedSecretProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(minted.token);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className={styles.secret}>
      <Text variant="body" color="primary">
        {t("settings.accessTokens.mintedTitle", { name: minted.name })}
      </Text>
      <Input
        label={t("settings.accessTokens.tokenLabel")}
        value={minted.token}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      <Text variant="caption" color="secondary">
        {t("settings.accessTokens.shownOnce")}
      </Text>
      {copyFailed && <Alert variant="error">{t("settings.accessTokens.copyFailed")}</Alert>}
      <Stack gap="sm">
        <Button variant="secondary" onClick={() => void copy()}>
          {t("settings.accessTokens.copy")}
        </Button>
        <Button variant="primary" onClick={onDone}>
          {t("settings.accessTokens.done")}
        </Button>
      </Stack>
      <div role="status">{copied ? t("settings.accessTokens.copied") : null}</div>
    </div>
  );
}

/**
 * Settings → Connect an AI assistant (#9665): mint, list and revoke the
 * personal access tokens remote MCP clients use. Read-only, every venue the
 * user belongs to. The plaintext is shown once and kept out of query caches.
 */
export function AccessTokensCard() {
  const { t } = useTranslation();
  const { data: tokens, isLoading, error, refetch } = useAccessTokens();
  const mint = useMintAccessToken();
  const revoke = useRevokeAccessToken();

  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryChoice>("90");
  const [isMinting, setIsMinting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedAccessToken | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<AccessToken | null>(null);

  const handleMint = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setActionError(t("settings.accessTokens.nameRequired"));
      return;
    }
    setIsMinting(true);
    setActionError(null);
    try {
      setMinted(
        await mint({
          name: trimmed,
          ...(expiry === "never" ? {} : { expiresInDays: Number(expiry) }),
        })
      );
      setName("");
    } catch (err) {
      setActionError(
        statusOf(err) === CONFLICT_STATUS
          ? t("settings.accessTokens.limitReached")
          : describeApiError(err).detail
      );
    } finally {
      setIsMinting(false);
    }
  };

  const confirmRevoke = async () => {
    const target = pendingRevoke;
    setPendingRevoke(null);
    if (!target) return;
    setActionError(null);
    try {
      await revoke.mutateAsync(target.id);
    } catch (err) {
      setActionError(describeApiError(err).detail);
    }
  };

  const expiryOptions = EXPIRY_DAYS.map((value) => ({
    value,
    label: t(`settings.accessTokens.expiry.${value}`),
  }));

  let list;
  if (isLoading) {
    list = <Skeleton variant="text" width="100%" height={64} />;
  } else if (error || !tokens) {
    const failure = describeApiError(error);
    list = (
      <ErrorRetryBanner
        title={t("settings.accessTokens.loadError")}
        error={failure.detail}
        details={failure.raw}
        onRetry={() => void refetch()}
      />
    );
  } else if (tokens.length === 0) {
    list = (
      <Text variant="body" color="secondary">
        {t("settings.accessTokens.empty")}
      </Text>
    );
  } else {
    list = (
      <ul className={styles.tokens}>
        {tokens.map((token) => (
          <TokenRow key={token.id} token={token} onRevoke={setPendingRevoke} />
        ))}
      </ul>
    );
  }

  return (
    <Card title={t("settings.accessTokens.title")}>
      <Stack gap="md">
        <Text variant="caption" color="secondary">
          {t("settings.accessTokens.description")}
        </Text>
        {actionError && <Alert variant="error">{actionError}</Alert>}
        {minted ? (
          <MintedSecret minted={minted} onDone={() => setMinted(null)} />
        ) : (
          <form
            className={styles.mintForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleMint();
            }}
          >
            <Input
              label={t("settings.accessTokens.nameLabel")}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              disabled={isMinting}
            />
            <Select
              aria-label={t("settings.accessTokens.expiryLabel")}
              options={expiryOptions}
              value={expiry}
              onChange={(value) => setExpiry(value as ExpiryChoice)}
              disabled={isMinting}
            />
            <Button type="submit" variant="primary" disabled={isMinting}>
              {t("settings.accessTokens.create")}
            </Button>
          </form>
        )}
        <Divider spacing="compact" />
        {list}
      </Stack>
      <ConfirmDialog
        open={pendingRevoke !== null}
        variant="destructive"
        title={t("settings.accessTokens.revokeConfirm.title", { name: pendingRevoke?.name ?? "" })}
        description={t("settings.accessTokens.revokeConfirm.description")}
        confirmLabel={t("settings.accessTokens.revoke")}
        cancelLabel={t("settings.accessTokens.revokeConfirm.cancel")}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setPendingRevoke(null)}
      />
    </Card>
  );
}
