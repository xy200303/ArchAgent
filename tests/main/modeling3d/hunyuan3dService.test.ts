/** Verifies Hunyuan 3D Pro request validation before an SDK job is submitted. */
import { afterEach, describe, expect, it } from "vitest";
import { generateHunyuanGlb } from "../../../src/main/modeling3d/hunyuan3dService";

describe("hunyuan3dService", () => {
  const originalSecretId = process.env.TENCENT_SECRET_ID;
  const originalSecretKey = process.env.TENCENT_SECRET_KEY;
  const originalModel = process.env.HY3_3D_MODEL_VERSION;

  afterEach(() => {
    if (originalSecretId === undefined) delete process.env.TENCENT_SECRET_ID;
    else process.env.TENCENT_SECRET_ID = originalSecretId;
    if (originalSecretKey === undefined) delete process.env.TENCENT_SECRET_KEY;
    else process.env.TENCENT_SECRET_KEY = originalSecretKey;
    if (originalModel === undefined) delete process.env.HY3_3D_MODEL_VERSION;
    else process.env.HY3_3D_MODEL_VERSION = originalModel;
  });

  it("rejects an English text-to-3D prompt before submitting a remote job", async () => {
    await expect(generateHunyuanGlb({
      name: "modern sofa",
      prompt: "A modern three-seat sofa"
    }, process.cwd())).rejects.toThrow("仅支持中文正向提示词");
  });

  it("rejects a prompt combined with an image outside sketch mode", async () => {
    await expect(generateHunyuanGlb({
      name: "现代沙发",
      prompt: "现代三人位沙发",
      imageBase64: "aGVsbG8="
    }, process.cwd())).rejects.toThrow("不能同时提交 prompt 和图片");
  });

  it("rejects the unsupported 3.1 LowPoly combination before submitting", async () => {
    await expect(generateHunyuanGlb({
      name: "现代沙发",
      prompt: "现代三人位沙发",
      model: "3.1",
      generateType: "low_poly"
    }, process.cwd())).rejects.toThrow("3.1 不支持 LowPoly");
  });

  it("requires Tencent Cloud credentials for a valid request", async () => {
    delete process.env.TENCENT_SECRET_ID;
    delete process.env.TENCENT_SECRET_KEY;

    await expect(generateHunyuanGlb({
      name: "现代沙发",
      prompt: "现代三人位沙发"
    }, process.cwd())).rejects.toThrow("TENCENT_SECRET_ID");
  });
});
