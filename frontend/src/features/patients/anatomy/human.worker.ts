// Meshing the body takes ~0.5 s, so it runs off the main thread.
import { humanMesh } from "./human";

self.onmessage = () => {
  const mesh = humanMesh();
  (self as unknown as Worker).postMessage(mesh, [mesh.positions.buffer, mesh.index.buffer]);
};
