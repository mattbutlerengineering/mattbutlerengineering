import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DragEvent } from "react";
import type { MenuItem } from "@mbe/types";
import { Badge, Button, IconButton, Input, Text, Toggle } from "@mattbutlerengineering/rialto";
import { PriceInput } from "./PriceInput.js";
import styles from "./MenuItemRow.module.css";

export interface ItemDraft {
  name: string;
  description: string | null;
  priceCents: number;
}

interface MenuItemRowProps {
  item: MenuItem;
  index: number;
  count: number;
  currencyCode: string;
  /** Cents in the venue's currency, already localized. */
  formatMoney: (cents: number) => string;
  onToggleSoldOut: (item: MenuItem, soldOut: boolean) => void;
  onMove: (item: MenuItem, delta: -1 | 1) => void;
  onSave: (item: MenuItem, draft: ItemDraft) => void;
  onDelete: (item: MenuItem) => void;
  handleProps: { draggable: true; onDragStart: (event: DragEvent) => void };
  rowProps: { onDragOver: (event: DragEvent) => void; onDrop: (event: DragEvent) => void };
}

export function MenuItemRow({
  item,
  index,
  count,
  currencyCode,
  formatMoney,
  onToggleSoldOut,
  onMove,
  onSave,
  onDelete,
  handleProps,
  rowProps,
}: MenuItemRowProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [priceCents, setPriceCents] = useState<number | null>(item.priceCents);
  const soldOut = item.status === "SOLD_OUT";

  const canSave = name.trim().length > 0 && priceCents !== null;

  if (editing) {
    return (
      <li className={styles.row} {...rowProps}>
        <form
          className={styles.editForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave || priceCents === null) return;
            onSave(item, {
              name: name.trim(),
              description: description.trim() === "" ? null : description.trim(),
              priceCents,
            });
            setEditing(false);
          }}
        >
          <Input
            label={t("menus.editor.itemName")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label={t("menus.editor.itemDescription")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <PriceInput
            label={t("menus.editor.price", { currency: currencyCode })}
            valueCents={item.priceCents}
            onChange={setPriceCents}
          />
          <div className={styles.actions}>
            <Button type="submit" variant="primary" size="sm" disabled={!canSave}>
              {t("menus.editor.saveItem")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("menus.form.cancel")}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={styles.row} {...rowProps}>
      <Text
        as="span"
        className={styles.grip}
        role="img"
        aria-label={t("menus.editor.dragAria", { name: item.name })}
        {...handleProps}
      >
        ⠿
      </Text>
      <div className={styles.body}>
        <Text variant="body" color="primary">
          {item.name}
        </Text>
        {item.description && (
          <Text variant="caption" color="secondary">
            {item.description}
          </Text>
        )}
      </div>
      <Text variant="body" color="primary" className={styles.price}>
        {formatMoney(item.priceCents)}
      </Text>
      {soldOut && (
        <Badge variant="warning" size="sm">
          {t("menus.editor.soldOut")}
        </Badge>
      )}
      <Toggle
        label={t("menus.editor.soldOutAria", { name: item.name })}
        checked={soldOut}
        onCheckedChange={(next) => onToggleSoldOut(item, next)}
      />
      <div className={styles.actions}>
        <IconButton
          icon={
            <Text as="span" aria-hidden="true">
              ↑
            </Text>
          }
          aria-label={t("menus.editor.moveUpAria", { name: item.name })}
          variant="ghost"
          size="sm"
          disabled={index === 0}
          onClick={() => onMove(item, -1)}
        />
        <IconButton
          icon={
            <Text as="span" aria-hidden="true">
              ↓
            </Text>
          }
          aria-label={t("menus.editor.moveDownAria", { name: item.name })}
          variant="ghost"
          size="sm"
          disabled={index === count - 1}
          onClick={() => onMove(item, 1)}
        />
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("menus.editor.editAria", { name: item.name })}
          onClick={() => setEditing(true)}
        >
          {t("menus.editor.edit")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("menus.editor.deleteItemAria", { name: item.name })}
          onClick={() => onDelete(item)}
        >
          {t("menus.list.delete")}
        </Button>
      </div>
    </li>
  );
}
