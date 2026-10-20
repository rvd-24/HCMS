// Lazy-loaded so three.js only downloads when a patient profile is opened.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BodyFigure } from "@/components/BodyFigure";
import { AnatomyScene, type AnatomyView, type SceneCallbacks } from "./scene";

export interface AnatomyCanvasHandle {
  zoom: (factor: number) => void;
  reset: () => void;
}

interface Props extends SceneCallbacks {
  view: AnatomyView;
  marked: number[];
  selected: number | null;
  hotspot: string | null;
  insetRight: number;
}

const AnatomyCanvas = forwardRef<AnatomyCanvasHandle, Props>(function AnatomyCanvas(
  { view, marked, selected, hotspot, insetRight, onHover, onSelect, onHotspot },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<AnatomyScene | null>(null);
  const cb = useRef<SceneCallbacks>({ onHover, onSelect, onHotspot });
  cb.current = { onHover, onSelect, onHotspot };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current || !overlay.current) return;
    try {
      scene.current = new AnatomyScene(host.current, overlay.current, {
        onHover: (...a) => cb.current.onHover(...a),
        onSelect: (...a) => cb.current.onSelect(...a),
        onHotspot: (...a) => cb.current.onHotspot(...a),
      });
    } catch {
      setFailed(true); // no WebGL — fall back to the flat illustration
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => scene.current?.setView(view), [view]);
  useEffect(() => scene.current?.setMarked(marked), [marked]);
  useEffect(() => scene.current?.setSelected(selected), [selected]);
  useEffect(() => scene.current?.setHotspot(hotspot), [hotspot]);
  useEffect(() => scene.current?.setInsetRight(insetRight), [insetRight]);

  useImperativeHandle(ref, () => ({
    zoom: (f) => scene.current?.zoom(f),
    reset: () => scene.current?.reset(),
  }));

  if (failed) return <BodyFigure className="mx-auto h-full max-h-[460px]" />;
  return (
    <div className="relative h-full w-full animate-fade-in">
      <div ref={host} className="absolute inset-0" />
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
});

export default AnatomyCanvas;
