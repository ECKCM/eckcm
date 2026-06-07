"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Settings2, GripVertical, RotateCcw } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ColumnDef, ColumnPref } from "./registrations-columns";

/** Working copy of one reorderable column inside the editor. */
interface DraftColumn {
  id: string;
  label: string;
  visible: boolean;
}

interface ColumnSettingsProps {
  /** Resolved layout in current order (locked columns first). */
  layout: ColumnDef[];
  /** Ids currently hidden. */
  hidden: Set<string>;
  saving?: boolean;
  /** Persist a new layout. Locked columns are excluded from the payload. */
  onSave: (prefs: ColumnPref[]) => Promise<void> | void;
  /** Restore the default order + all-visible (persisted by the parent). */
  onReset: () => Promise<void> | void;
}

/** Build the editor draft from the current (resolved) layout + hidden set. */
function draftFromLayout(layout: ColumnDef[], hidden: Set<string>): DraftColumn[] {
  return layout
    .filter((c) => !c.locked)
    .map((c) => ({ id: c.id, label: c.label, visible: !hidden.has(c.id) }));
}

export function ColumnSettings({
  layout,
  hidden,
  saving,
  onSave,
  onReset,
}: ColumnSettingsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftColumn[]>(() => draftFromLayout(layout, hidden));

  // The committed layout serialized the same way the draft is, for dirty-check.
  const committed = useMemo(() => draftFromLayout(layout, hidden), [layout, hidden]);

  // Re-seed the draft each time the editor opens so it starts from the latest
  // saved state (and discards any unsaved edits from a previous Cancel).
  useEffect(() => {
    if (open) setDraft(draftFromLayout(layout, hidden));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(committed),
    [draft, committed]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((items) => {
      const from = items.findIndex((c) => c.id === active.id);
      const to = items.findIndex((c) => c.id === over.id);
      if (from === -1 || to === -1) return items;
      return arrayMove(items, from, to);
    });
  };

  const toggle = (id: string, visible: boolean) =>
    setDraft((items) => items.map((c) => (c.id === id ? { ...c, visible } : c)));

  const handleSave = async () => {
    await onSave(draft.map((c) => ({ id: c.id, visible: c.visible })));
    setOpen(false);
  };

  const handleReset = async () => {
    // Reset persists the default immediately; reflect it in the draft too.
    await onReset();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="size-4" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Table columns</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcw className="size-3" />
            Reset
          </Button>
        </div>
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          Drag to reorder, toggle to show/hide. Applies to all admins.
        </p>
        <Separator />
        <div className="max-h-[55vh] overflow-y-auto py-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draft.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {draft.map((col, i) => (
                <SortableColumnRow
                  key={col.id}
                  col={col}
                  index={i}
                  disabled={saving}
                  onToggle={toggle}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <Separator />
        <div className="flex items-center justify-end gap-2 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Sortable row ──────────────────────────────────────────

function SortableColumnRow({
  col,
  index,
  disabled,
  onToggle,
}: {
  col: DraftColumn;
  index: number;
  disabled?: boolean;
  onToggle: (id: string, visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 ${
        isDragging ? "bg-muted shadow-sm rounded-md relative z-10" : "hover:bg-muted/50"
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground disabled:cursor-default disabled:opacity-40"
        disabled={disabled}
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <Checkbox
        id={`col-${col.id}`}
        checked={col.visible}
        onCheckedChange={(v) => onToggle(col.id, v === true)}
        disabled={disabled}
      />
      <label
        htmlFor={`col-${col.id}`}
        className={`flex-1 cursor-pointer select-none text-sm ${
          col.visible ? "" : "text-muted-foreground line-through"
        }`}
      >
        {col.label}
      </label>
    </div>
  );
}
