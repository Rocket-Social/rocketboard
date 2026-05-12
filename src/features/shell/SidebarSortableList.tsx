import {
  closestCenter,
  DndContext,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "../../lib/cn";

type DropEdge = "after" | "before";

const dropIndicatorClassName =
  "pointer-events-none absolute inset-x-3 z-20 h-0.5 bg-primary";

type SidebarSortableListProps<T> = {
  getId: (item: T) => string;
  items: T[];
  onReorder?: (orderedIds: string[]) => void;
  renderItem: (item: T, props: { isActive: boolean; isDragging: boolean }) => ReactNode;
  activeItemId?: string | null;
};

type SortableRowProps = {
  canDrag: boolean;
  children: ReactNode;
  id: string;
  isDraggingAny: boolean;
  showDropIndicatorAbove: boolean;
  showDropIndicatorBelow: boolean;
};

function reorderIds(
  ids: string[],
  activeId: string | null,
  overId: string | null,
  dropEdge: DropEdge,
): string[] {
  if (!activeId || !overId || activeId === overId) return ids;

  const remaining = ids.filter((id) => id !== activeId);
  const overIndex = remaining.indexOf(overId);
  if (overIndex === -1) return ids;

  const next = [...remaining];
  next.splice(overIndex + (dropEdge === "after" ? 1 : 0), 0, activeId);
  return next;
}

function resolveDropTarget(
  activeId: string | null,
  overId: string | null,
  lastDropTargetId: string | null,
) {
  if (overId && overId !== activeId) return overId;
  return lastDropTargetId;
}

function resolveDropEdge(event: DragOverEvent): DropEdge {
  const translatedRect = event.active.rect.current.translated;
  const overRect = event.over?.rect;
  if (!translatedRect || !overRect) return "after";
  return translatedRect.top + translatedRect.height / 2 <
    overRect.top + overRect.height / 2
    ? "before"
    : "after";
}

function SortableRow({
  canDrag,
  children,
  id,
  isDraggingAny,
  showDropIndicatorAbove,
  showDropIndicatorBelow,
}: SortableRowProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ disabled: !canDrag, id });

  return (
    <div className="relative w-full">
      {showDropIndicatorAbove ? (
        <div className={`${dropIndicatorClassName} -top-0.5`} />
      ) : null}
      {showDropIndicatorBelow ? (
        <div className={`${dropIndicatorClassName} -bottom-0.5`} />
      ) : null}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "w-full",
          canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          isDragging && "z-10 opacity-80 shadow-[0_16px_32px_rgba(15,23,42,0.28)]",
          isDraggingAny && "will-change-transform",
        )}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function SidebarSortableList<T>({
  getId,
  items,
  onReorder,
  renderItem,
  activeItemId = null,
}: SidebarSortableListProps<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropEdge, setDropEdge] = useState<DropEdge>("after");
  const dropTargetIdRef = useRef<string | null>(null);
  const dropEdgeRef = useRef<DropEdge>("after");
  const suppressClickRef = useRef(false);
  const suppressClickTimeoutRef = useRef<number | null>(null);

  const itemIds = useMemo(() => items.map(getId), [items, getId]);
  const canReorder = itemIds.length > 1 && typeof onReorder === "function";
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(
    () => () => {
      if (suppressClickTimeoutRef.current !== null) {
        window.clearTimeout(suppressClickTimeoutRef.current);
      }
    },
    [],
  );

  function clearDragState() {
    dropTargetIdRef.current = null;
    dropEdgeRef.current = "after";
    setDraggingId(null);
    setDropTargetId(null);
    setDropEdge("after");
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) {
      dropTargetIdRef.current = null;
      setDropTargetId(null);
      return;
    }
    const nextDropTargetId = String(event.over.id);
    if (nextDropTargetId === String(event.active.id)) return;
    dropTargetIdRef.current = nextDropTargetId;
    setDropTargetId(nextDropTargetId);
    dropEdgeRef.current = resolveDropEdge(event);
    setDropEdge(dropEdgeRef.current);
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id);
    const nextIds = reorderIds(
      itemIds,
      draggedId,
      resolveDropTarget(
        draggedId,
        event.over ? String(event.over.id) : null,
        dropTargetIdRef.current,
      ),
      dropEdgeRef.current,
    );

    clearDragState();

    if (
      !canReorder ||
      (nextIds.length === itemIds.length &&
        nextIds.every((id, i) => id === itemIds[i]))
    ) {
      return;
    }

    suppressClickRef.current = true;
    if (suppressClickTimeoutRef.current !== null) {
      window.clearTimeout(suppressClickTimeoutRef.current);
    }
    suppressClickTimeoutRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimeoutRef.current = null;
    }, 0);

    onReorder?.(nextIds);
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={clearDragState}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={canReorder ? sensors : undefined}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {items.map((item) => {
            const id = getId(item);
            return (
              <SortableRow
                canDrag={canReorder}
                id={id}
                isDraggingAny={draggingId === id}
                key={id}
                showDropIndicatorAbove={
                  canReorder &&
                  draggingId !== null &&
                  draggingId !== id &&
                  dropTargetId === id &&
                  dropEdge === "before"
                }
                showDropIndicatorBelow={
                  canReorder &&
                  draggingId !== null &&
                  draggingId !== id &&
                  dropTargetId === id &&
                  dropEdge === "after"
                }
              >
                {renderItem(item, {
                  isActive: id === activeItemId,
                  isDragging: draggingId === id,
                })}
              </SortableRow>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
