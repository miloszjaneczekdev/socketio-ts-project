import React, { useEffect, useRef } from "react";
import styles from "./StickyStack.module.css";

type Side = "top" | "bottom";

export interface StickyStackProps<T> {
  items: T[];
  getId: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number, array: T[]) => React.ReactNode;
  cardHeight?: number;
  className?: string;
  debugBadges?: boolean;
}

export default function StickyStack<T>({
  items,
  getId,
  renderItem,
  cardHeight = 100,
  className = "",
  debugBadges = false,
}: StickyStackProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sideMapRef = useRef<WeakMap<HTMLElement, Side>>(new WeakMap());
  const rafIdRef = useRef<number | null>(null);

  const rotationsRef = useRef<Map<string | number, string>>(new Map());

  // tylko jeśli chcesz gdzieś używać
  const topIndicesRef = useRef<number[]>([]);
  const bottomIndicesRef = useRef<number[]>([]);

  // stałe rotacje
  useEffect(() => {
    const rotations = rotationsRef.current;
    const currentIds = new Set<string | number>();

    items.forEach((it, i) => {
      const id = getId(it, i);
      currentIds.add(id);
      if (!rotations.has(id)) {
        const rot = (Math.random() * 4 - 2).toFixed(1) + "deg";
        rotations.set(id, rot);
      }
    });

    for (const id of Array.from(rotations.keys())) {
      if (!currentIds.has(id)) {
        rotations.delete(id);
      }
    }
  }, [items, getId]);

  const scheduleUpdate = () => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      updateAll();
      rafIdRef.current = null;
    });
  };

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onScroll = () => scheduleUpdate();
    const onResize = () => scheduleUpdate();
    sc.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    scheduleUpdate();
    return () => {
      sc.removeEventListener("scroll", onScroll as EventListener);
      window.removeEventListener("resize", onResize);
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  useEffect(() => {
    scheduleUpdate();
  }, [items.length]);

  const updateAll = () => {
    const sc = scrollRef.current;
    if (!sc) return;

    const sideMap = sideMapRef.current;
    const H = 24; // histereza

    const cRect = sc.getBoundingClientRect();
    const mid = cRect.top + cRect.height / 2;

    const els = Array.from(
      sc.querySelectorAll<HTMLElement>(`.${styles.item}`)
    );
    if (!els.length) return;

    type Info = { el: HTMLElement; center: number };

    const topInfos: Info[] = [];
    const bottomInfos: Info[] = [];

    // 1) ustalenie side (top/bottom) + zbudowanie list
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;

      let side = sideMap.get(el);
      if (side === "top") {
        if (center > mid + H) side = "bottom";
      } else if (side === "bottom") {
        if (center < mid - H) side = "top";
      } else {
        side = center <= mid ? "top" : "bottom";
      }
      sideMap.set(el, side);

      if (side === "top") {
        el.classList.add(styles.stickTop);
        el.classList.remove(styles.stickBottom);
        topInfos.push({ el, center });
      } else {
        el.classList.add(styles.stickBottom);
        el.classList.remove(styles.stickTop);
        bottomInfos.push({ el, center });
      }
    }

    const topLen = topInfos.length;
    const bottomLen = bottomInfos.length;

    // 2) policzenie dystansu od środka do cieni – po sortowaniu po center
    const sortedTop = [...topInfos].sort((a, b) => a.center - b.center);
    const sortedBottom = [...bottomInfos].sort((a, b) => a.center - b.center);

    const distMap = new Map<HTMLElement, number>();

    // dla top: 0 przy środku, rośnie w górę
    sortedTop.forEach(({ el }, i) => {
      const dist = topLen ? topLen - 1 - i : 0;
      distMap.set(el, dist);
    });
    // dla bottom: 0 przy środku, rośnie w dół
    sortedBottom.forEach(({ el }, i) => {
      const dist = i;
      distMap.set(el, dist);
    });

    // ---------- parametry cieni ----------
    const BASE_VIEWPORT_H = 800;
    const rawSizeFactor = cRect.height / BASE_VIEWPORT_H;
    const sizeFactor = Math.min(1.2, Math.max(0.6, rawSizeFactor));

    const rawDensity = cRect.height / (cardHeight * 8);
    const densityFactor = Math.min(1.1, Math.max(0.5, rawDensity));

    const ALPHA_BASE = 0.1;
    const ALPHA_MAX_BASE = 0.2;
    const ALPHA_LIMIT_BASE = 8;
    const ALPHA_DECAY = 0.9;
    const ALPHA_START = 2;
    const ALPHA_FULL = 6;

    const BLUR_BASE = 4;
    const BLUR_MAX_BASE = 8;
    const BLUR_LIMIT_BASE = 8;
    const BLUR_DECAY = 0.9;
    const BLUR_START = 2;
    const BLUR_FULL = 6;

    const SPREAD_BASE = 1;
    const SPREAD_MAX_BASE = 8;
    const SPREAD_LIMIT_BASE = 8;
    const SPREAD_DECAY = 0.9;
    const SPREAD_START = 3;
    const SPREAD_FULL = 6;

    const ALPHA_MAX = ALPHA_MAX_BASE * sizeFactor;
    const BLUR_MAX = BLUR_MAX_BASE * sizeFactor;
    const SPREAD_MAX = SPREAD_MAX_BASE * sizeFactor;

    const ALPHA_LIMIT = Math.round(ALPHA_LIMIT_BASE * densityFactor);
    const BLUR_LIMIT = Math.round(BLUR_LIMIT_BASE * densityFactor);
    const SPREAD_LIMIT = Math.round(SPREAD_LIMIT_BASE * densityFactor);

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const smoothstep = (t: number) => t * t * (3 - 2 * t);
    const centerScale = (n: number, start: number, full: number) => {
      if (full <= start) return n > start ? 1 : 0;
      return smoothstep(clamp01((n - start) / (full - start)));
    };

    const K = Math.max(topLen, bottomLen);
    const alphaCenter = centerScale(K, ALPHA_START, ALPHA_FULL);
    const blurCenter = centerScale(K, BLUR_START, BLUR_FULL);
    const spreadCenter = centerScale(K, SPREAD_START, SPREAD_FULL);

    const factorFromDist = (dist: number, DECAY: number, LIMIT: number) =>
      dist > LIMIT ? 0 : Math.pow(DECAY, dist);

    const compose = (
      BASE: number,
      center: number,
      DECAY: number,
      LIMIT: number,
      dist: number
    ) => (BASE + (1 - BASE) * center) * factorFromDist(dist, DECAY, LIMIT);

    const applyIndex = (
      el: HTMLElement,
      idx: number,
      group: "top" | "bottom"
    ) => {
      const dist = distMap.get(el) ?? 0;
      const idxStr = String(idx);

      // wrapper
      el.dataset.stickyIdx = idxStr;
      el.dataset.stickyGroup = group;
      el.style.zIndex = idxStr;
      el.style.setProperty("--sticky-idx", idxStr);

      // body (środek kartki)
      const body = el.firstElementChild as HTMLElement | null;
      if (body) {
        body.dataset.stickyIdx = idxStr;
        body.dataset.stickyGroup = group;
        body.style.zIndex = idxStr;
        body.style.setProperty("--sticky-idx", idxStr);
      }

      const fA = compose(
        ALPHA_BASE,
        alphaCenter,
        ALPHA_DECAY,
        ALPHA_LIMIT,
        dist
      );
      const fB = compose(
        BLUR_BASE / BLUR_MAX,
        blurCenter,
        BLUR_DECAY,
        BLUR_LIMIT,
        dist
      );
      const fS = compose(
        SPREAD_BASE / SPREAD_MAX,
        spreadCenter,
        SPREAD_DECAY,
        SPREAD_LIMIT,
        dist
      );

      el.style.setProperty("--shadowA", (ALPHA_MAX * fA).toFixed(3));
      el.style.setProperty("--shadowB", `${(BLUR_MAX * fB).toFixed(1)}px`);
      el.style.setProperty("--shadowS", `${(SPREAD_MAX * fS).toFixed(1)}px`);
    };

    const newTopIdx: number[] = [];
    const newBottomIdx: number[] = [];

    // 3) GÓRA – od góry do środka: 1,2,3,... (wg kolejności w DOM)
    topInfos.forEach(({ el }, i) => {
      const idx = i + 1; // 1..topLen
      applyIndex(el, idx, "top");
      newTopIdx.push(idx);
    });

    // 4) DÓŁ – od dołu do środka: 1,2,3,... (liczymy od końca listy)
    for (let j = 0; j < bottomInfos.length; j++) {
      const { el } = bottomInfos[bottomInfos.length - 1 - j]; // od dołu
      const idx = j + 1; // 1..bottomLen
      applyIndex(el, idx, "bottom");
      newBottomIdx.push(idx);
    }

    topIndicesRef.current = newTopIdx;
    bottomIndicesRef.current = newBottomIdx;

    if (debugBadges) {
      console.log("StickyStack groups", {
        top: newTopIdx,
        bottom: newBottomIdx,
      });
    }
  };

  // AUTO-SCROLL NA GÓRĘ, GDY POJAWI SIĘ NOWY ELEMENT
  const prevCountRef = useRef(items.length);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;

    if (items.length > prevCountRef.current) {
      sc.scrollTo({ top: 0, behavior: "smooth" });
    }

    prevCountRef.current = items.length;
  }, [items.length]);

  return (
    <div
      ref={scrollRef}
      className={`${styles.scroll} ${className}`}
      style={
        {
          "--card-h": `${cardHeight}px`,
        } as React.CSSProperties
      }
    >
      {items.map((it, i, arr) => {
        const id = getId(it, i);
        const rot = rotationsRef.current.get(id) ?? "0deg";

        return (
          <div
            key={String(id)}
            data-id={String(id)}
            className={styles.item}
            style={
              {
                "--rot": rot,
                "--shadowA": 0,
                "--shadowB": "0px",
                "--shadowS": "0px",
              } as React.CSSProperties
            }
          >
            <div className={styles.itemBody}>{renderItem(it, i, arr)}</div>
          </div>
        );
      })}
    </div>
  );
}
