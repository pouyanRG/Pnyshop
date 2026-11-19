"use client";

import { useState, type DragEvent } from "react";
import type { ProductImageInput } from "@/lib/admin/actions/products";
import { ImageUploader } from "@/components/admin/image-uploader";
import styles from "./product-form.module.css";

export function ProductImages({
  images,
  onChange,
}: {
  images: ProductImageInput[];
  onChange: (images: ProductImageInput[]) => void;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function addImage(url: string | null) {
    if (!url) return;
    onChange([
      ...images,
      {
        url,
        alt: "",
        sort_order: images.length,
        is_primary: images.length === 0,
      },
    ]);
  }

  function remove(index: number) {
    const next = images.filter((_, imageIndex) => imageIndex !== index);
    if (next.length > 0 && !next.some((image) => image.is_primary)) {
      next[0].is_primary = true;
    }
    onChange(next.map((image, imageIndex) => ({ ...image, sort_order: imageIndex })));
  }

  function setPrimary(index: number) {
    onChange(
      images.map((image, imageIndex) => ({
        ...image,
        is_primary: imageIndex === index,
      })),
    );
  }

  function updateAlt(index: number, alt: string) {
    onChange(
      images.map((image, imageIndex) =>
        imageIndex === index ? { ...image, alt } : image,
      ),
    );
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetIndex: number) {
    event.preventDefault();
    if (draggingIndex === null || draggingIndex === targetIndex) {
      setDraggingIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...images];
    const [moved] = next.splice(draggingIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next.map((image, index) => ({ ...image, sort_order: index })));
    setDraggingIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div className={styles.imagesBlock}>
      <ImageUploader
        label="افزودن تصویر محصول"
        value={null}
        onChange={addImage}
        helper="JPG، PNG، WebP یا AVIF — حداکثر ۵ مگابایت؛ با کشیدن تصاویر می‌توانید ترتیب را جابجا کنید."
        maxSizeMB={5}
        compress={{ maxWidth: 1600, quality: 0.82 }}
      />

      {images.length === 0 ? (
        <p className={styles.emptyState}>هنوز تصویری اضافه نشده است.</p>
      ) : (
        <div className={styles.imageGrid}>
          {images.map((image, index) => (
            <div
              key={`${image.url}-${index}`}
              className={`${styles.imageCard} ${draggingIndex === index ? styles.imageDragging : ""} ${dragOverIndex === index ? styles.imageDragOver : ""}`}
              draggable
              onDragStart={() => setDraggingIndex(index)}
              onDragEnd={() => {
                setDraggingIndex(null);
                setDragOverIndex(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverIndex(index);
              }}
              onDrop={(event) => handleDrop(event, index)}
            >
              <div className={styles.imageThumb}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt || "تصویر محصول"} />
                {image.is_primary && <span className={styles.primaryBadge}>اصلی</span>}
              </div>
              <input
                value={image.alt}
                placeholder="متن جایگزین (alt)"
                onChange={(event) => updateAlt(index, event.target.value)}
                maxLength={200}
                aria-label="متن جایگزین تصویر"
              />
              <div className={styles.imageActions}>
                <button
                  type="button"
                  className={image.is_primary ? styles.primaryButtonActive : styles.primaryButton}
                  onClick={() => setPrimary(index)}
                  disabled={image.is_primary}
                >
                  اصلی
                </button>
                <button
                  type="button"
                  className={styles.iconDanger}
                  onClick={() => remove(index)}
                  aria-label="حذف تصویر"
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
              <span className={styles.dragHandle}>
                <i className="fas fa-grip-vertical" aria-hidden="true" />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
