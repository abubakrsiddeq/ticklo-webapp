"use client";

import { type RefObject } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Eye,
  EyeOff,
  ImageUp,
  Italic,
  Lock,
  ShieldCheck,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import {
  MIN_QR_SIZE,
  PLACEHOLDERS,
  TOKEN,
  isProtected,
  mm,
  type Fill,
  type Layer,
  type TicketDesign,
} from "@/lib/print/design";
import { TICKET_FONTS } from "@/lib/print/fonts";
import { ColorField, FillField, NumberField, Row, Toggle } from "./fields";

const PT_PER_UNIT = 72 / 254; // 0.1 mm → points

export type LayerPatch = Partial<Layer>;

export function layerLabel(l: Layer): string {
  if (l.name) return l.name;
  if (l.type === "text") {
    const readable = l.text.replace(TOKEN, (m, k: string) => PLACEHOLDERS.find((p) => p.key === k)?.label.replace(/ \(.*\)$/, "") ?? m);
    return readable.replace(/\s+/g, " ").slice(0, 28) || "Text";
  }
  return { image: "Image", rect: "Box", ellipse: "Circle", line: "Line", path: "Shape", qr: "QR code", brand: "TickLO logo", text: "Text" }[l.type];
}

export function PropertiesPanel({
  design,
  layer,
  textRef,
  canUsePoster,
  onLayer,
  onDesign,
  onDelete,
  onDuplicate,
  onOrder,
  onReplaceImage,
}: {
  design: TicketDesign;
  layer: Layer | null;
  textRef: RefObject<HTMLTextAreaElement | null>;
  canUsePoster: boolean;
  onLayer: (patch: LayerPatch, key?: string) => void;
  onDesign: (patch: Partial<TicketDesign>, key?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOrder: (dir: "up" | "down" | "top" | "bottom") => void;
  onReplaceImage: () => void;
}) {
  if (!layer) {
    return (
      <div className="grid gap-4">
        <div>
          <h3 className="font-heading text-sm font-bold text-navy">Ticket</h3>
          <p className="text-xs text-muted-foreground">
            {mm(design.width)} × {mm(design.height)} mm · click anything on the ticket to change it.
          </p>
        </div>
        <Row label="Background">
          <FillField label="Background" value={design.background} onChange={(v) => onDesign({ background: v }, "bg")} />
        </Row>
      </div>
    );
  }

  const set = (patch: LayerPatch, key?: string) => onLayer(patch, key ?? `${layer.id}:${Object.keys(patch).join(",")}`);
  const protectedLayer = isProtected(layer);
  const sizeW = layer.type === "qr" ? layer.size : layer.width;

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-sm font-bold text-navy">{layerLabel(layer)}</h3>
          {protectedLayer ? (
            <p className="flex items-center gap-1 text-xs text-brand-strong">
              <ShieldCheck className="size-3.5" aria-hidden /> Required on every ticket
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Toggle pressed={Boolean(layer.locked)} onClick={() => set({ locked: !layer.locked })} label={layer.locked ? "Unlock" : "Lock position"}>
            {layer.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
          </Toggle>
          {!protectedLayer ? (
            <>
              <Toggle pressed={Boolean(layer.hidden)} onClick={() => set({ hidden: !layer.hidden })} label={layer.hidden ? "Show" : "Hide"}>
                {layer.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Toggle>
              <Toggle pressed={false} onClick={onDuplicate} label="Duplicate">
                <Copy className="size-4" />
              </Toggle>
              <Toggle pressed={false} onClick={onDelete} label="Delete">
                <Trash2 className="size-4 text-destructive" />
              </Toggle>
            </>
          ) : null}
        </div>
      </div>

      {/* Content */}
      {layer.type === "text" ? (
        <div className="grid gap-2">
          <Textarea
            ref={textRef}
            value={layer.text}
            rows={3}
            maxLength={1000}
            aria-label="Text"
            onChange={(e) => set({ text: e.target.value }, `${layer.id}:text`)}
            className="text-sm"
            dir="auto"
          />
          <NativeSelect
            aria-label="Insert event detail"
            value=""
            className="h-9 text-sm"
            onChange={(e) => {
              if (!e.target.value) return;
              set({ text: `${layer.text}${layer.text && !layer.text.endsWith(" ") ? " " : ""}{{${e.target.value}}}` });
            }}
          >
            <option value="">+ Insert event detail…</option>
            {PLACEHOLDERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
          <Row label="Font">
            <NativeSelect aria-label="Font" value={layer.fontFamily} className="h-9 text-sm" onChange={(e) => set({ fontFamily: e.target.value })}>
              {TICKET_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </Row>
          <Row label="Size">
            <NumberField label="Font size" value={Math.round(layer.fontSize * PT_PER_UNIT * 10) / 10} step={1} min={3} suffix="pt" onChange={(v) => set({ fontSize: Math.max(10, v / PT_PER_UNIT) })} />
          </Row>
          <Row label="Colour">
            <ColorField label="Text colour" value={layer.fill} onChange={(v) => set({ fill: v })} />
          </Row>
          <Row label="Style">
            <div className="flex flex-wrap gap-1">
              <Toggle pressed={(layer.align ?? "left") === "left"} onClick={() => set({ align: "left" })} label="Align left">
                <AlignLeft className="size-4" />
              </Toggle>
              <Toggle pressed={layer.align === "center"} onClick={() => set({ align: "center" })} label="Align centre">
                <AlignCenter className="size-4" />
              </Toggle>
              <Toggle pressed={layer.align === "right"} onClick={() => set({ align: "right" })} label="Align right">
                <AlignRight className="size-4" />
              </Toggle>
              <Toggle pressed={Boolean(layer.italic)} onClick={() => set({ italic: !layer.italic })} label="Italic">
                <Italic className="size-4" />
              </Toggle>
              <Toggle pressed={Boolean(layer.uppercase)} onClick={() => set({ uppercase: !layer.uppercase })} label="All capitals">
                AA
              </Toggle>
            </div>
          </Row>
          <Row label="Spacing">
            <NumberField label="Letter spacing" value={layer.letterSpacing ?? 0} step={1} onChange={(v) => set({ letterSpacing: v })} />
          </Row>
          <Row label="Line height">
            <NumberField label="Line height" value={layer.lineHeight ?? 1.15} step={0.05} min={0.5} max={3} onChange={(v) => set({ lineHeight: v })} />
          </Row>
          <Row label="Auto-shrink">
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <Toggle
                pressed={Boolean(layer.fitHeight)}
                onClick={() => set({ fitHeight: layer.fitHeight ? undefined : Math.round(layer.fontSize * (layer.lineHeight ?? 1.15) * 2) })}
                label="Make long text smaller so it fits"
              >
                {layer.fitHeight ? "On" : "Off"}
              </Toggle>
              {layer.fitHeight ? (
                <NumberField label="Maximum text height" value={mm(layer.fitHeight)} step={1} min={1} suffix="mm" onChange={(v) => set({ fitHeight: Math.max(10, v * 10) })} />
              ) : (
                <span className="text-xs text-muted-foreground">for long event names</span>
              )}
            </div>
          </Row>
          <Row label="Outline">
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <ColorField label="Outline colour" value={layer.stroke ?? "#000000"} onChange={(v) => set({ stroke: v, strokeWidth: layer.strokeWidth || 2 })} />
              <NumberField label="Outline width" value={layer.strokeWidth ?? 0} min={0} max={50} onChange={(v) => set({ strokeWidth: v })} />
            </div>
          </Row>
        </div>
      ) : null}

      {layer.type === "rect" || layer.type === "ellipse" || layer.type === "path" ? (
        <div className="grid gap-2">
          <Row label="Fill">
            <FillField label="Fill" value={layer.fill} onChange={(v: Fill) => set({ fill: v })} />
          </Row>
          <Row label="Border">
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <ColorField label="Border colour" value={layer.stroke ?? "#000000"} onChange={(v) => set({ stroke: v, strokeWidth: layer.strokeWidth || 4 })} />
              <NumberField label="Border width" value={layer.strokeWidth ?? 0} min={0} max={200} onChange={(v) => set({ strokeWidth: v })} />
            </div>
          </Row>
          {layer.type === "rect" ? (
            <>
              <Row label="Corners">
                <NumberField label="Corner radius" value={mm(layer.cornerRadius ?? 0)} step={0.5} min={0} suffix="mm" onChange={(v) => set({ cornerRadius: Math.max(0, v * 10) })} />
              </Row>
              <Row label="Dashed">
                <Toggle pressed={Boolean(layer.dash?.length)} onClick={() => set({ dash: layer.dash?.length ? undefined : [16, 10] })} label="Dashed border">
                  {layer.dash?.length ? "On" : "Off"}
                </Toggle>
              </Row>
            </>
          ) : null}
        </div>
      ) : null}

      {layer.type === "line" ? (
        <div className="grid gap-2">
          <Row label="Colour">
            <ColorField label="Line colour" value={layer.stroke} onChange={(v) => set({ stroke: v })} />
          </Row>
          <Row label="Thickness">
            <NumberField label="Thickness" value={mm(layer.strokeWidth)} step={0.1} min={0.1} suffix="mm" onChange={(v) => set({ strokeWidth: Math.max(0.5, v * 10) })} />
          </Row>
          <Row label="Style">
            <div className="flex gap-1">
              <Toggle pressed={Boolean(layer.dash?.length)} onClick={() => set({ dash: layer.dash?.length ? undefined : [14, 12] })} label="Dashed">
                Dashed
              </Toggle>
              <Toggle pressed={layer.lineCap === "round"} onClick={() => set({ lineCap: layer.lineCap === "round" ? "butt" : "round" })} label="Round ends">
                Round
              </Toggle>
            </div>
          </Row>
        </div>
      ) : null}

      {layer.type === "image" ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onReplaceImage}>
              <ImageUp /> Replace image
            </Button>
            {layer.src !== "{{logo}}" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => set({ src: "{{logo}}", fit: "contain" })}>
                Use society logo
              </Button>
            ) : null}
            {canUsePoster && layer.src !== "{{poster}}" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => set({ src: "{{poster}}" })}>
                Use event poster
              </Button>
            ) : null}
          </div>
          <Row label="Fit">
            <NativeSelect aria-label="Image fit" value={layer.fit ?? "cover"} className="h-9 text-sm" onChange={(e) => set({ fit: e.target.value as "cover" | "contain" | "stretch" })}>
              <option value="cover">Fill the box (crop)</option>
              <option value="contain">Show whole image</option>
              <option value="stretch">Stretch</option>
            </NativeSelect>
          </Row>
          <Row label="Corners">
            <NumberField label="Corner radius" value={mm(layer.cornerRadius ?? 0)} step={0.5} min={0} suffix="mm" onChange={(v) => set({ cornerRadius: Math.max(0, v * 10) })} />
          </Row>
          <Row label="Plate">
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <Toggle pressed={Boolean(layer.plate)} onClick={() => set({ plate: layer.plate ? undefined : "#FFFFFF" })} label="Coloured plate behind the image">
                {layer.plate ? "On" : "Off"}
              </Toggle>
              {layer.plate ? <ColorField label="Plate colour" value={layer.plate} onChange={(v) => set({ plate: v })} /> : <span className="text-xs text-muted-foreground">e.g. white circle behind a logo</span>}
            </div>
          </Row>
          {layer.src === "{{logo}}" ? (
            <p className="text-xs text-muted-foreground">Shows your society logo (Settings → logo). If there is no logo, nothing is printed here.</p>
          ) : null}
        </div>
      ) : null}

      {layer.type === "qr" ? (
        <div className="grid gap-2">
          <p className="rounded-lg bg-brand-soft p-2 text-xs text-brand-strong">
            Every ticket gets its own QR code and serial number. Keep it at least {mm(MIN_QR_SIZE)} mm wide on a light background.
          </p>
          <Row label="Colour">
            <ColorField label="QR colour" value={layer.dark ?? "#000000"} onChange={(v) => set({ dark: v })} />
          </Row>
          <Row label="Serial no.">
            <Toggle pressed={layer.caption !== false} onClick={() => set({ caption: layer.caption === false })} label="Serial number under the QR">
              {layer.caption === false ? "Hidden" : "Shown"}
            </Toggle>
          </Row>
        </div>
      ) : null}

      {layer.type === "brand" ? (
        <div className="grid gap-2">
          <p className="rounded-lg bg-brand-soft p-2 text-xs text-brand-strong">
            &quot;Ticket partner: TickLO&quot; is on every TickLO ticket at a fixed size (29 mm). You can move it anywhere on the ticket and pick the version that is
            readable on your background.
          </p>
          <Row label="Version">
            <NativeSelect aria-label="Logo version" value={layer.variant ?? "light"} className="h-9 text-sm" onChange={(e) => set({ variant: e.target.value as "light" | "dark" })}>
              <option value="light">For light backgrounds</option>
              <option value="dark">For dark backgrounds</option>
            </NativeSelect>
          </Row>
        </div>
      ) : null}

      {/* Position & size */}
      <div className="grid gap-2 border-t pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Row label="X" className="grid-cols-[20px_1fr]">
            <NumberField label="X position" value={mm(layer.x)} step={0.5} suffix="mm" onChange={(v) => set({ x: Math.round(v * 10) })} />
          </Row>
          <Row label="Y" className="grid-cols-[20px_1fr]">
            <NumberField label="Y position" value={mm(layer.y)} step={0.5} suffix="mm" onChange={(v) => set({ y: Math.round(v * 10) })} />
          </Row>
          {layer.type !== "brand" ? (
          <Row label="W" className="grid-cols-[20px_1fr]">
            <NumberField
              label="Width"
              value={mm(sizeW)}
              step={0.5}
              suffix="mm"
              onChange={(v) => {
                const u = Math.round(v * 10);
                if (layer.type === "qr") set({ size: Math.max(MIN_QR_SIZE, u) } as LayerPatch);
                else set({ width: Math.max(1, u) });
              }}
            />
          </Row>
          ) : null}
          {layer.type !== "text" && layer.type !== "line" && layer.type !== "qr" && layer.type !== "brand" ? (
            <Row label="H" className="grid-cols-[20px_1fr]">
              <NumberField label="Height" value={mm(layer.height)} step={0.5} suffix="mm" onChange={(v) => set({ height: Math.max(1, Math.round(v * 10)) })} />
            </Row>
          ) : null}
        </div>
        {!protectedLayer ? (
          <Row label="Rotation">
            <NumberField label="Rotation" value={layer.rotation ?? 0} step={5} suffix="°" onChange={(v) => set({ rotation: v })} />
          </Row>
        ) : null}
        {layer.type !== "brand" ? (
        <Row label="Opacity">
          <input
            type="range"
            min={protectedLayer ? 60 : 0}
            max={100}
            value={Math.round((layer.opacity ?? 1) * 100)}
            onChange={(e) => set({ opacity: Number(e.target.value) / 100 })}
            aria-label="Opacity"
            className="w-full accent-[#0F9D58]"
          />
        </Row>
        ) : null}
        {!protectedLayer ? (
          <Row label="Order">
            <div className="flex gap-1">
              <Toggle pressed={false} onClick={() => onOrder("top")} label="Bring to front">
                <ChevronsUp className="size-4" />
              </Toggle>
              <Toggle pressed={false} onClick={() => onOrder("up")} label="Bring forward">
                <ArrowUp className="size-4" />
              </Toggle>
              <Toggle pressed={false} onClick={() => onOrder("down")} label="Send backward">
                <ArrowDown className="size-4" />
              </Toggle>
              <Toggle pressed={false} onClick={() => onOrder("bottom")} label="Send to back">
                <ChevronsDown className="size-4" />
              </Toggle>
            </div>
          </Row>
        ) : null}
      </div>
    </div>
  );
}
