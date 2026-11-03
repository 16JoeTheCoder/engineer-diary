# Backing up Fuse files (R2)

A full restore needs **two** things:

1. **The app backup** (Settings > Export backup): one JSON file with every record, every photo, and the `file` records (name, size, caption, section, R2 key). It does **not** contain the bytes of files in R2; they are too big.
2. **The R2 bucket copy**: the bytes of models, drawings, PDFs and large images, made with `rclone copy`.

Restore order: import the JSON backup, then make sure the bucket holds the same keys (copy them back with `rclone copy` in the other direction if the bucket was lost).

## Why the app cannot lose files

- The app has no delete endpoint and no presigned DELETE. It cannot remove bytes from R2.
- Delete in the app only sets `deletedAt` on the record. The file moves to the Archive screen and can be restored.
- A project marked complete is locked by the Firestore rules: no archive, no soft delete, no record delete.
- Only you can purge bytes, by hand, in the Cloudflare dashboard.

## One-time setup (Windows PowerShell)

Install rclone from <https://rclone.org/downloads/>, then:

```
rclone config
```

Create a remote named `r2`: type `s3`, provider `Cloudflare`, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, and the Access Key ID and Secret Access Key of an R2 API token. A read-only token is enough for backups.

## Every few weeks (Windows PowerShell)

```
rclone copy r2:fuse-files "D:\FuseBackup\files" --progress
```

Use `copy`, never `sync`. `copy` only adds; `sync` would delete files on one side when they are gone on the other.

Optional second copy to Backblaze B2: create a remote `b2` with `rclone config`, then:

```
rclone copy r2:fuse-files b2:fuse-files-backup --progress
```

## Account security

Keep two-factor authentication on for your Cloudflare account. Anyone with the account can delete the bucket; nothing in the app can.
