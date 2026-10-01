import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { setBaseUrl } from "@workspace/api-client-react";
import type { ParentDocument } from "@workspace/api-client-react";
import { getApiBase } from "@/lib/api";

export const PARENT_TOKEN_KEY = "np_parent_token";
export const PARENT_CHILD_KEY = "np_parent_child_id";

// Generated calls use the established EXPO_PUBLIC_DOMAIN base.
const base = getApiBase();
if (base) setBaseUrl(base);

export const parentOpts = (token: string | null): { headers: Record<string, string> } => ({
  headers: token ? { "X-Parent-Token": token } : {},
});

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ""}np-parent-docs/`;

export async function clearShareCache() {
  if (Platform.OS === "web") return;
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  } catch {
    // cache may not exist
  }
}

export async function clearParentStorage() {
  await AsyncStorage.multiRemove([PARENT_TOKEN_KEY, PARENT_CHILD_KEY]);
  await clearShareCache();
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
};

/** Keeps a correct provided MIME; falls back to the file extension when missing or generic. */
export function inferMime(name: string, provided?: string | null): string {
  const p = (provided ?? "").toLowerCase().split(";")[0].trim();
  if (p && p !== "application/octet-stream" && Object.values(MIME_BY_EXT).includes(p)) return p;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? (p || "application/octet-stream");
}

export interface PickedFile { uri: string; name: string; mimeType?: string | null }

/**
 * Compatibility note: the generated uploadParentDocument helper appends a web Blob to FormData,
 * which React Native cannot produce from a file URI. This uses native multipart transport
 * ({uri,name,type} part) with the exact generated contract: POST /api/parent/children/{id}/documents,
 * fields file, title?, documentType?, authorizedUploader="true". Token goes in X-Parent-Token header only.
 */
export async function uploadNative(childId: string, token: string, file: PickedFile, title: string, documentType: string): Promise<ParentDocument> {
  const form = new FormData();
  const mime = inferMime(file.name, file.mimeType);
  if (Platform.OS === "web") {
    // React Native Web stringifies {uri,name,type}; fetch the picked file into a real Blob instead.
    const src = await fetch(file.uri);
    const raw = await src.blob();
    form.append("file", new Blob([raw], { type: mime }), file.name);
  } else {
    form.append("file", { uri: file.uri, name: file.name, type: mime } as unknown as Blob);
  }
  if (title.trim()) form.append("title", title.trim());
  if (documentType.trim()) form.append("documentType", documentType.trim());
  form.append("authorizedUploader", "true");
  const res = await fetch(`${getApiBase()}/api/parent/children/${encodeURIComponent(childId)}/documents`, {
    method: "POST",
    headers: { "X-Parent-Token": token },
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `Upload failed (${res.status})`);
  }
  return res.json();
}

/** Downloads authorized bytes to a private cache file using a header (never a URL token), then opens the native share/viewer sheet. */
export async function openDocument(doc: ParentDocument, token: string) {
  if (Platform.OS === "web") {
    const res = await fetch(`${getApiBase()}/api/parent/documents/${encodeURIComponent(doc.id)}/content`, { headers: { "X-Parent-Token": token } });
    if (!res.ok) throw new Error("This document could not be opened.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.fileName;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => undefined);
  const ext = (doc.fileName.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? "").toLowerCase();
  const target = `${CACHE_DIR}${doc.id}${ext}`;
  const res = await FileSystem.downloadAsync(`${getApiBase()}/api/parent/documents/${encodeURIComponent(doc.id)}/content`, target, {
    headers: { "X-Parent-Token": token },
  });
  if (res.status < 200 || res.status >= 300) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    throw new Error("This document could not be opened.");
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
  await Sharing.shareAsync(res.uri, { dialogTitle: doc.title });
}
