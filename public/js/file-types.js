// Pure file rules (allow-list, MIME by extension, size limit). Shared by files.js and the tests.
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
const EXT = {
  stl: ["model/stl", "model"], step: ["application/step", "model"], stp: ["application/step", "model"], glb: ["model/gltf-binary", "model"],
  pdf: ["application/pdf", "doc"], png: ["image/png", "image"], jpg: ["image/jpeg", "image"], jpeg: ["image/jpeg", "image"], webp: ["image/webp", "image"],
  zip: ["application/zip", "other"], md: ["text/markdown", "doc"],
};
export const ACCEPT = Object.keys(EXT).map((e) => "." + e).join(",");

// Pure: decide MIME and kind from the extension; refuse unknown types and oversize files.
export function normaliseFile(name, size) {
  const ext = String(name || "").toLowerCase().split(".").pop();
  const hit = EXT[ext];
  if (!hit || !String(name).includes(".")) throw new Error(`Fuse does not take .${ext || "?"} files. Use STL, STEP, GLB, PDF, PNG, JPG, WEBP, ZIP or MD.`);
  if (!(size > 0)) throw new Error("This file is empty.");
  if (size > MAX_FILE_BYTES) throw new Error(`This file is ${(size / 1048576).toFixed(0)} MB. The limit is 200 MB.`);
  return { mime: hit[0], kind: hit[1] };
}

export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n || 0} B`);

