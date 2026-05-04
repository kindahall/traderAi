"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Grip, LayoutDashboard, RotateCcw, Save, Scaling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PanelLayout = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  z?: number;
};

type PanelLayouts = Record<string, PanelLayout>;

type DragState = {
  type: "move" | "resize";
  id: string;
  element: HTMLElement;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
};

const STORAGE_PREFIX = "agent-trader-layout";
const CARD_SELECTOR = '[data-layout-card="true"]';
const MIN_CARD_WIDTH = 220;
const MIN_CARD_HEIGHT = 120;

function storageKey(pathname: string) {
  return `${STORAGE_PREFIX}:${pathname || "/"}`;
}

function safeParseLayouts(value: string | null): PanelLayouts {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as PanelLayouts;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button,a,input,textarea,select,[role="button"],[data-layout-resize-handle="true"],[data-layout-ignore-drag="true"]'));
}

function cardIdForIndex(index: number) {
  return `panel-${index + 1}`;
}

function getMovableCards(scope: HTMLElement | null) {
  if (!scope) return [];
  return Array.from(scope.querySelectorAll<HTMLElement>(CARD_SELECTOR)).filter((element) => {
    const parentCard = element.parentElement?.closest(CARD_SELECTOR);
    return !parentCard;
  });
}

function applyPanelStyle(element: HTMLElement, layout?: PanelLayout) {
  if (!layout) {
    element.style.position = "";
    element.style.transform = "";
    element.style.width = "";
    element.style.height = "";
    element.style.minHeight = "";
    element.style.zIndex = "";
    return;
  }

  element.style.position = "relative";
  element.style.transform = `translate3d(${layout.x}px, ${layout.y}px, 0)`;
  element.style.width = layout?.width ? `${layout.width}px` : "";
  element.style.height = layout?.height ? `${layout.height}px` : "";
  element.style.minHeight = layout?.height ? `${layout.height}px` : "";
  element.style.zIndex = layout?.z ? String(layout.z) : "";
}

function clearCardPersonalization(element: HTMLElement) {
  delete element.dataset.layoutItemId;
  element.classList.remove("layout-personalizer-card", "layout-personalizer-editing", "layout-personalizer-resetting", "layout-personalizer-active");
  removeResizeHandle(element);
  applyPanelStyle(element);
}

function upsertResizeHandle(element: HTMLElement) {
  if (element.querySelector('[data-layout-resize-handle="true"]')) return;
  const handle = document.createElement("button");
  handle.type = "button";
  handle.title = "Redimensionner";
  handle.dataset.layoutResizeHandle = "true";
  handle.className = "layout-personalizer-resize";
  handle.innerHTML = '<span aria-hidden="true">↘</span>';
  element.appendChild(handle);
}

function removeResizeHandle(element: HTMLElement) {
  element.querySelector('[data-layout-resize-handle="true"]')?.remove();
}

export function LayoutPersonalizer() {
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [panelCount, setPanelCount] = useState(0);
  const layoutsRef = useRef<PanelLayouts>({});
  const dragStateRef = useRef<DragState | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const zIndexRef = useRef(50);

  const persistLayouts = useCallback((next: PanelLayouts) => {
    layoutsRef.current = next;
    window.localStorage.setItem(storageKey(pathname), JSON.stringify(next));
    setSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [pathname]);

  const syncCards = useCallback(() => {
    const scope = document.querySelector<HTMLElement>('[data-layout-scope="page"]');
    const cards = getMovableCards(scope);
    setPanelCount(cards.length);
    const resetActive = resetMode || toolbarRef.current?.dataset.resetMode === "true";

    cards.forEach((card, index) => {
      const id = cardIdForIndex(index);
      const layout = layoutsRef.current[id];
      const shouldPersonalize = Boolean(layout) || editing || resetActive;

      if (!shouldPersonalize) {
        clearCardPersonalization(card);
        return;
      }

      card.dataset.layoutItemId = id;
      card.classList.add("layout-personalizer-card");
      card.classList.toggle("layout-personalizer-editing", editing);
      card.classList.toggle("layout-personalizer-resetting", resetActive);
      applyPanelStyle(card, layout ?? { x: 0, y: 0 });
      if (editing && !resetActive) upsertResizeHandle(card);
      else removeResizeHandle(card);
    });
  }, [editing, resetMode]);

  useEffect(() => {
    layoutsRef.current = safeParseLayouts(window.localStorage.getItem(storageKey(pathname)));
  }, [pathname]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncCards);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, syncCards]);

  useEffect(() => {
    const scope = document.querySelector<HTMLElement>('[data-layout-scope="page"]');
    if (!scope) return;

    const observer = new MutationObserver(() => window.requestAnimationFrame(syncCards));
    observer.observe(scope, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [syncCards]);

  useEffect(() => {
    if (!editing || resetMode) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const card = target.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || !card.dataset.layoutItemId) return;

      const id = card.dataset.layoutItemId;
      const layout = layoutsRef.current[id] ?? { x: 0, y: 0 };
      const rect = card.getBoundingClientRect();
      const resize = Boolean(target.closest('[data-layout-resize-handle="true"]'));

      if (!resize && isInteractiveTarget(target)) return;

      event.preventDefault();
      zIndexRef.current += 1;
      card.classList.add("layout-personalizer-active");
      card.style.zIndex = String(zIndexRef.current);
      dragStateRef.current = {
        type: resize ? "resize" : "move",
        id,
        element: card,
        startX: event.clientX,
        startY: event.clientY,
        baseX: layout.x ?? 0,
        baseY: layout.y ?? 0,
        baseWidth: layout.width ?? rect.width,
        baseHeight: layout.height ?? rect.height,
      };
    }

    function onPointerMove(event: PointerEvent) {
      const state = dragStateRef.current;
      if (!state) return;
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      if (state.type === "move") {
        const nextX = Math.round(state.baseX + deltaX);
        const nextY = Math.round(state.baseY + deltaY);
        applyPanelStyle(state.element, { ...layoutsRef.current[state.id], x: nextX, y: nextY, z: zIndexRef.current });
        return;
      }

      const nextWidth = Math.max(MIN_CARD_WIDTH, Math.round(state.baseWidth + deltaX));
      const nextHeight = Math.max(MIN_CARD_HEIGHT, Math.round(state.baseHeight + deltaY));
      applyPanelStyle(state.element, {
        ...layoutsRef.current[state.id],
        x: state.baseX,
        y: state.baseY,
        width: nextWidth,
        height: nextHeight,
        z: zIndexRef.current,
      });
    }

    function onPointerUp() {
      const state = dragStateRef.current;
      if (!state) return;
      const style = window.getComputedStyle(state.element);
      const matrix = style.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
      const nextLayout: PanelLayout = {
        x: Math.round(matrix.m41),
        y: Math.round(matrix.m42),
        width: state.element.style.width ? Math.round(state.element.getBoundingClientRect().width) : layoutsRef.current[state.id]?.width,
        height: state.element.style.height ? Math.round(state.element.getBoundingClientRect().height) : layoutsRef.current[state.id]?.height,
        z: Number(state.element.style.zIndex || zIndexRef.current),
      };

      state.element.classList.remove("layout-personalizer-active");
      persistLayouts({ ...layoutsRef.current, [state.id]: nextLayout });
      dragStateRef.current = null;
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [editing, resetMode, persistLayouts]);

  const resetLayout = useCallback(() => {
    toolbarRef.current?.setAttribute("data-reset-mode", "false");
    window.localStorage.removeItem(storageKey(pathname));
    layoutsRef.current = {};
    setSavedAt(null);
    setResetMode(false);
    const scope = document.querySelector<HTMLElement>('[data-layout-scope="page"]');
    getMovableCards(scope).forEach((card) => {
      card.style.transform = "";
      card.style.width = "";
      card.style.height = "";
      card.style.minHeight = "";
      card.style.zIndex = "";
    });
    window.requestAnimationFrame(syncCards);
  }, [pathname, syncCards]);

  const setDomResetMode = useCallback((active: boolean) => {
    toolbarRef.current?.setAttribute("data-reset-mode", String(active));
    const scope = document.querySelector<HTMLElement>('[data-layout-scope="page"]');
    getMovableCards(scope).forEach((card) => {
      card.classList.toggle("layout-personalizer-resetting", active);
      if (active) removeResizeHandle(card);
      else if (editing) upsertResizeHandle(card);
    });
  }, [editing]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const layoutMode = params.get("layout");

    if (layoutMode === "reset") {
      const frame = window.requestAnimationFrame(() => {
        setEditing(true);
        setDomResetMode(true);
        setResetMode(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (layoutMode === "confirm-reset") {
      const frame = window.requestAnimationFrame(() => {
        resetLayout();
        window.history.replaceState(null, "", pathname);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [pathname, resetLayout, setDomResetMode]);

  function toggleEditing() {
    setEditing((value) => !value);
    setResetMode(false);
  }

  const resetHref = `${pathname}?layout=reset`;
  const confirmResetHref = `${pathname}?layout=confirm-reset`;

  return (
    <div
      ref={toolbarRef}
      data-layout-ignore-drag="true"
      data-reset-mode={resetMode ? "true" : "false"}
      className="layout-personalizer-toolbar fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-280px)] flex-wrap items-center justify-end gap-2 rounded-2xl border border-[#1b3a55] bg-[#06111f]/92 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl"
    >
      <Button variant={editing ? "success" : "ghost"} size="sm" onClick={toggleEditing}>
        {editing ? <Save className="size-4" /> : <LayoutDashboard className="size-4" />}
        {editing ? "Disposition active" : "Personnaliser"}
      </Button>
      {editing ? (
        <>
          <div data-layout-normal-controls="true" className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-100 xl:flex">
              <Grip className="size-3" /> déplacer les cartes
            </span>
            <span className="hidden items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-100 xl:flex">
              <Scaling className="size-3" /> coin bas droit = taille
            </span>
            <a href={resetHref} className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-200 transition-all hover:border-sky-400/40 hover:bg-sky-500/10">
              <RotateCcw className="size-4" /> Mode reset
            </a>
          </div>
          <div data-layout-reset-controls="true" className="flex items-center gap-2">
            <span className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
              Mode réinitialisation armé pour cette page
            </span>
            <a href={confirmResetHref} className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-red-500/70 bg-red-500/10 px-3 text-xs font-semibold text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.16)] transition-all hover:bg-red-500/20">
              <RotateCcw className="size-4" /> Confirmer reset
            </a>
            <a href={pathname} className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-200 transition-all hover:border-sky-400/40 hover:bg-sky-500/10">
              Annuler
            </a>
          </div>
        </>
      ) : null}
      <span className={cn("font-mono text-[11px]", savedAt ? "text-emerald-300" : "text-slate-500")}>{savedAt ? `sauvé ${savedAt}` : `${panelCount} panneaux`}</span>
    </div>
  );
}
