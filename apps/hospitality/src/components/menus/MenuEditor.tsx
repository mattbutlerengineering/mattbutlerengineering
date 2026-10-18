import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuItem, MenuSection, MenuStatus } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Text,
} from "@mattbutlerengineering/rialto";
import { ErrorRetryBanner } from "../ErrorRetryBanner";
import { describeApiError } from "../../lib/describe-api-error.js";
import {
  useCreateItem,
  useCreateSection,
  useDeleteItem,
  useDeleteSection,
  useMenu,
  useReorderItems,
  useReorderSections,
  useToggleItemSoldOut,
  useUpdateItem,
  useUpdateMenu,
  useUpdateSection,
} from "../../hooks/useMenus.js";
import { MenuItemRow, type ItemDraft } from "./MenuItemRow.js";
import { PriceInput } from "./PriceInput.js";
import { moveId } from "./reorder.js";
import { useDragReorder } from "./useDragReorder.js";
import styles from "./MenuEditor.module.css";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface Failure {
  title: string;
  detail: string;
  raw?: string;
}

interface MenuEditorProps {
  venueId: string;
  menuId: string;
  currencyCode: string;
  formatMoney: (cents: number) => string;
}

type PendingDelete =
  | { kind: "section"; section: MenuSection }
  | { kind: "item"; section: MenuSection; item: MenuItem };

export function MenuEditor({ venueId, menuId, currencyCode, formatMoney }: MenuEditorProps) {
  const { t } = useTranslation();
  const { data: menu, isLoading, error, refetch } = useMenu({ venueId, menuId });
  const updateMenu = useUpdateMenu();
  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const reorderSections = useReorderSections();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const reorderItems = useReorderItems();
  const toggleSoldOut = useToggleItemSoldOut();

  const [failure, setFailure] = useState<Failure | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const sections = menu?.sections ?? [];
  const sectionDrag = useDragReorder(
    sections.map((section) => section.id),
    (ids) => void run(() => reorderSections.mutateAsync({ venueId, menuId, ids }))
  );

  /** Runs a mutation and surfaces its failure in the banner instead of throwing into React. */
  async function run(action: () => Promise<unknown>, onDone?: () => void): Promise<boolean> {
    setFailure(null);
    try {
      await action();
      onDone?.();
      return true;
    } catch (err) {
      const description = describeApiError(err);
      const slugTaken = err instanceof ApiClientError && err.problemDetails.status === 409;
      setFailure({
        title: t("menus.saveFailed"),
        detail: slugTaken ? t("menus.form.slugTaken") : description.detail,
        raw: description.raw,
      });
      return false;
    }
  }

  if (isLoading) {
    return <Skeleton variant="card" width="100%" height={240} />;
  }
  if (error) {
    const description = describeApiError(error);
    return (
      <ErrorRetryBanner
        title={t("menus.loadFailed")}
        error={description.detail}
        details={description.raw}
        onRetry={() => void refetch()}
      />
    );
  }
  if (!menu) {
    return (
      <EmptyState heading={t("menus.notFound")} description={t("menus.notFoundDescription")} />
    );
  }

  const confirmDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    if (target.kind === "section") {
      await run(() => deleteSection.mutateAsync({ venueId, menuId, sectionId: target.section.id }));
    } else {
      await run(() =>
        deleteItem.mutateAsync({
          venueId,
          menuId,
          sectionId: target.section.id,
          itemId: target.item.id,
        })
      );
    }
  };

  const announceMove = (name: string, ids: readonly string[], id: string, to: number) => {
    setLiveMessage(
      t("menus.editor.announceMoved", {
        name,
        position: Math.min(Math.max(to, 0), ids.length - 1) + 1,
        count: ids.length,
      })
    );
    return moveId(ids, id, to);
  };

  return (
    <div className={styles.editor}>
      <div role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {liveMessage}
      </div>

      {failure && (
        <ErrorRetryBanner
          title={failure.title}
          error={failure.detail}
          details={failure.raw}
          onDismiss={() => setFailure(null)}
        />
      )}

      <MenuDetailsForm
        key={`${menu.id}:${menu.updatedAt}`}
        name={menu.name}
        slug={menu.slug}
        status={menu.status}
        onSave={(data) =>
          run(
            () => updateMenu.mutateAsync({ venueId, menuId, data }),
            () => setLiveMessage(t("menus.editor.announceSaved"))
          )
        }
      />

      <section aria-labelledby="menu-sections-heading" className={styles.editor}>
        <Text as="h2" variant="label" id="menu-sections-heading">
          {t("menus.editor.sections")}
        </Text>

        {sections.length === 0 && (
          <Text variant="body" color="secondary">
            {t("menus.editor.sectionsEmpty")}
          </Text>
        )}

        {sections.map((section, sectionIndex) => (
          <SectionCard
            key={section.id}
            section={section}
            index={sectionIndex}
            count={sections.length}
            currencyCode={currencyCode}
            formatMoney={formatMoney}
            handleProps={sectionDrag.handleProps(section.id)}
            rowProps={sectionDrag.rowProps(section.id)}
            onRename={(name) =>
              run(() =>
                updateSection.mutateAsync({
                  venueId,
                  menuId,
                  sectionId: section.id,
                  data: { name },
                })
              )
            }
            onMove={(delta) => {
              const ids = sections.map((s) => s.id);
              const next = announceMove(section.name, ids, section.id, sectionIndex + delta);
              void run(() => reorderSections.mutateAsync({ venueId, menuId, ids: next }));
            }}
            onDelete={() => setPendingDelete({ kind: "section", section })}
            onAddItem={(draft) =>
              run(() =>
                createItem.mutateAsync({ venueId, menuId, sectionId: section.id, data: draft })
              )
            }
            onToggleSoldOut={(item, soldOut) => {
              setFailure(null);
              setLiveMessage(
                t(soldOut ? "menus.editor.announceSoldOut" : "menus.editor.announceAvailable", {
                  name: item.name,
                })
              );
              toggleSoldOut.mutate(
                { venueId, menuId, sectionId: section.id, itemId: item.id, soldOut },
                {
                  onError: (err) => {
                    const description = describeApiError(err);
                    setFailure({
                      title: t("menus.saveFailed"),
                      detail: description.detail,
                      raw: description.raw,
                    });
                  },
                }
              );
            }}
            onMoveItem={(item, delta) => {
              const ids = section.items.map((i) => i.id);
              const to = ids.indexOf(item.id) + delta;
              const next = announceMove(item.name, ids, item.id, to);
              void run(() =>
                reorderItems.mutateAsync({ venueId, menuId, sectionId: section.id, ids: next })
              );
            }}
            onReorderItems={(ids) =>
              void run(() =>
                reorderItems.mutateAsync({ venueId, menuId, sectionId: section.id, ids })
              )
            }
            onSaveItem={(item, draft) =>
              void run(() =>
                updateItem.mutateAsync({
                  venueId,
                  menuId,
                  sectionId: section.id,
                  itemId: item.id,
                  data: draft,
                })
              )
            }
            onDeleteItem={(item) => setPendingDelete({ kind: "item", section, item })}
          />
        ))}

        <AddSectionForm
          onAdd={(name) =>
            run(() => createSection.mutateAsync({ venueId, menuId, data: { name } }))
          }
        />
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="destructive"
        title={
          pendingDelete?.kind === "section"
            ? t("menus.deleteSectionConfirm.title", { name: pendingDelete.section.name })
            : t("menus.deleteItemConfirm.title", { name: pendingDelete?.item.name ?? "" })
        }
        description={
          pendingDelete?.kind === "section"
            ? t("menus.deleteSectionConfirm.description")
            : t("menus.deleteItemConfirm.description")
        }
        confirmLabel={t("menus.deleteConfirm.confirm")}
        cancelLabel={t("menus.deleteConfirm.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/* ── Menu details (name, slug, status) ───────── */

interface MenuDetailsFormProps {
  name: string;
  slug: string;
  status: MenuStatus;
  onSave: (data: { name: string; slug: string; status: MenuStatus }) => Promise<boolean>;
}

function MenuDetailsForm(props: MenuDetailsFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(props.name);
  const [slug, setSlug] = useState(props.slug);
  const [status, setStatus] = useState<MenuStatus>(props.status);
  const slugValid = SLUG_PATTERN.test(slug);
  const canSave = name.trim().length > 0 && slugValid;

  return (
    <form
      className={styles.panel}
      aria-label={t("menus.editor.details")}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void props.onSave({ name: name.trim(), slug, status });
      }}
    >
      <Input
        label={t("menus.form.name")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label={t("menus.form.slug")}
        value={slug}
        error={!slugValid}
        hint={slugValid ? t("menus.form.slugHint") : t("menus.form.slugInvalid")}
        onChange={(event) => setSlug(event.target.value)}
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
      <div>
        <Button type="submit" variant="primary" disabled={!canSave}>
          {t("menus.form.save")}
        </Button>
      </div>
    </form>
  );
}

/* ── One section with its dishes ─────────────── */

interface SectionCardProps {
  section: MenuSection & { items: MenuItem[] };
  index: number;
  count: number;
  currencyCode: string;
  formatMoney: (cents: number) => string;
  handleProps: ReturnType<ReturnType<typeof useDragReorder>["handleProps"]>;
  rowProps: ReturnType<ReturnType<typeof useDragReorder>["rowProps"]>;
  onRename: (name: string) => Promise<boolean>;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onAddItem: (draft: ItemDraft) => Promise<boolean>;
  onToggleSoldOut: (item: MenuItem, soldOut: boolean) => void;
  onMoveItem: (item: MenuItem, delta: -1 | 1) => void;
  onReorderItems: (ids: string[]) => void;
  onSaveItem: (item: MenuItem, draft: ItemDraft) => void;
  onDeleteItem: (item: MenuItem) => void;
}

function SectionCard(props: SectionCardProps) {
  const { section, index, count } = props;
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);
  const itemDrag = useDragReorder(
    section.items.map((item) => item.id),
    props.onReorderItems
  );

  return (
    <div className={styles.panel} {...props.rowProps}>
      <div className={styles.sectionHeader}>
        <Text
          as="span"
          className={styles.grip}
          role="img"
          aria-label={t("menus.editor.dragAria", { name: section.name })}
          {...props.handleProps}
        >
          ⠿
        </Text>
        {renaming ? (
          <form
            className={styles.inline}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() === "") return;
              void props.onRename(name.trim()).then((ok) => ok && setRenaming(false));
            }}
          >
            <Input
              label={t("menus.editor.sectionName")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" variant="primary" size="sm">
              {t("menus.form.save")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>
              {t("menus.form.cancel")}
            </Button>
          </form>
        ) : (
          <Text as="h3" variant="label" className={styles.sectionTitle}>
            {section.name}
          </Text>
        )}
        <div className={styles.actions}>
          <IconButton
            icon={
              <Text as="span" aria-hidden="true">
                ↑
              </Text>
            }
            aria-label={t("menus.editor.moveUpAria", { name: section.name })}
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() => props.onMove(-1)}
          />
          <IconButton
            icon={
              <Text as="span" aria-hidden="true">
                ↓
              </Text>
            }
            aria-label={t("menus.editor.moveDownAria", { name: section.name })}
            variant="ghost"
            size="sm"
            disabled={index === count - 1}
            onClick={() => props.onMove(1)}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("menus.editor.renameAria", { name: section.name })}
            onClick={() => setRenaming(true)}
          >
            {t("menus.editor.rename")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("menus.editor.deleteSectionAria", { name: section.name })}
            onClick={props.onDelete}
          >
            {t("menus.list.delete")}
          </Button>
        </div>
      </div>

      {section.items.length === 0 ? (
        <Text variant="caption" color="secondary">
          {t("menus.editor.itemsEmpty")}
        </Text>
      ) : (
        <ul className={styles.items}>
          {section.items.map((item, itemIndex) => (
            <MenuItemRow
              key={`${item.id}:${item.name}:${item.priceCents}:${item.description ?? ""}`}
              item={item}
              index={itemIndex}
              count={section.items.length}
              currencyCode={props.currencyCode}
              formatMoney={props.formatMoney}
              onToggleSoldOut={props.onToggleSoldOut}
              onMove={props.onMoveItem}
              onSave={props.onSaveItem}
              onDelete={props.onDeleteItem}
              handleProps={itemDrag.handleProps(item.id)}
              rowProps={itemDrag.rowProps(item.id)}
            />
          ))}
        </ul>
      )}

      <AddItemForm
        key={section.items.length}
        sectionName={section.name}
        currencyCode={props.currencyCode}
        onAdd={props.onAddItem}
      />
    </div>
  );
}

/* ── Add forms ───────────────────────────────── */

function AddItemForm(props: {
  sectionName: string;
  currencyCode: string;
  onAdd: (draft: ItemDraft) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const canAdd = name.trim().length > 0 && priceCents !== null;

  return (
    <form
      className={styles.inline}
      aria-label={t("menus.editor.addItemTo", { name: props.sectionName })}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canAdd || priceCents === null) return;
        void props.onAdd({ name: name.trim(), description: null, priceCents });
      }}
    >
      <Input
        label={t("menus.editor.itemName")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <PriceInput
        label={t("menus.editor.price", { currency: props.currencyCode })}
        valueCents={null}
        onChange={setPriceCents}
      />
      <Button type="submit" variant="secondary" size="sm" disabled={!canAdd}>
        {t("menus.editor.addItem")}
      </Button>
    </form>
  );
}

function AddSectionForm(props: { onAdd: (name: string) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  return (
    <form
      className={styles.inline}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === "") return;
        void props.onAdd(name.trim()).then((ok) => ok && setName(""));
      }}
    >
      <Input
        label={t("menus.editor.sectionName")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={name.trim() === ""}>
        {t("menus.editor.addSection")}
      </Button>
    </form>
  );
}
