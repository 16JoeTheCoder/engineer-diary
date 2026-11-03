// GET -> { ok, has: { NAME: true|false } }. Booleans only, never values.
import { json } from "../../edge-lib/r2.js";

const NAMES = ["FIREBASE_PROJECT_ID", "ALLOWED_UIDS", "R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
export const onRequestGet = ({ env }) => json({ ok: true, has: { ...Object.fromEntries(NAMES.map((n) => [n, !!env[n]])), FILES_BINDING: !!env.FILES } });
