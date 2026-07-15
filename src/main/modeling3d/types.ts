/** Shared request and result types for parameterized 3D generation adapters. */
export interface RunJscadScriptInput {
  /** JSCAD 建模脚本内容（ESM 格式，默认导出 createGeometry() 函数） */
  script: string;
  /** 输出文件名（不含扩展名） */
  outputName: string;
  /** 输出格式：stl（默认）| obj */
  format?: "stl" | "obj";
}

export interface RunJscadScriptResult {
  modelPath: string;
  scriptPath: string;
  format: "stl" | "obj";
  triangleCount?: number;
}

export interface ImageTo3dInput {
  /** 输入图片路径（项目内相对路径或绝对路径） */
  imagePath: string;
  /** 输出文件名（不含扩展名） */
  outputName: string;
}

export interface ImageTo3dResult {
  modelPath: string;
  format: "glb" | "obj";
}

export interface Export3dModelInput {
  /** 源模型路径 */
  sourcePath: string;
  /** 目标格式 */
  targetFormat: "stl" | "obj" | "glb";
  /** 输出文件名（不含扩展名），默认与源文件同名 */
  outputName?: string;
}

export interface Export3dModelResult {
  outputPath: string;
  format: "stl" | "obj" | "glb";
}
