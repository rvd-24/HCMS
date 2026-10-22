// Lazy-loaded so three.js only downloads when a patient profile is opened.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ToothStatus } from "@/lib/teeth";
import { AnatomyScene, type AnatomyView, type SceneCallbacks } from "./scene";

export interface AnatomyCanvasHandle {
  zoom: (factor: number) => void;
  reset: () => void;
}

interface Props extends SceneCallbacks {
  view: AnatomyView;
  /** Charting status per FDI tooth. */
  statuses: [number, ToothStatus][];
  selected: number | null;
  insetRight: number;
}

const AnatomyCanvas = forwardRef<AnatomyCanvasHandle, Props>(function AnatomyCanvas(
  { view, statuses, selected, insetRight, onHover, onSelect },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<AnatomyScene | null>(null);
  const cb = useRef<SceneCallbacks>({ onHover, onSelect });
  cb.current = { onHover, onSelect };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current || !overlay.current) return;
    try {
      scene.current = new AnatomyScene(host.current, overlay.current, {
        onHover: (...a) => cb.current.onHover(...a),
        onSelect: (...a) => cb.current.onSelect(...a),
      });
    } catch {
      setFailed(true); // no WebGL
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => scene.current?.setView(view), [view]);
  useEffect(() => scene.current?.setStatuses(statuses), [statuses]);
  useEffect(() => scene.current?.setSelected(selected), [selected]);
  useEffect(() => scene.current?.setInsetRight(insetRight), [insetRight]);

  useImperativeHandle(ref, () => ({
    zoom: (f) => scene.current?.zoom(f),
    reset: () => scene.current?.reset(),
  }));

  if (failed)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-faint">
        The 3D mouth model needs WebGL, which this browser has switched off. The teeth named in the notes are listed above.
      </div>
    );
  return (
    <div className="relative h-full w-full animate-fade-in">
      <div ref={host} className="absolute inset-0" />
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
});

export default AnatomyCanvas;
