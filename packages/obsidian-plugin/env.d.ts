// esbuild inlines these assets as strings (CSS) or bytes (fonts/WASM), so the
// types describe the post-bundle runtime value rather than a module export.
declare module "*.css" {
  const content: string;
  export default content;
}
declare module "*.otf" {
  const bytes: Uint8Array;
  export default bytes;
}
declare module "*.wasm" {
  const bytes: Uint8Array;
  export default bytes;
}

// Only used behind Obsidian's desktop-only shell.openPath path; the community
// build never bundles Electron itself.
declare module "electron" {
  export const shell: { openPath(path: string): Promise<string> };
}
