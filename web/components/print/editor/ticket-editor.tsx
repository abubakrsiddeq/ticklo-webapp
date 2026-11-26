"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Circle,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Lock,
  Minus,
  Plus,
  Redo2,
  ShieldCheck,
  Shapes,
  Square,
  Star,
  Type,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TicketFonts } from "@/components/print/ticket-fonts";
import { uploadTicketImage } from "@/app/org/_actions/print";
import {
  PLACEHOLDERS,
  designProblems,
  isProtected,
  newLayerId,
  normalizeDesign,
  type Layer,
  type PlaceholderValues,
  type TicketDesign,
} from "@/lib/print/design";
import { cn } from "@/lib/utils";
import { DesignCanvas } from "./design-canvas";
import { PropertiesPanel, layerLabel, type LayerPatch } from "./properties-panel";
import { useHistory } from "./use-history";

const STAR_PATH = "M50 0L61 35H98L68 57L79 91L50 70L21 91L32 57L2 35H39Z";

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable));
}

/**
 * Canva-style ticket editor (PRT-05): add text/fields/shapes/images, drag,
 * resize, rotate, colours and fonts, layers, undo/redo, keyboard shortcuts.
 * The QR code and the TickLO logo can be moved and resized but not removed.
 */
export function TicketEditor({
  initialDesign,
  values,
  orgSlug,
  onDesignChange,
}: {
  initialDesign: TicketDesign;
  values: PlaceholderValues;
  orgSlug: string;
  onDesignChange: (d: TicketDesign) => void;
}) {
  const history = useHistory(normalizeDesign(initialDesign));
  const design = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [uploading, setUploading] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const problems = useMemo(() => designProblems(design), [design]);
  const selected = design.layers.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    onDesignChange(design);
  }, [design, onDesignChange]);

  const commit = history.commit;
  const setLayers = useCallback((layers: Layer[], key?: string) => commit({ ...design, layers }, key), [commit, design]);

  const updateLayer = useCallback(
    (patch: LayerPatch, key?: string) => {
      if (!selectedId) return;
      setLayers(design.layers.map((l) => (l.id === selectedId ? ({ ...l, ...patch } as Layer) : l)), key);
    },
    [design.layers, selectedId, setLayers],
  );

  const addLayer = useCallback(
    (layer: Layer) => {
      // New layers go on top of the artwork (QR + logo are always drawn above anyway)
      setLayers([...design.layers, layer]);
      setSelectedId(layer.id);
    },
    [design.layers, setLayers],
  );

  const deleteSelected = useCallback(() => {
    if (!selected || isProtected(selected)) return;
    setLayers(design.layers.filter((l) => l.id !== selected.id));
    setSelectedId(null);
  }, [design.layers, selected, setLayers]);

  const duplicateSelected = useCallback(() => {
    if (!selected || isProtected(selected)) return;
    const copy = { ...structuredClone(selected), id: newLayerId(), x: selected.x + 30, y: selected.y + 30, locked: false } as Layer;
    const i = design.layers.findIndex((l) => l.id === selected.id);
    setLayers([...design.layers.slice(0, i + 1), copy, ...design.layers.slice(i + 1)]);
    setSelectedId(copy.id);
  }, [design.layers, selected, setLayers]);

  const reorder = useCallback(
    (dir: "up" | "down" | "top" | "bottom") => {
      if (!selected) return;
      const list = [...design.layers];
      const i = list.findIndex((l) => l.id === selected.id);
      list.splice(i, 1);
      const j = dir === "top" ? list.length : dir === "bottom" ? 0 : dir === "up" ? Math.min(list.length, i + 1) : Math.max(0, i - 1);
      list.splice(j, 0, selected);
      setLayers(list);
    },
    [design.layers, selected, setLayers],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selected || selected.locked) return;
      updateLayer({ x: Math.round(selected.x + dx), y: Math.round(selected.y + dy) }, `${selected.id}:nudge`);
    },
    [selected, updateLayer],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (e.key.startsWith("Arrow") && selected) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : 5;
        nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, selected, deleteSelected, duplicateSelected, nudge]);

  const centre = (w: number, h: number) => ({ x: Math.round((design.width - w) / 2), y: Math.round((design.height - h) / 2) });

  const addText = (kind: "heading" | "sub" | "body" | string) => {
    const field = PLACEHOLDERS.find((p) => p.key === kind);
    const size = kind === "heading" ? 90 : kind === "sub" ? 50 : 34;
    const width = kind === "heading" ? 800 : 600;
    addLayer({
      id: newLayerId(),
      type: "text",
      text: field ? `{{${field.key}}}` : kind === "heading" ? "Your heading" : kind === "sub" ? "Subheading" : "Add some text",
      ...centre(width, size),
      width,
      fontSize: field ? 40 : size,
      fontFamily: kind === "heading" ? "montserrat-800" : kind === "sub" ? "poppins-600" : "poppins-400",
      fill: "#0B1F3A",
    });
  };

  const addShape = (kind: "rect" | "rounded" | "circle" | "line" | "dashed" | "star") => {
    const id = newLayerId();
    if (kind === "line" || kind === "dashed") {
      addLayer({ id, type: "line", ...centre(500, 0), width: 500, stroke: "#0B1F3A", strokeWidth: 6, dash: kind === "dashed" ? [14, 12] : undefined });
    } else if (kind === "circle") {
      addLayer({ id, type: "ellipse", ...centre(220, 220), width: 220, height: 220, fill: "#0F9D58" });
    } else if (kind === "star") {
      addLayer({ id, type: "path", data: STAR_PATH, viewBox: [100, 92], ...centre(200, 184), width: 200, height: 184, fill: "#F59E0B" });
    } else {
      addLayer({ id, type: "rect", ...centre(400, 200), width: 400, height: 200, fill: "#0F9D58", cornerRadius: kind === "rounded" ? 30 : 0 });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadTicketImage(orgSlug, fd);
    setUploading(false);
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "Upload failed." : res.error);
      return;
    }
    const url = res.data.url;
    const size = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 4, h: 3 });
      img.src = URL.createObjectURL(file);
    });
    const target = replaceTarget.current;
    replaceTarget.current = null;
    if (target) {
      setLayers(design.layers.map((l) => (l.id === target && l.type === "image" ? { ...l, src: url } : l)));
      return;
    }
    const w = Math.min(500, design.width * 0.4);
    const h = Math.round((w * size.h) / size.w);
    addLayer({ id: newLayerId(), type: "image", src: url, ...centre(w, Math.min(h, design.height)), width: Math.round(w), height: Math.min(h, design.height), fit: "contain" });
  };

  const layersTopFirst = [...design.layers].reverse();

  return (
    <div className="grid gap-3">
      <TicketFonts />
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white p-2 shadow-card ring-1 ring-navy/[0.06]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Type /> Text
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
            <DropdownMenuItem onSelect={() => addText("heading")}>Heading</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addText("sub")}>Subheading</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addText("body")}>Body text</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Event details (fill in automatically)</DropdownMenuLabel>
            {PLACEHOLDERS.map((p) => (
              <DropdownMenuItem key={p.key} onSelect={() => addText(p.key)}>
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Shapes /> Shapes
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => addShape("rect")}>
              <Square /> Box
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addShape("rounded")}>
              <Square className="rounded" /> Rounded box
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addShape("circle")}>
              <Circle /> Circle
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addShape("star")}>
              <Star /> Star
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addShape("line")}>
              <Minus /> Line
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => addShape("dashed")}>
              <Minus /> Dashed line
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => {
            replaceTarget.current = null;
            fileRef.current?.click();
          }}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <ImageIcon />} Image
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!values.logo) toast.info("Your society has no logo yet – add it in Settings. The box stays empty until then.");
            addLayer({ id: newLayerId(), type: "image", src: "{{logo}}", x: 60, y: 60, width: 150, height: 150, fit: "contain", cornerRadius: 75, plate: "#FFFFFF", name: "Society logo" });
          }}
        >
          + Society logo
        </Button>
        {values.poster ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addLayer({ id: newLayerId(), type: "image", src: "{{poster}}", x: 0, y: 0, width: 520, height: design.height, fit: "cover", name: "Event poster" })}
          >
            + Event poster
          </Button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo">
            <Redo2 />
          </Button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))} aria-label="Zoom out">
            <Minus />
          </Button>
          <button type="button" className="w-12 text-center text-sm tabular-nums text-navy" onClick={() => setZoom(1)} title="Fit to screen">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))} aria-label="Zoom in">
            <Plus />
          </Button>
        </div>
      </div>

      {problems.length ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <ul className="grid gap-1">
            {problems.map((p) => (
              <li key={p.message}>
                {p.layerId ? (
                  <button type="button" className="text-left underline" onClick={() => setSelectedId(p.layerId!)}>
                    {p.message}
                  </button>
                ) : (
                  p.message
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 content-start gap-2">
          <DesignCanvas
            design={design}
            values={values}
            selectedId={selectedId}
            zoom={zoom}
            onSelect={setSelectedId}
            onChange={commit}
            onEditText={(id) => {
              setSelectedId(id);
              setTimeout(() => textRef.current?.focus(), 50);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Tip: double-click a text to edit it · arrows move (Shift = faster) · Ctrl+Z undo · Ctrl+D duplicate · Delete removes. Event details like
            {" {{date}} "}fill in automatically; {"{{serial}}"} is different on every ticket.
          </p>
        </div>

        <aside className="grid content-start gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
            <PropertiesPanel
              design={design}
              layer={selected}
              textRef={textRef}
              canUsePoster={Boolean(values.poster)}
              onLayer={updateLayer}
              onDesign={(patch, key) => commit({ ...design, ...patch }, key)}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              onOrder={reorder}
              onReplaceImage={() => {
                replaceTarget.current = selectedId;
                fileRef.current?.click();
              }}
            />
          </div>
          <div className="rounded-2xl bg-white p-2 shadow-card ring-1 ring-navy/[0.06]">
            <h3 className="px-2 py-1 font-heading text-sm font-bold text-navy">Layers</h3>
            <ul className="max-h-72 overflow-y-auto">
              {layersTopFirst.map((l) => (
                <li key={l.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                      l.id === selectedId ? "bg-brand-soft text-brand-strong" : "text-navy hover:bg-muted",
                    )}
                  >
                    <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedId(l.id)}>
                      {layerLabel(l)}
                    </button>
                    {isProtected(l) ? <ShieldCheck className="size-3.5 shrink-0 text-brand-strong" aria-label="Required" /> : null}
                    {l.locked ? <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Locked" /> : null}
                    {!isProtected(l) ? (
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-navy"
                        aria-label={l.hidden ? "Show layer" : "Hide layer"}
                        onClick={() => setLayers(design.layers.map((x) => (x.id === l.id ? { ...x, hidden: !x.hidden } : x)))}
                      >
                        {l.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
