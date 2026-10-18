import { useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Menu, MenuStatus } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Select,
  Skeleton,
  SkeletonGroup,
  Text,
} from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { MenuEditor, SLUG_PATTERN } from "../components/menus/MenuEditor.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { useCreateMenu, useDeleteMenu, useMenus } from "../hooks/useMenus.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import styles from "./MenusPage.module.css";

const STATUS_VARIANT = { DRAFT: "neutral", ACTIVE: "success", INACTIVE: "warning" } as const;

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Failure {
  title: string;
  detail: string;
  raw?: string;
}

export function MenusPage() {
  const { t } = useTranslation();
  const { menuId } = useParams<{ menuId: string }>();
  const { selectedVenueId, selectedVenue } = useVenue();
  const fmt = useVenueFormat({
    ianaTimezone: selectedVenue?.ianaTimezone ?? "UTC",
    currencyCode: selectedVenue?.currencyCode ?? "USD",
  });
  const { data: menus = [], isLoading, error, refetch } = useMenus({ venueId: selectedVenueId });
  const createMenu = useCreateMenu();
  const deleteMenu = useDeleteMenu();

  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [toDelete, setToDelete] = useState<Menu | null>(null);

  const loadFailure = error ? describeApiError(error) : null;

  const fail = (err: unknown, slugConflictable = false) => {
    const description = describeApiError(err);
    const slugTaken =
      slugConflictable && err instanceof ApiClientError && err.problemDetails.status === 409;
    setFailure({
      title: t("menus.saveFailed"),
      detail: slugTaken ? t("menus.form.slugTaken") : description.detail,
      raw: description.raw,
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <PageHeader title={t("menus.title")} description={t("menus.description")} />
        {menuId ? (
          <Link to="/menus">{t("menus.editor.back")}</Link>
        ) : (
          <Button
            variant="primary"
            onClick={() => setCreating(true)}
            disabled={!selectedVenueId || creating}
          >
            {t("menus.newButton")}
          </Button>
        )}
      </div>

      <div data-testid="primary-content">
        {failure && (
          <ErrorRetryBanner
            title={failure.title}
            error={failure.detail}
            details={failure.raw}
            onDismiss={() => setFailure(null)}
          />
        )}

        {menuId && selectedVenueId && (
          <MenuEditor
            venueId={selectedVenueId}
            menuId={menuId}
            currencyCode={selectedVenue?.currencyCode ?? "USD"}
            formatMoney={fmt.formatMoney}
          />
        )}

        {!menuId && (
          <>
            {creating && selectedVenueId && (
              <NewMenuForm
                onCancel={() => setCreating(false)}
                onCreate={async (data) => {
                  setFailure(null);
                  try {
                    await createMenu.mutateAsync({ venueId: selectedVenueId, data });
                    setCreating(false);
                  } catch (err) {
                    fail(err, true);
                  }
                }}
              />
            )}

            {loadFailure && (
              <ErrorRetryBanner
                title={t("menus.loadFailed")}
                error={loadFailure.detail}
                details={loadFailure.raw}
                onRetry={() => void refetch()}
              />
            )}

            {isLoading && (
              <SkeletonGroup>
                <Skeleton variant="card" width="100%" height={72} />
              </SkeletonGroup>
            )}

            {!isLoading && !error && menus.length === 0 && !creating && (
              <EmptyState
                heading={t("menus.emptyHeading")}
                description={t("menus.emptyDescription")}
                action={
                  <Button
                    variant="primary"
                    onClick={() => setCreating(true)}
                    disabled={!selectedVenueId}
                  >
                    {t("menus.newButton")}
                  </Button>
                }
              />
            )}

            {menus.length > 0 && (
              <ul className={styles.list}>
                {menus.map((menu) => (
                  <li key={menu.id} className={styles.menuRow}>
                    <div className={styles.menuName}>
                      <Text variant="body" color="primary">
                        {menu.name}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {t("menus.list.slugLabel", { slug: menu.slug })}
                      </Text>
                    </div>
                    <Badge variant={STATUS_VARIANT[menu.status]} size="sm">
                      {t(`menus.status.${menu.status}`)}
                    </Badge>
                    <div className={styles.actions}>
                      <Link
                        to={`/menus/${menu.id}`}
                        aria-label={t("menus.list.openAria", { name: menu.name })}
                      >
                        {t("menus.list.open")}
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("menus.list.deleteAria", { name: menu.name })}
                        onClick={() => setToDelete(menu)}
                      >
                        {t("menus.list.delete")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        variant="destructive"
        title={t("menus.deleteConfirm.title", { name: toDelete?.name ?? "" })}
        description={t("menus.deleteConfirm.description")}
        confirmLabel={t("menus.deleteConfirm.confirm")}
        cancelLabel={t("menus.deleteConfirm.cancel")}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const target = toDelete;
          setToDelete(null);
          if (!target || !selectedVenueId) return;
          setFailure(null);
          try {
            await deleteMenu.mutateAsync({ venueId: selectedVenueId, menuId: target.id });
          } catch (err) {
            fail(err);
          }
        }}
      />
    </div>
  );
}

/* ── Create form ─────────────────────────────── */

function NewMenuForm(props: {
  onCancel: () => void;
  onCreate: (data: { name: string; slug: string; status: MenuStatus }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [status, setStatus] = useState<MenuStatus>("DRAFT");
  const effectiveSlug = slugEdited ? slug : slugFromName(name);
  const slugValid = SLUG_PATTERN.test(effectiveSlug);
  const canCreate = name.trim().length > 0 && slugValid;

  return (
    <form
      className={styles.panel}
      aria-label={t("menus.newButton")}
      onSubmit={(event) => {
        event.preventDefault();
        if (canCreate) void props.onCreate({ name: name.trim(), slug: effectiveSlug, status });
      }}
    >
      <Input
        label={t("menus.form.name")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label={t("menus.form.slug")}
        value={effectiveSlug}
        error={effectiveSlug !== "" && !slugValid}
        hint={
          effectiveSlug === "" || slugValid ? t("menus.form.slugHint") : t("menus.form.slugInvalid")
        }
        onChange={(event) => {
          setSlug(event.target.value);
          setSlugEdited(true);
        }}
      />
      <Select
        label={t("menus.status.label")}
        value={status}
        options={(["DRAFT", "ACTIVE", "INACTIVE"] as const).map((value) => ({
          value,
          label: t(`menus.status.${value}`),
        }))}
        onChange={(value) => setStatus(value as MenuStatus)}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={!canCreate}>
          {t("menus.form.create")}
        </Button>
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          {t("menus.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
