import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DISPLAY_NAME, createAppMetadata, formatAppTitle } from "../../src/shared/appMetadata";

const require = createRequire(import.meta.url);
const { isRuntimeResourceSigningTarget } = require("../../scripts/sign-win-skip-runtime.cjs") as {
  isRuntimeResourceSigningTarget: (file: string) => boolean;
};

interface PackageBuildConfig {
  version?: string;
  scripts?: {
    pack?: string;
    dist?: string;
  };
  build?: {
    productName?: string;
    extraResources?: Array<{
      from?: string;
      to?: string;
      filter?: string[];
    }>;
    win?: {
      signtoolOptions?: {
        sign?: string;
      };
    };
  };
}

describe("package config", () => {
  it("keeps the displayed app title and package metadata in sync", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf-8")) as PackageBuildConfig;
    const rendererHtml = await readFile(join(process.cwd(), "src", "renderer", "index.html"), "utf-8");
    const metadata = createAppMetadata(packageJson.version);

    expect(packageJson.build?.productName).toBe(APP_DISPLAY_NAME);
    expect(metadata.title).toBe(formatAppTitle(APP_DISPLAY_NAME, metadata.version));
    expect(metadata.version).toBe(packageJson.version);
    expect(rendererHtml).toContain("<title>%APP_TITLE%</title>");
  });

  it("does not package legacy Word document resources", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf-8")) as PackageBuildConfig;
    const docsResource = packageJson.build?.extraResources?.find(
      (resource) => resource.from === "resources/docs" && resource.to === "docs"
    );

    expect(docsResource).toBeUndefined();
  });

  it("keeps Windows packaging signing configured without signing bundled runtime files", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf-8")) as PackageBuildConfig;
    const signingEnv = "cross-env CSC_IDENTITY_AUTO_DISCOVERY=false CSC_FOR_PULL_REQUEST=false";

    expect(packageJson.scripts?.pack).toContain(`${signingEnv} electron-builder --dir`);
    expect(packageJson.scripts?.dist).toContain(`${signingEnv} electron-builder`);
    expect(packageJson.build?.win?.signtoolOptions?.sign).toBe("./scripts/sign-win-skip-runtime.cjs");
    expect(isRuntimeResourceSigningTarget("release/win-unpacked/resources/runtime/win/pyhton/python.exe")).toBe(true);
    expect(isRuntimeResourceSigningTarget("release/win-unpacked/resources/app.asar.unpacked/native.exe")).toBe(false);
  });
});
