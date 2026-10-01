import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiBase, getAuthHeaders } from "@/lib/api";

type DocumentRecord = {
  id: string;
  title?: string | null;
  fileName?: string | null;
  category?: string | null;
  createdDate?: string | null;
  createdAt?: string | null;
  mimeType?: string | null;
  contentType?: string | null;
  file_name?: string | null;
  created_date?: string | null;
  created_at?: string | null;
};

type PickedDocument = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  webFile?: Blob | null;
};

type DocumentLibraryProps = {
  childId?: string | null;
  clinician?: boolean;
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_PICKER_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
];
const ALLOWED_FILE_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "txt",
  "csv",
]);
const ALLOWED_FILE_MIME_TYPES = new Set([
  ...ALLOWED_PICKER_TYPES,
  "text/csv",
]);

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

async function responseError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  if (body) {
    try {
      const data = JSON.parse(body) as { error?: string; message?: string };
      if (data.error || data.message) {
        return new Error(data.error || data.message);
      }
    } catch {
      // Keep a concise fallback for non-JSON API errors.
    }
  }
  return new Error(`Request failed (${response.status}). Please try again.`);
}

function normalizeDocument(value: DocumentRecord): DocumentRecord {
  return {
    ...value,
    fileName: value.fileName ?? value.file_name ?? null,
    createdDate:
      value.createdDate ??
      value.created_date ??
      value.createdAt ??
      value.created_at ??
      null,
  };
}

function isSupportedFile(file: PickedDocument) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.mimeType?.split(";")[0].trim().toLowerCase() ?? "";
  const extensionAllowed = ALLOWED_FILE_EXTENSIONS.has(extension);
  const mimeTypeAllowed = ALLOWED_FILE_MIME_TYPES.has(mimeType);
  if (extension && !extensionAllowed) return false;
  if (mimeType && !mimeTypeAllowed) return false;
  return extensionAllowed || mimeTypeAllowed;
}

function formatDate(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mimeTypeFor(fileName: string, provided?: string | null) {
  if (provided) return provided;
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "txt") return "text/plain";
  if (extension === "csv") return "text/csv";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function safeFileName(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "document";
}

function categoryIcon(category?: string | null): React.ComponentProps<
  typeof Feather
>["name"] {
  const value = category?.toLowerCase() ?? "";
  if (value.includes("plan")) return "clipboard";
  if (value.includes("report")) return "bar-chart-2";
  if (value.includes("form")) return "file";
  return "file-text";
}

export default function DocumentLibrary({
  childId,
  clinician = false,
}: DocumentLibraryProps) {
  const colors = useColors();
  const [selectedFile, setSelectedFile] = useState<PickedDocument | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [authorizedUploader, setAuthorizedUploader] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setSelectedFile(null);
    setTitle("");
    setCategory("");
    setAuthorizedUploader(false);
    setActionError("");
    setNotice("");
  }, [childId, clinician]);

  const documentsQuery = useQuery<DocumentRecord[]>({
    queryKey: ["document-library", clinician ? "clinician" : "parent", childId],
    enabled: !!childId,
    queryFn: async () => {
      const path = clinician
        ? `/documents?child_id=${encodeURIComponent(childId ?? "")}`
        : "/mobile/documents";
      const response = await apiRequest(path);
      if (!response.ok) throw await responseError(response);
      const documents = await response.json();
      if (!Array.isArray(documents)) {
        throw new Error("The document list could not be read. Please retry.");
      }
      return (documents as DocumentRecord[]).map(normalizeDocument);
    },
  });

  const chooseFile = async () => {
    setActionError("");
    setNotice("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const webFile = (asset as typeof asset & { file?: Blob }).file ?? null;
      const file: PickedDocument = {
        uri: asset.uri,
        name: asset.name || "document",
        mimeType: asset.mimeType,
        size: asset.size,
        webFile,
      };
      if (!isSupportedFile(file)) {
        setSelectedFile(null);
        setTitle("");
        setActionError(
          "Unsupported file type. Choose a PDF, JPEG, PNG, or UTF-8 TXT/CSV file.",
        );
        return;
      }
      if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
        setSelectedFile(null);
        setTitle("");
        setActionError("This file is larger than the 20 MiB upload limit.");
        return;
      }
      setSelectedFile(file);
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      setActionError(`Could not select that file. ${errorMessage(error)}`);
    }
  };

  const uploadDocument = async () => {
    if (!childId) {
      setActionError("Choose a client before uploading a document.");
      return;
    }
    if (!selectedFile) {
      setActionError("Select a PDF, image, or text file to upload.");
      return;
    }
    if (!isSupportedFile(selectedFile)) {
      setActionError(
        "Unsupported file type. Choose a PDF, JPEG, PNG, or UTF-8 TXT/CSV file.",
      );
      return;
    }
    if (
      typeof selectedFile.size === "number" &&
      selectedFile.size > MAX_UPLOAD_BYTES
    ) {
      setActionError("This file is larger than the 20 MiB upload limit.");
      return;
    }
    if (!authorizedUploader) {
      setActionError("Confirm that you are authorized to upload this document.");
      return;
    }
    if (!title.trim()) {
      setActionError("Add a title for this document.");
      return;
    }

    setUploading(true);
    setActionError("");
    setNotice("");
    try {
      const form = new FormData();
      if (Platform.OS === "web") {
        let fileBlob = selectedFile.webFile;
        if (!fileBlob) {
          const fileResponse = await fetch(selectedFile.uri);
          if (!fileResponse.ok) {
            throw new Error("The selected file is no longer available.");
          }
          fileBlob = await fileResponse.blob();
        }
        form.append("file", fileBlob, selectedFile.name);
      } else {
        const uploadAsset = {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: mimeTypeFor(selectedFile.name, selectedFile.mimeType),
        };
        form.append("file", uploadAsset as unknown as Blob);
      }
      form.append("title", title.trim());
      form.append("category", category.trim() || "other");
      form.append("authorized_uploader", "true");
      // Redundant for parents: the server authorizes the header selection and
      // rejects a mismatch, so an in-flight upload cannot move to a new sibling.
      form.append("child_id", childId);

      const response = await apiRequest("/mobile/documents/upload", {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw await responseError(response);
      const saved = (await response.json().catch(() => null)) as
        | DocumentRecord
        | null;
      if (!saved || typeof saved.id !== "string") {
        throw new Error(
          "The upload response was incomplete. Please refresh before trying again.",
        );
      }

      setSelectedFile(null);
      setAuthorizedUploader(false);
      setNotice("Document uploaded.");
      await documentsQuery.refetch();
    } catch (error) {
      setActionError(`Upload failed. ${errorMessage(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const openDocument = async (document: DocumentRecord) => {
    const popup =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.open("", "_blank")
        : null;
    setOpeningId(document.id);
    setActionError("");
    setNotice("");

    try {
      const contentPath = `/mobile/documents/${encodeURIComponent(
        document.id,
      )}/content`;

      if (Platform.OS === "web") {
        const response = await apiRequest(contentPath);
        if (!response.ok) throw await responseError(response);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (popup) {
          popup.opener = null;
          popup.location.href = objectUrl;
        } else {
          const anchor = window.document.createElement("a");
          anchor.href = objectUrl;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.click();
        }
        // Keep the URL alive long enough for the browser tab or download flow
        // to finish consuming it.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        return;
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Document sharing is unavailable on this device.");
      }
      const base = getApiBase();
      if (!base) {
        throw new Error("The secure document service is unavailable.");
      }
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) {
        throw new Error("Private document storage is unavailable.");
      }

      const directory = `${cacheDirectory}document-library/`;
      const directoryInfo = await FileSystem.getInfoAsync(directory);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      }
      const fileName = safeFileName(
        document.fileName || document.title || "document",
      );
      const destination = `${directory}${Date.now()}-${fileName}`;
      const contentUrl = `${base}/api${contentPath}`;
      let result: FileSystem.FileSystemDownloadResult;
      try {
        result = await FileSystem.downloadAsync(contentUrl, destination, {
          headers: await getAuthHeaders(),
        });
      } catch (error) {
        await FileSystem.deleteAsync(destination, { idempotent: true }).catch(
          () => undefined,
        );
        throw error;
      }
      if (result.status < 200 || result.status >= 300) {
        const errorBody = await FileSystem.readAsStringAsync(result.uri).catch(
          () => "",
        );
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(
          () => undefined,
        );
        let message = `Document download failed (${result.status}).`;
        try {
          const parsed = JSON.parse(errorBody) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // Use the HTTP status when the server response is not JSON.
        }
        throw new Error(message);
      }

      const responseContentType = Object.entries(result.headers ?? {}).find(
        ([name]) => name.toLowerCase() === "content-type",
      )?.[1]
        ?.split(";")[0]
        .trim();
      const mimeType = mimeTypeFor(
        fileName,
        responseContentType || document.contentType || document.mimeType,
      );
      try {
        await Sharing.shareAsync(result.uri, {
          mimeType,
          dialogTitle: `Open ${document.title || fileName}`,
          UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : undefined,
        });
        // Android may resolve the chooser promise before a receiving app has
        // finished reading the shared file, so defer private-cache cleanup.
        setTimeout(() => {
          void FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(
            () => undefined,
          );
        }, 120_000);
      } catch (error) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(
          () => undefined,
        );
        throw error;
      }
    } catch (error) {
      popup?.close();
      setActionError(`Could not open this document. ${errorMessage(error)}`);
    } finally {
      setOpeningId(null);
    }
  };

  const refresh = () => {
    setActionError("");
    setNotice("");
    void documentsQuery.refetch();
  };

  const styles = StyleSheet.create({
    container: { gap: 18 },
    heading: { marginBottom: 1 },
    headingTitle: {
      color: colors.foreground,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "700",
      fontFamily: "Inter_700Bold",
    },
    headingSub: {
      color: colors.mutedForeground,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
      fontFamily: "Inter_400Regular",
    },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: colors.radius + 4,
      padding: 16,
    },
    sectionTitle: {
      color: colors.foreground,
      fontSize: 16,
      fontWeight: "700",
      fontFamily: "Inter_700Bold",
    },
    helper: {
      color: colors.mutedForeground,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 5,
      fontFamily: "Inter_400Regular",
    },
    picker: {
      minHeight: 54,
      marginTop: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: colors.background,
    },
    pickerIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    pickerText: {
      color: colors.foreground,
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      fontFamily: "Inter_600SemiBold",
    },
    pickerHint: {
      color: colors.mutedForeground,
      fontSize: 11,
      marginTop: 3,
      fontFamily: "Inter_400Regular",
    },
    label: {
      color: colors.mutedForeground,
      fontSize: 10,
      letterSpacing: 0.9,
      fontWeight: "700",
      marginTop: 14,
      fontFamily: "Inter_700Bold",
    },
    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      backgroundColor: colors.background,
      color: colors.foreground,
      fontSize: 14,
      paddingHorizontal: 12,
      marginTop: 6,
      fontFamily: "Inter_400Regular",
    },
    attestation: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginTop: 15,
      paddingVertical: 3,
    },
    checkbox: {
      width: 22,
      height: 22,
      marginTop: 1,
      borderWidth: 1,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    attestationText: {
      flex: 1,
      color: colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "Inter_400Regular",
    },
    uploadButton: {
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 15,
      paddingHorizontal: 14,
    },
    uploadButtonText: {
      color: colors.primaryForeground,
      fontSize: 14,
      fontWeight: "700",
      fontFamily: "Inter_700Bold",
    },
    error: {
      borderWidth: 1,
      borderColor: colors.destructive,
      borderRadius: 11,
      backgroundColor: colors.card,
      padding: 12,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
    },
    errorText: {
      color: colors.destructive,
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "Inter_400Regular",
    },
    notice: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 10,
      fontFamily: "Inter_600SemiBold",
    },
    listHeading: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    refreshButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    loading: {
      minHeight: 130,
      alignItems: "center",
      justifyContent: "center",
      gap: 11,
    },
    stateText: {
      color: colors.mutedForeground,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
    },
    stateCard: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 28,
      paddingHorizontal: 20,
      gap: 9,
    },
    retryButton: {
      minHeight: 40,
      borderRadius: 10,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      marginTop: 5,
    },
    retryText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontWeight: "700",
      fontFamily: "Inter_700Bold",
    },
    documentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 13,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 13,
      backgroundColor: colors.card,
      marginBottom: 9,
    },
    documentIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    documentTitle: {
      color: colors.foreground,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "600",
      fontFamily: "Inter_600SemiBold",
    },
    documentMeta: {
      color: colors.mutedForeground,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
      fontFamily: "Inter_400Regular",
    },
    openButton: {
      minWidth: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
  });

  const refreshing = documentsQuery.isFetching;
  const listError = documentsQuery.isError && !documentsQuery.data;

  return (
    <View style={styles.container} testID="document-library">
      <View style={styles.heading}>
        <Text style={styles.headingTitle}>Documents</Text>
        <Text style={styles.headingSub}>
          {clinician
            ? "Secure files for this client"
            : "Treatment plans and materials shared with your family"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          {clinician ? "Add a client document" : "Upload a document"}
        </Text>
        <Text style={styles.helper}>
          PDF, JPEG, PNG, or UTF-8 TXT/CSV · Maximum 20 MiB
        </Text>

        <Pressable
          testID="document-file-picker"
          accessibilityRole="button"
          accessibilityState={{ disabled: uploading }}
          disabled={uploading}
          accessibilityLabel={
            selectedFile
              ? `Selected file ${selectedFile.name}. Choose a different file`
              : "Choose a PDF, image, or text file"
          }
          onPress={chooseFile}
          style={styles.picker}
        >
          <View style={styles.pickerIcon}>
            <Feather
              name={selectedFile ? "file-text" : "upload"}
              size={17}
              color={colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerText} numberOfLines={1}>
              {selectedFile?.name || "Choose a file"}
            </Text>
            <Text style={styles.pickerHint}>
              {selectedFile?.size
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Tap to change`
                : "PDF · JPEG · PNG · TXT/CSV"}
            </Text>
          </View>
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </Pressable>

        <Text style={styles.label}>DOCUMENT TITLE *</Text>
        <TextInput
          testID="document-title-input"
          value={title}
          editable={!uploading}
          onChangeText={setTitle}
          placeholder="Add a title"
          placeholderTextColor={colors.mutedForeground}
          maxLength={120}
          style={styles.input}
        />

        <Text style={styles.label}>CATEGORY</Text>
        <TextInput
          testID="document-category-input"
          value={category}
          editable={!uploading}
          onChangeText={setCategory}
          placeholder="For example, treatment plan"
          placeholderTextColor={colors.mutedForeground}
          maxLength={60}
          style={styles.input}
        />

        <Pressable
          testID="document-authorized-attestation"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: authorizedUploader }}
          onPress={() => {
            setAuthorizedUploader(value => !value);
            setActionError("");
          }}
          style={styles.attestation}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: authorizedUploader
                  ? colors.primary
                  : colors.card,
                borderColor: authorizedUploader ? colors.primary : colors.border,
              },
            ]}
          >
            {authorizedUploader && (
              <Feather
                name="check"
                size={15}
                color={colors.primaryForeground}
              />
            )}
          </View>
          <Text style={styles.attestationText}>
            I confirm that I am authorized to possess and provide the health
            information and documents I upload concerning this child.
          </Text>
        </Pressable>

        <Pressable
          testID="document-upload-button"
          accessibilityRole="button"
          disabled={
            uploading ||
            !selectedFile ||
            !title.trim() ||
            !authorizedUploader ||
            !childId
          }
          onPress={uploadDocument}
          style={[
            styles.uploadButton,
            {
              opacity:
                uploading ||
                !selectedFile ||
                !title.trim() ||
                !authorizedUploader ||
                !childId
                  ? 0.48
                  : 1,
            },
          ]}
        >
          {uploading ? (
            <ActivityIndicator
              size="small"
              color={colors.primaryForeground}
            />
          ) : (
            <Feather name="upload" size={16} color={colors.primaryForeground} />
          )}
          <Text style={styles.uploadButtonText}>
            {uploading ? "Uploading…" : "Upload securely"}
          </Text>
        </Pressable>
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
      </View>

      {!!actionError && (
        <View style={styles.error} testID="document-action-error">
          <Feather
            name="alert-circle"
            size={16}
            color={colors.destructive}
          />
          <Text selectable style={styles.errorText}>
            {actionError}
          </Text>
        </View>
      )}

      <View>
        <View style={styles.listHeading}>
          <Text style={styles.sectionTitle}>Your documents</Text>
          <Pressable
            testID="document-refresh-button"
            accessibilityRole="button"
            accessibilityLabel="Refresh documents"
            disabled={!childId || refreshing}
            onPress={refresh}
            style={[styles.refreshButton, { opacity: refreshing ? 0.55 : 1 }]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="refresh-cw" size={17} color={colors.primary} />
            )}
          </Pressable>
        </View>

        {!childId ? (
          <View style={[styles.card, styles.stateCard]}>
            <Feather
              name="alert-circle"
              size={25}
              color={colors.mutedForeground}
            />
            <Text style={styles.stateText}>
              {clinician
                ? "Select a client to view their documents."
                : "Your child profile is not available right now."}
            </Text>
          </View>
        ) : documentsQuery.isPending ? (
          <View style={[styles.card, styles.loading]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading documents…</Text>
          </View>
        ) : listError ? (
          <View style={[styles.card, styles.stateCard]}>
            <Feather
              name="alert-circle"
              size={25}
              color={colors.destructive}
            />
            <Text style={styles.sectionTitle}>Documents unavailable</Text>
            <Text selectable style={styles.stateText}>
              {errorMessage(documentsQuery.error)}
            </Text>
            <Pressable
              testID="document-list-retry"
              accessibilityRole="button"
              onPress={refresh}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : documentsQuery.data?.length ? (
          documentsQuery.data.map(document => {
            const date = formatDate(document.createdDate || document.createdAt);
            const meta = [document.category || "Document", date]
              .filter(Boolean)
              .join("  ·  ");
            const isOpening = openingId === document.id;
            return (
              <View
                key={document.id}
                testID={`document-item-${document.id}`}
                style={styles.documentRow}
              >
                <View style={styles.documentIcon}>
                  <Feather
                    name={categoryIcon(document.category)}
                    size={19}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.documentTitle} numberOfLines={2}>
                    {document.title || document.fileName || "Document"}
                  </Text>
                  <Text style={styles.documentMeta} numberOfLines={1}>
                    {meta}
                  </Text>
                </View>
                <Pressable
                  testID={`document-open-${document.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open or export ${document.title || document.fileName || "document"}`}
                  disabled={!!openingId}
                  onPress={() => void openDocument(document)}
                  style={[
                    styles.openButton,
                    { opacity: openingId && !isOpening ? 0.45 : 1 },
                  ]}
                >
                  {isOpening ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                    />
                  ) : (
                    <Feather
                      name="external-link"
                      size={17}
                      color={colors.primary}
                    />
                  )}
                </Pressable>
              </View>
            );
          })
        ) : (
          <View style={[styles.card, styles.stateCard]}>
            <Feather
              name="folder"
              size={27}
              color={colors.mutedForeground}
            />
            <Text style={styles.sectionTitle}>No documents yet</Text>
            <Text style={styles.stateText}>
              {clinician
                ? "Upload a document for this client or check back when one is shared."
                : "Your clinician’s shared plans and materials will appear here."}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}