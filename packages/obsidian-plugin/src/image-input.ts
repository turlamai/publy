// Image file helpers for the cover picker (no paths are retained).
import path from "node:path";

export const IMAGE_EXT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function imageContentType(p: string): string {
  return IMAGE_EXT_TYPES[path.extname(p).toLowerCase()] ?? "image/png";
}

export async function fileToBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** native file picker via <input type="file"> — the community-plugin-safe way
 *  (electron.remote is banned by Obsidian's review rules, and the HTML input
 *  works everywhere). Resolves with the chosen files; [] when cancelled. */
export function pickLocalImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.multiple = true;
    input.style.display = "none";
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(input.files ? Array.from(input.files) : []));
    input.addEventListener("cancel", () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}
