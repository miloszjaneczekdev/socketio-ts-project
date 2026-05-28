import * as React from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

type Id = number | string;

const cx = (...cls: Array<string | false | undefined>) =>
  cls.filter(Boolean).join(" ");

type DragSwapDotsProps = {
  initialItems?: Id[];
  cardWidth?: number;
  cardHeight?: number;
  columns?: number;
  initialCrownOwner?: Id; // opcjonalny startowy właściciel (zmapujemy na slot)
};

function SortableDot({
  id,
  isDraggingOrigin,
}: {
  id: Id;
  isDraggingOrigin: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: transform ? 10 : 2, // nad placeholderem
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        "badge",
        isDragging && "badge-dragging",
        isDraggingOrigin && "hidden"
      )}
      title={`Przeciągnij ${id} i upuść na innej karcie`}
      {...attributes}
      {...listeners}
      tabIndex={0}
      aria-label={`Kropka ${id}. Przeciągnij, aby zmienić pozycję.`}
      role="button"
    >
      {id}
    </div>
  );
}

/** Korona – osobny draggable, renderowana tylko na karcie, która aktualnie ją posiada (slot/index) */
function Crown() {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: "crown" });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    zIndex: isDragging ? 11 : 3, // nad badge jeśli chcesz, zmień na 2 dla równości
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx("crown", isDragging && "crown-dragging")}
      title="Przeciągnij, aby przekazać koronę"
      {...attributes}
      {...listeners}
      tabIndex={0}
      role="button"
      aria-label="Przenieś koronę na inną kartę"
    >
      <span aria-hidden>👑</span>
    </div>
  );
}

export default function DragSwapDots({
  initialItems = [1, 2, 3, 4],
  cardWidth = 200,
  cardHeight = 100,
  columns = 4,
  initialCrownOwner,
}: DragSwapDotsProps) {
  const [items, setItems] = React.useState<Id[]>(initialItems);
  const [activeId, setActiveId] = React.useState<Id | "crown" | null>(null);
  const [overId, setOverId] = React.useState<Id | null>(null);

  // Korona przypięta do slotu (indeksu), nie do ID
  const initialCrownIndex =
    initialCrownOwner != null
      ? Math.max(0, initialItems.indexOf(initialCrownOwner))
      : 0;

  const [crownSlot, setCrownSlot] = React.useState<number>(initialCrownIndex);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as Id | "crown");
  };

  const onDragOver = (e: DragOverEvent) => {
    setOverId((e.over?.id as Id | undefined) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const active = e.active.id as Id | "crown";
    const over = e.over?.id as Id | undefined;

    // Przenoszenie korony -> przypnij do slotu (indeksu karty)
    if (active === "crown") {
      if (over !== undefined) {
        const overIndex = items.indexOf(over);
        if (overIndex !== -1) setCrownSlot(overIndex);
      }
      setActiveId(null);
      setOverId(null);
      return;
    }

    // Sortowanie kropek – korona zostaje na swoim slocie
    if (over !== undefined && active !== over) {
      setItems((cur) => {
        const oldIndex = cur.indexOf(active);
        const newIndex = cur.indexOf(over);
        return arrayMove(cur, oldIndex, newIndex);
      });
    }

    setActiveId(null);
    setOverId(null);
  };

  return (
    <div style={{ padding: "100px", background: "#f9fafb", minHeight: "100vh" }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items} strategy={rectSortingStrategy}>
          <div
            className="wrapper"
            role="list"
            aria-label="Kolejność kropek"
            style={{
              gridTemplateColumns: `repeat(${columns}, ${cardWidth}px)`,
            }}
          >
            {items.map((id, index) => {
              const isOrigin = activeId === id;
              const isHover = overId === id && activeId !== null;

              const showCrown = crownSlot === index && activeId !== "crown";
              const showCrownPreview =
                activeId === "crown" && overId === id; // ghost 50%

              return (
                <div
                  key={id}
                  role="listitem"
                  className={cx("card", isHover && "card-hover")}
                  title="Upuść tutaj, aby zamienić z tym miejscem"
                  style={{ width: cardWidth, height: cardHeight }}
                >
                  <div className="placeholder" aria-hidden />

                  {/* 👑 Korona przypięta do SLOTU (index) */}
                  {showCrown && <Crown />}

                  {/* 👻 Podgląd (ghost) korony podczas dragowania korony */}
                  {showCrownPreview && (
                    <div className="crown crown-preview" aria-hidden>
                      <span aria-hidden>👑</span>
                    </div>
                  )}

                  <SortableDot id={id} isDraggingOrigin={isOrigin} />
                </div>
              );
            })}
          </div>
        </SortableContext>

        {/* Overlay dla obu typów dragów */}
        <DragOverlay dropAnimation={null}>
          {activeId
            ? activeId === "crown"
              ? // „unoszona” korona
                <div className="crown crown-overlay">
                  <span aria-hidden>👑</span>
                </div>
              : // „unoszona” kropka
                <div className="badge badge-overlay">{activeId}</div>
            : null}
        </DragOverlay>
      </DndContext>

      <style>{`
        .wrapper {
          display: grid;
          gap: 12px;
          overflow: visible;
          position: relative;
        }

        .card {
          position: relative;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          transition: box-shadow 120ms ease;
          overflow: visible;
        }

        .card-hover {
          box-shadow: 0 0 0 3px rgba(59, 130, 246, .35);
        }

        /* Kropki (badge) */
        .badge {
          position: absolute;
          top: 8px;
          right: 8px;           /* badge w prawym górnym */
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 2px solid #334155;
          display: grid;
          place-items: center;
          font-weight: 600;
          user-select: none;
          cursor: grab;
          background: #f8fafc;
          z-index: 2;           /* nad placeholderem */
        }

        .badge-dragging {
          opacity: 0.5;
          cursor: grabbing;
        }

        .badge-overlay {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 2px solid #334155;
          display: grid;
          place-items: center;
          font-weight: 600;
          background: #f8fafc;
          cursor: grabbing;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          z-index: 9999;
        }

        /* Korona = sam symbol, bez tła/ramki/kółka */
        .crown {
          position: absolute;
          top: 8px;
          left: 8px;            /* korona w lewym górnym */
          font-size: 22px;      /* powiększony symbol 👑 */
          line-height: 1;
          cursor: grab;
          user-select: none;
          z-index: 3;           /* ponad badge; jeśli chcesz równość ustaw 2 */
        }

        .crown-dragging {
          opacity: 0.9;
          cursor: grabbing;
        }

        /* Podgląd (ghost) korony podczas dragowania */
        .crown-preview {
          opacity: 0.5;         /* 50% */
          pointer-events: none; /* nie przechwytuje zdarzeń */
          z-index: 2;           /* nad placeholderem (1), obok badge (2) */
        }

        /* Overlay korony – też sam symbol */
        .crown-overlay {
          position: absolute;
          top: 8px;
          left: 8px;
          font-size: 22px;
          line-height: 1;
          user-select: none;
          cursor: grabbing;
          z-index: 10000;
        }

        /* Placeholder ZAWSZE pod badge */
        .placeholder {
          position: absolute;
          top: 8px;
          right: 8px;            /* pod koroną po lewej */
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 2px dashed #cbd5e1;
          z-index: 1;           /* pod badge/crown */
        }

        .hidden {
          visibility: hidden;
        }
      `}</style>
    </div>
  );
}
