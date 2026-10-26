// Compress photos in the browser: long edge 1600 px, JPEG ~0.7, target 300 KB; 320 px thumbnail.
const TARGET = 300 * 1024;

async function toJpeg(bitmap, edge, quality) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function compress(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let q = 0.7, full = await toJpeg(bitmap, 1600, q);
  while (full.length > TARGET && q > 0.35) { q -= 0.1; full = await toJpeg(bitmap, 1600, q); }
  if (full.length > TARGET) full = await toJpeg(bitmap, 1200, 0.5);
  const thumb = await toJpeg(bitmap, 320, 0.6);
  bitmap.close?.();
  return { full, thumb };
}

const urls = new Map();
export const objectUrl = (id, bytes, mime = "image/jpeg") => {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(new Blob([bytes], { type: mime })));
  return urls.get(id);
};
export const cachedUrl = (id) => urls.get(id);
