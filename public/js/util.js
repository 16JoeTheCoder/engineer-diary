// Small shared helpers: ids, dates, money, escaping, tiny DOM template.

export const uid = () => {
  const a = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(a, (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");
};

export const nowIso = () => new Date().toISOString();

const pad = (n) => String(n).padStart(2, "0");
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso) => (iso ? today(new Date(iso)) : "");
export const timeOf = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const stamp = (iso) => (iso ? `${dateOf(iso)} ${timeOf(iso)}` : "");

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
export const rp = (n) => (n == null || n === "" || Number.isNaN(+n) ? "Rp —" : `Rp ${idr.format(Math.round(+n))}`);
// "85.000" / "85000" / "85k" / "1,2jt" -> 85000
export const parseIdr = (s) => {
  if (typeof s === "number") return Math.round(s);
  if (s == null) return null;
  let t = String(s).trim().toLowerCase().replace(/^rp\.?\s*/, "");
  if (!t) return null;
  let mult = 1;
  if (/(k|rb|ribu)$/.test(t)) { mult = 1e3; t = t.replace(/(k|rb|ribu)$/, ""); }
  else if (/(jt|juta|m)$/.test(t)) { mult = 1e6; t = t.replace(/(jt|juta|m)$/, ""); }
  if (mult > 1) t = t.replace(",", ".");
  else t = t.replace(/[.,\s]/g, "");
  const v = parseFloat(t);
  return Number.isFinite(v) ? Math.round(v * mult) : null;
};

export const hours = (sec) => {
  const h = (sec || 0) / 3600;
  return h >= 10 ? Math.round(h).toString() : h.toFixed(1);
};
export const clock = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
};

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

// Tagged template that escapes interpolations unless wrapped with raw().
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join("") : v === false || v == null ? "" : esc(v));
export const html = (strs, ...vals) => raw(strs.reduce((o, s, i) => o + s + (i < vals.length ? val(vals[i]) : ""), ""));

export const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const splitTags = (s) =>
  [...new Set(String(s || "").split(/[,\n]/).map((t) => t.trim().replace(/^#/, "").slice(0, 24)).filter(Boolean))];

export const SHOPS = [
  [/shopee\./i, "Shopee"],
  [/tokopedia\./i, "Tokopedia"],
  [/(lazada|lzd)\./i, "Lazada"],
  [/alibaba\.|aliexpress\./i, "AliExpress"],
  [/blibli\./i, "Blibli"],
];
export const shopFromUrl = (url) => {
  try {
    const host = new URL(url).hostname;
    for (const [re, name] of SHOPS) if (re.test(host)) return name;
    return host.replace(/^www\./, "");
  } catch { return ""; }
};
export const searchLinks = (q) =>
  q ? [
    { shop: "Shopee", url: `https://shopee.co.id/search?keyword=${encodeURIComponent(q)}` },
    { shop: "Tokopedia", url: `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(q)}` },
  ] : [];
export const safeUrl = (u) => {
  try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch { return ""; }
};

export const download = (name, text, type = "application/json") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

export const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const t = document.createElement("textarea");
    t.value = text; document.body.append(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); return ok;
  }
};

export const b64FromBytes = (u8) => {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
export const bytesFromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Read a form control as the type named in data-type: text|int|num|idr|tags|bool|null
export function coerce(el) {
  const t = el.dataset.type || "text";
  const v = el.type === "checkbox" ? el.checked : el.value;
  if (t === "bool") return !!v;
  if (t === "int") { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(el.min ? +el.min : 0, n) : 0; }
  if (t === "num") { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; }
  if (t === "idr") return parseIdr(v);
  if (t === "tags") return splitTags(v);
  if (t === "null") return v || null;
  return String(v).trim();
}
