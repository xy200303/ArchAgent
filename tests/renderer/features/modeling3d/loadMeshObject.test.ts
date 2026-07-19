import { describe, expect, it } from "vitest";
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { normalizeMeshObjectForScene } from "../../../../src/renderer/src/features/modeling3d/scene/loadMeshObject";

describe("normalizeMeshObjectForScene", () => {
  it("fits a mesh to its requested metre dimensions and keeps it on the floor", () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 8), new MeshStandardMaterial());
    const object = normalizeMeshObjectForScene(mesh, [0.3, 0.6, 1.2]);
    const bounds = new Box3().setFromObject(object);
    const size = bounds.getSize(new Vector3());

    expect(size.x).toBeCloseTo(0.3);
    expect(size.y).toBeCloseTo(0.6);
    expect(size.z).toBeCloseTo(1.2);
    expect(bounds.min.y).toBeCloseTo(0);
  });
});
