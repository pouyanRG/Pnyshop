"use client";

import Image from "next/image";
import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import styles from "./image-uploader.module.css";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"] as const;

type ImageUploaderProps = {
  label: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  helper?: string;
  maxSizeMB?: number;
  disabled?: boolean;
  compress?: { maxWidth?: number; quality?: number };
};

type UploadResponse = {
  success?: boolean;
  url?: string;
  path?: string;
  message?: string;
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

async function compressImage(
  file: File,
  maxWidth: number,
  quality: number,
): Promise<File> {
  if (file.type === "image/avif" || file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  if (bitmap.width <= maxWidth) return file;

  const scale = maxWidth / bitmap.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, file.type || "image/jpeg", quality);
  });
  if (!blob) return file;

  return new File([blob], file.name, { type: blob.type || file.type });
}

function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let payload: UploadResponse = {};
      try {
        payload = JSON.parse(xhr.responseText) as UploadResponse;
      } catch {
        // Keep the default payload when the server returns non-JSON.
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.success && payload.url) {
        resolve(payload);
      } else {
        reject(new Error(payload.message ?? "آپلود تصویر ناموفق بود."));
      }
    };
    xhr.onerror = () => reject(new Error("خطای شبکه در آپلود تصویر."));
    xhr.ontimeout = () => reject(new Error("زمان آپلود تصویر به پایان رسید."));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export function ImageUploader({
  label,
  value,
  onChange,
  helper,
  maxSizeMB = 5,
  disabled = false,
  compress,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function handleFile(file: File) {
    if (disabled || isUploading) return;
    setError("");

    const extension = extensionOf(file.name);
    const mimeAllowed = ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number],
    );
    const extensionAllowed = ALLOWED_EXTENSIONS.includes(
      extension as (typeof ALLOWED_EXTENSIONS)[number],
    );
    if (!mimeAllowed && !extensionAllowed) {
      setError("فقط فرمت‌های JPG، PNG، WebP و AVIF مجاز است.");
      return;
    }

    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      setError(
        `حجم تصویر نباید بیشتر از ${maxSizeMB.toLocaleString("fa-IR")} مگابایت باشد.`,
      );
      return;
    }

    setFileName(file.name);
    setIsUploading(true);
    setProgress(0);
    try {
      const prepared = compress
        ? await compressImage(
            file,
            compress.maxWidth ?? 1600,
            compress.quality ?? 0.82,
          )
        : file;
      const result = await uploadFile(prepared, setProgress);
      onChange(result.url ?? null);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "آپلود تصویر ناموفق بود.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled && !isUploading) setIsDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || isUploading) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  async function remove() {
    if (disabled || isUploading) return;
    setError("");

    if (value) {
      const match = value.match(
        /\/storage\/v1\/object\/(?:public\/)?pnyshop-media\/(.+)$/,
      );
      if (match) {
        setIsUploading(true);
        try {
          const response = await fetch("/api/admin/media", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: match[1] }),
          });
          const payload = (await response.json().catch(() => null)) as
            | UploadResponse
            | null;
          if (!response.ok || !payload?.success) {
            throw new Error(payload?.message ?? "حذف تصویر ناموفق بود.");
          }
        } catch (deleteError) {
          setError(
            deleteError instanceof Error
              ? deleteError.message
              : "حذف تصویر ناموفق بود.",
          );
          return;
        } finally {
          setIsUploading(false);
        }
      }
    }

    onChange(null);
    setFileName("");
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{label}</span>

      {value ? (
        <div className={styles.preview}>
          <Image
            src={value}
            alt={label}
            width={320}
            height={240}
            unoptimized
            className={styles.previewImage}
          />
          {isUploading && (
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={styles.progressBar}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className={styles.previewActions}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading || disabled}
            >
              {isUploading ? "در حال آپلود…" : "تغییر تصویر"}
            </button>
            <button
              type="button"
              className={styles.remove}
              onClick={remove}
              disabled={isUploading || disabled}
            >
              حذف
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`${styles.dropzone} ${isDragging ? styles.dragging : ""}`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-disabled={disabled || isUploading}
          onClick={() => {
            if (!disabled && !isUploading) inputRef.current?.click();
          }}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <i className="fas fa-cloud-upload-alt" aria-hidden="true" />
          <b>
            {isUploading
              ? "در حال آپلود تصویر…"
              : "تصویر را اینجا رها کنید یا کلیک کنید"}
          </b>
          <small>
            {helper ??
              `JPG، PNG، WebP یا AVIF — حداکثر ${maxSizeMB.toLocaleString("fa-IR")} مگابایت`}
          </small>
          {isUploading && (
            <>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={styles.progressLabel}>
                {progress.toLocaleString("fa-IR")}٪
              </span>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className={styles.input}
        onChange={handleInputChange}
      />

      {fileName && !value && (
        <span className={styles.fileName}>{fileName}</span>
      )}
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
