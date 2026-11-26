"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  MIN_QR_SIZE,
  drawOrder,
  layerBox,
  isProtected,
  type Layer,
  type PlaceholderValues,
  type TicketDesign,
} from "@/lib/print/design";
import { backgroundNode, buildLayerNode, loadKonva, prepareAssets, type Konva, type RenderAssets } from "@/lib/print/render";
import { SAMPLE_QR_TOKEN } from "@/lib/print/qr-matrix";

type Stage = InstanceType<Konva["Stage"]>;
type KLayer = InstanceType<Konva["Layer"]>;
type Transformer = InstanceType<Konva["Transformer"]>;
type Group = InstanceType<Konva["Group"]>;

interface Scene {
  K: Konva;
  stage: Stage;
  content: KLayer;
  tr: Transformer;
}

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const SNAP = 12; // design units (1.2 mm)

/**
 * The editable ticket canvas (PRT-05): click to select, drag to move, handles
 * to resize/rotate, snapping to the ticket's centre and edges. The scene is
 * rebuilt from the design JSON after every change, with the same renderer
 * the PDF uses.
 */
export function DesignCanvas({
  design,
  values,
  selectedId,
  zoom,
  onSelect,
  onChange,
  onEditText,
}: {
  design: TicketDesign;
  values: PlaceholderValues;
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onChange: (next: TicketDesign, key?: string) => void;
  onEditText: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cb = useRef({ design, onSelect, onChange, onEditText });
  const [ready, setReady] = useState(false);
  const [fitWidth, setFitWidth] = useState(0);
  const [assets, setAssets] = useState<RenderAssets | null>(null);

  useEffect(() => {
    cb.current = { design, onSelect, onChange, onEditText };
  }, [design, onSelect, onChange, onEditText]);

  // Create the Konva stage once
  useEffect(() => {
    let cancelled = false;
    let scene: Scene | null = null;
    loadKonva().then((K) => {
      if (cancelled || !hostRef.current) return;
      const stage = new K.Stage({ container: hostRef.current, width: 10, height: 10 });
      const content = new K.Layer();
      stage.add(content);
      const tr = new K.Transformer({
        borderStroke: "#0F9D58",
        borderStrokeWidth: 2,
        anchorStroke: "#0F9D58",
        anchorFill: "#FFFFFF",
        anchorSize: 11,
        anchorCornerRadius: 6,
        rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
        rotationSnapTolerance: 4,
        ignoreStroke: true,
      });
      stage.on("mousedown touchstart", (e) => {
        if (e.target === stage || e.target.name() === "background") cb.current.onSelect(null);
      });
      scene = { K, stage, content, tr };
      sceneRef.current = scene;
      setReady(true);
    });
    return () => {
      cancelled = true;
      scene?.stage.destroy();
      sceneRef.current = null;
    };
  }, []);

  // Fit to the available width
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setFitWidth(Math.max(280, entries[0].contentRect.width - 32)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Images + fonts (cached, so this is quick after the first time)
  useEffect(() => {
    let cancelled = false;
    prepareAssets(design, values).then((a) => {
      if (!cancelled) setAssets(a);
    });
    return () => {
      cancelled = true;
    };
  }, [design, values]);

  // Selection only moves the handles – it must not rebuild the scene, or a
  // drag that starts by selecting a shape would be interrupted.
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
    attachTransformer();
  }, [selectedId, ready]);

  function attachTransformer() {
    const scene = sceneRef.current;
    if (!scene) return;
    const id = selectedRef.current;
    const d = cb.current.design;
    const node = id ? (scene.content.findOne(`#${id}`) as Group | undefined) : undefined;
    const layer = id ? d.layers.find((l) => l.id === id) : undefined;
    if (node && layer) {
      configureTransformer(scene.tr, layer, scene.stage.scaleX());
      scene.tr.nodes([node]);
      scene.tr.moveToTop();
    } else {
      scene.tr.nodes([]);
    }
    scene.content.batchDraw();
  }

  // Draw the scene from the design JSON
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene || !fitWidth) return;
    const { K, stage, content, tr } = scene;
    const scale = (fitWidth / design.width) * zoom;
    stage.size({ width: Math.round(design.width * scale), height: Math.round(design.height * scale) });
    stage.scale({ x: scale, y: scale });

    tr.nodes([]);
    tr.remove();
    content.destroyChildren();
    content.add(backgroundNode(K, design));

    const renderAssets = assets ?? { images: new Map() };
    for (const layer of drawOrder(design.layers)) {
      if (layer.hidden) continue;
      const node = buildLayerNode(K, layer, { values, assets: renderAssets, qrToken: SAMPLE_QR_TOKEN, placeholders: true, designSize: design });
      wireNode(K, scene, node, layer, scale);
      content.add(node);
    }
    content.add(tr);
    attachTransformer();
  }, [ready, design, values, assets, fitWidth, zoom]);

  function wireNode(K: Konva, scene: Scene, node: Group, layer: Layer, scale: number) {
    node.draggable(!layer.locked);
    node.on("mousedown touchstart", () => cb.current.onSelect(layer.id));
    if (layer.type === "text") node.on("dblclick dbltap", () => cb.current.onEditText(layer.id));
    node.on("mouseenter", () => {
      scene.stage.container().style.cursor = layer.locked ? "default" : "move";
    });
    node.on("mouseleave", () => {
      scene.stage.container().style.cursor = "default";
    });

    node.on("dragmove", () => {
      const d = cb.current.design;
      const box = layerBox(layer);
      let x = node.x();
      let y = node.y();
      const guides: number[][] = [];
      if ((layer.rotation ?? 0) === 0) {
        if (Math.abs(x + box.width / 2 - d.width / 2) < SNAP) {
          x = d.width / 2 - box.width / 2;
          guides.push([d.width / 2, 0, d.width / 2, d.height]);
        }
        if (Math.abs(y + box.height / 2 - d.height / 2) < SNAP) {
          y = d.height / 2 - box.height / 2;
          guides.push([0, d.height / 2, d.width, d.height / 2]);
        }
        if (Math.abs(x) < SNAP) x = 0;
        if (Math.abs(y) < SNAP) y = 0;
        if (Math.abs(x + box.width - d.width) < SNAP) x = d.width - box.width;
        if (Math.abs(y + box.height - d.height) < SNAP) y = d.height - box.height;
      }
      if (isProtected(layer)) {
        x = Math.min(Math.max(0, x), d.width - box.width);
        y = Math.min(Math.max(0, y), d.height - box.height);
      }
      node.position({ x, y });
      scene.content.find(".guide").forEach((g) => g.destroy());
      for (const pts of guides) {
        scene.content.add(new K.Line({ name: "guide", points: pts, stroke: "#E11D48", strokeWidth: 1.5 / scale, dash: [8 / scale, 6 / scale], listening: false }));
      }
    });

    node.on("dragend", () => {
      scene.content.find(".guide").forEach((g) => g.destroy());
      const d = cb.current.design;
      cb.current.onChange({
        ...d,
        layers: d.layers.map((l) => (l.id === layer.id ? { ...l, x: Math.round(node.x()), y: Math.round(node.y()) } : l)),
      });
    });

    let anchor: string | null = null;
    node.on("transformstart", () => {
      anchor = scene.tr.getActiveAnchor();
    });
    node.on("transformend", () => {
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      const d = cb.current.design;
      const next = resized(layer, sx, sy, anchor);
      cb.current.onChange({
        ...d,
        layers: d.layers.map((l) =>
          l.id === layer.id ? ({ ...next, x: Math.round(node.x()), y: Math.round(node.y()), rotation: Math.round(node.rotation() * 10) / 10 } as Layer) : l,
        ),
      });
    });
  }

  return (
    <div ref={wrapRef} className="relative flex min-h-48 w-full justify-center overflow-auto rounded-2xl bg-[repeating-conic-gradient(#e2e8f0_0_25%,#f8fafc_0_50%)] bg-[length:20px_20px] p-4">
      <div ref={hostRef} className="shrink-0 shadow-xl ring-1 ring-black/10" />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Loading editor" />
        </div>
      ) : null}
    </div>
  );
}

function configureTransformer(tr: Transformer, layer: Layer, scale: number) {
  const locked = Boolean(layer.locked);
  let anchors: string[] = ["top-left", "top-center", "top-right", "middle-right", "middle-left", "bottom-left", "bottom-center", "bottom-right"];
  let rotate = true;
  let keepRatio = false;
  let min = 20;
  if (layer.type === "brand") {
    // "Ticket partner: TickLO" has a fixed size – it can only be moved (D-040)
    tr.setAttrs({ enabledAnchors: [], rotateEnabled: false, resizeEnabled: false, keepRatio: true });
    return;
  }
  if (layer.type === "qr") {
    anchors = CORNERS;
    rotate = false;
    keepRatio = true;
    min = MIN_QR_SIZE;
  } else if (layer.type === "text") {
    anchors = ["middle-left", "middle-right", ...CORNERS];
    keepRatio = true;
  } else if (layer.type === "line") {
    anchors = ["middle-left", "middle-right"];
  }
  tr.setAttrs({
    enabledAnchors: locked ? [] : anchors,
    rotateEnabled: !locked && rotate,
    resizeEnabled: !locked,
    keepRatio,
    boundBoxFunc: (oldBox: { width: number; height: number }, newBox: { width: number; height: number }) =>
      Math.abs(newBox.width) < min * scale || Math.abs(newBox.height) < 8 * scale ? oldBox : newBox,
  });
}

/** Apply a transformer scale to the layer's real size (we never keep Konva scale). */
function resized(layer: Layer, sx: number, sy: number, anchor: string | null): Layer {
  const r = (n: number) => Math.round(n * 10) / 10;
  switch (layer.type) {
    case "text": {
      const corner = anchor ? CORNERS.includes(anchor) : false;
      return { ...layer, width: r(layer.width * sx), fontSize: corner ? r(Math.max(10, layer.fontSize * sy)) : layer.fontSize };
    }
    case "qr":
      return { ...layer, size: Math.round(Math.max(MIN_QR_SIZE, layer.size * sx)) };
    case "brand":
      return layer; // fixed size
    case "line":
      return { ...layer, width: r(layer.width * sx) };
    default:
      return { ...layer, width: r(layer.width * sx), height: r(layer.height * sy) };
  }
}
