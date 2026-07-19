/** Converts legacy UI projections to the authoritative session resource records. */
import { existsSync } from "node:fs";
import { extname } from "node:path";
import type { ArtifactKind, ArtifactSummary, AttachmentRef, ChatSession, SessionResource, SessionResourceKind, SessionResourceSummary } from "../../shared/types";

export function linkSessionResource(session: ChatSession, resourceId: string, now: string): void {
  const links = session.resourceLinks ?? (session.resourceLinks = []);
  if (!links.some((link) => link.resourceId === resourceId)) {
    links.push({ resourceId, confirmed: false, pinned: false, addedAt: now });
  }
}

export function inferSessionResourceKind(fileName: string): SessionResourceKind {
  const extension = extname(fileName).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(extension)) return "image";
  if ([".pdf", ".docx", ".doc", ".odt"].includes(extension)) return "document";
  if ([".csv", ".xlsx", ".xls", ".json", ".jsonl", ".parquet"].includes(extension)) return "table";
  if ([".sqlite", ".db"].includes(extension)) return "database";
  if ([".glb", ".gltf", ".obj", ".stl", ".3mf", ".step", ".iges", ".dxf"].includes(extension)) return "model3d";
  if ([".txt", ".md", ".log"].includes(extension)) return "text";
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(extension)) return "archive";
  return "other";
}

export function getSessionResources(resources: Iterable<SessionResource>, session: ChatSession): SessionResource[] {
  const links = new Map((session.resourceLinks ?? []).map((link) => [link.resourceId, link]));
  return Array.from(resources)
    .flatMap((resource) => {
      if (resource.sessionId !== session.id || !links.has(resource.id)) return [];
      const link = links.get(resource.id)!;
      return [{ ...resource, confirmed: link.confirmed, pinned: link.pinned }];
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function toSessionResourceSummary(resource: SessionResource): SessionResourceSummary {
  const { path: _path, metadata: _metadata, ...summary } = resource;
  return summary;
}

export function inferArtifactKind(fileName: string): ArtifactKind {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (["docx", "pdf", "png", "jpg", "jpeg", "webp", "svg", "json", "md", "txt", "log", "stl", "obj", "glb", "gltf", "3mf", "step", "iges", "dxf"].includes(extension)) {
    return extension as ArtifactKind;
  }
  return "other";
}

export function resourceFromAttachment(attachment: AttachmentRef, projectPath: string): SessionResource | undefined {
  if (!attachment.sessionId) return undefined;
  return {
    id: attachment.id,
    projectPath,
    sessionId: attachment.sessionId,
    name: attachment.name,
    kind: inferSessionResourceKind(attachment.name),
    mimeType: attachment.mimeType,
    size: attachment.size,
    path: attachment.path,
    source: "user_upload",
    parentResourceIds: [],
    metadata: { upload_source: attachment.source },
    status: "ready",
    confirmed: false,
    pinned: false,
    createdAt: attachment.createdAt
  };
}

export function resourceFromArtifact(artifact: ArtifactSummary, projectPath: string): SessionResource | undefined {
  if (!artifact.sessionId) return undefined;
  return {
    id: artifact.id,
    projectPath,
    sessionId: artifact.sessionId,
    name: artifact.name,
    kind: inferSessionResourceKind(artifact.name),
    mimeType: mimeTypeForArtifactKind(artifact.kind),
    size: artifact.size,
    path: artifact.path,
    source: "generated",
    parentResourceIds: [],
    metadata: { artifact_kind: artifact.kind, ...getModelPreviewMetadata(artifact.path) },
    status: "ready",
    confirmed: false,
    pinned: false,
    createdAt: artifact.createdAt
  };
}

function getModelPreviewMetadata(filePath: string): Record<string, string> {
  if (inferSessionResourceKind(filePath) !== "model3d") return {};
  const previewPath = [".png", ".jpg", ".jpeg", ".webp"]
    .map((extension) => `${filePath}.preview${extension}`)
    .find((candidate) => existsSync(candidate));
  return previewPath ? { preview_path: previewPath } : {};
}

function mimeTypeForArtifactKind(kind: ArtifactKind): string {
  if (kind === "png") return "image/png";
  if (kind === "jpg" || kind === "jpeg") return "image/jpeg";
  if (kind === "webp") return "image/webp";
  if (kind === "svg") return "image/svg+xml";
  if (kind === "pdf") return "application/pdf";
  if (kind === "glb") return "model/gltf-binary";
  if (kind === "gltf") return "model/gltf+json";
  if (kind === "obj") return "model/obj";
  if (kind === "stl") return "model/stl";
  if (kind === "json") return "application/json";
  return "application/octet-stream";
}
