/** Verifies Hunyuan 3D Pro request validation before an SDK job is submitted. */
import { afterEach, describe, expect, it } from "vitest";
import { assertSingleEntityAsset, buildSingleEntityPrompt, generateHunyuanGlb } from "../../../src/main/modeling3d/hunyuan3dService";

describe("hunyuan3dService", () => {
  const originalApiKey = process.env.HY3_API_KEY;
  const originalModel = process.env.HY3_3D_MODEL;

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.HY3_API_KEY;
    else process.env.HY3_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.HY3_3D_MODEL;
    else process.env.HY3_3D_MODEL = originalModel;
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

  it("rejects architecture and mixed-scene requests before submitting a 3D job", async () => {
    await expect(generateHunyuanGlb({
      name: "内部隔墙",
      prompt: "主卧与次卧之间的内部隔墙，包含房间布局"
    }, process.cwd())).rejects.toThrow("只支持单个独立实体");
  });

  it("rejects functional labels and composite asset names before submitting a 3D job", () => {
    expect(() => assertSingleEntityAsset("入口标识", "用于北侧外墙入口定位")).toThrow("可单独摆放的具体实物");
    expect(() => assertSingleEntityAsset("门、人物和地面箭头", "深蓝色低模")).toThrow("明确它们构成一个完整互动组合");
    expect(() => assertSingleEntityAsset("单扇入户门", "放置于北侧外墙中点")).toThrow("不能包含摆放位置");
    expect(() => assertSingleEntityAsset("站立人物", "蓝色工装、低多边形风格、双臂自然下垂")).not.toThrow();
    expect(() => assertSingleEntityAsset("人物与单椅", "人物坐在单椅上，蓝色工装，低多边形风格")).not.toThrow();
  });

  it("returns the matched prompt term without rejecting a bare descriptive word", () => {
    expect(() => assertSingleEntityAsset("展示灯", "现代简约风格，适合多种用途")).not.toThrow();
    expect(() => assertSingleEntityAsset("展示灯", "放置于北侧墙边")).toThrow("命中摆放或场景上下文词“放置”");
    expect(() => assertSingleEntityAsset("展示灯", "用于入口导向")).toThrow("命中“用于”");
  });

  it("builds a provider prompt that separates one asset from placement semantics", () => {
    const prompt = buildSingleEntityPrompt("单扇深蓝色入户门", "深蓝色木门，银色把手，低多边形风格");

    expect(prompt).toContain("目标资产：单扇深蓝色入户门");
    expect(prompt).toContain("摆放位置、朝向、用途、场景和工作流仅由场景工具处理");
    expect(prompt).toContain("明确且完整的互动");
  });

  it("rejects an unsupported TokenHub 3D model before submitting", async () => {
    process.env.HY3_API_KEY = "test-key";
    process.env.HY3_3D_MODEL = "unsupported";

    await expect(generateHunyuanGlb({
      name: "现代沙发",
      prompt: "现代三人位沙发"
    }, process.cwd())).rejects.toThrow("HY3_3D_MODEL");
  });

  it("requires the unified TokenHub API key for a valid request", async () => {
    delete process.env.HY3_API_KEY;

    await expect(generateHunyuanGlb({
      name: "现代沙发",
      prompt: "现代三人位沙发"
    }, process.cwd())).rejects.toThrow("HY3_API_KEY");
  });
});
