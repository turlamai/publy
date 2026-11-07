// Shared plugin settings, server response shapes and view IDs.

export const VIEW_TYPE_PUBLY_PREVIEW = "publy-preview";
export const PUBLY_HISTORY_VIEW = "publy-history";

export interface PublySettings {
  server: string;
  apiKey: string;
  account: string;
  mediaDir: string;
  theme: string;
  lang: "auto" | "zh" | "en";
  /** open the preview panel automatically as each markdown note opens */
  autoPreview: boolean;
  /** preview panel width: 390px "mobile" (the WeChat norm) or 700px "desktop" */
  previewWidth: "mobile" | "desktop";
  /** file path -> last cover choice ("auto" or attachment name) */
  lastCover: Record<string, string>;
}

export const DEFAULT_SETTINGS: PublySettings = {
  server: "",
  apiKey: "",
  account: "",
  mediaDir: "",
  theme: "claude",
  lang: "auto",
  autoPreview: false,
  previewWidth: "desktop",
  lastCover: {},
};

export interface PublishResponse {
  mediaId?: string;
  code?: string;
  message?: string;
  scheduled?: boolean;
  jobId?: string;
  runAt?: string;
  coverSource?: "cover" | "first-image" | "auto";
  /** server echo of the submitted identity (#7): results name their own
   *  destination and request instead of whatever preview is now visible */
  account?: string;
  title?: string;
  requestId?: string;
  deduped?: boolean;
}

/** GET /v1/publish-result/:key answer */
export interface PublishResultInfo {
  status: "confirmed" | "unknown";
  mediaId?: string;
  account?: string;
  title?: string;
  requestId?: string;
}

export interface HistoryEntry {
  ts: string;
  event: string;
  account?: string;
  title?: string;
  type?: string;
  mediaId?: string;
  error?: string;
}

export interface JobEntry {
  id: string;
  runAt: string;
  status: string;
  account?: string;
  type?: string;
  title?: string;
  error?: string;
}
