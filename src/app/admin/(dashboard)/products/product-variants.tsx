"use client";

import { useState } from "react";
import type { ProductVariantInput } from "@/lib/admin/actions/products";
import { ImageUploader } from "@/components/admin/image-uploader";
import styles from "./product-form.module.css";

type OptionGroup = {
  name: string;
  values: string;
  colorCodes: Record<string, string>;
};

function parseValues(value: string): string[] {
  return value
    .split(/[,،\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])),
    [[]],
  );
}

function isColorGroup(name: string): boolean {
  return /رنگ|color/i.test(name);
}

export function ProductVariants({
  variants,
  onChange,
  basePrice,
}: {
  variants: ProductVariantInput[];
  onChange: (variants: ProductVariantInput[]) => void;
  basePrice: number;
}) {
  const initialOptions: OptionGroup[] = [
    { name: "رنگ", values: "", colorCodes: {} },
  ];
  const [options, setOptions] = useState<OptionGroup[]>(initialOptions);

  function updateOption(index: number, patch: Partial<OptionGroup>) {
    setOptions(
      options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option,
      ),
    );
  }

  function updateColorCode(index: number, value: string, color: string) {
    setOptions(
      options.map((option, optionIndex) =>
        optionIndex === index
          ? {
              ...option,
              colorCodes: { ...option.colorCodes, [value]: color },
            }
          : option,
      ),
    );
  }

  function generate() {
    const groups = options
      .map((option) => ({
        name: option.name.trim(),
        values: parseValues(option.values),
        colorCodes: option.colorCodes,
      }))
      .filter((option) => option.name && option.values.length > 0);

    if (groups.length === 0) return;

    const combinations = cartesian(groups.map((group) => group.values));
    const next = combinations.map((values) => {
      let colorName = "";
      let colorCode = "";
      const sizeParts: string[] = [];

      groups.forEach((group, groupIndex) => {
        const value = values[groupIndex];
        if (isColorGroup(group.name)) {
          colorName = value;
          colorCode = group.colorCodes[value] ?? "";
        } else {
          sizeParts.push(value);
        }
      });

      return {
        sku: "",
        color_name: colorName,
        color_code: colorCode,
        size: sizeParts.join(" / "),
        price: basePrice,
        discount: 0,
        stock: 0,
        image_url: null,
        is_active: true,
      };
    });

    onChange(next);
  }

  function updateVariant(index: number, patch: Partial<ProductVariantInput>) {
    onChange(
      variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...patch } : variant,
      ),
    );
  }

  function removeVariant(index: number) {
    onChange(variants.filter((_, variantIndex) => variantIndex !== index));
  }

  function addVariant() {
    onChange([
      ...variants,
      {
        sku: "",
        color_name: "",
        color_code: "",
        size: "",
        price: basePrice,
        discount: 0,
        stock: 0,
        image_url: null,
        is_active: true,
      },
    ]);
  }

  return (
    <div className={styles.variantsBlock}>
      <div className={styles.optionsBlock}>
        <h3>گزینه‌های واریانت</h3>
        <p className={styles.hint}>
          گزینه‌هایی مثل «رنگ» و «سایز» را تعریف کنید و بعد «تولید ترکیب‌ها» را
          بزنید. برای گزینهٔ رنگ می‌توانید کد رنگ هم تعیین کنید.
        </p>
        {options.map((option, index) => {
          const colorGroup = isColorGroup(option.name);
          const values = parseValues(option.values);
          return (
            <div className={styles.optionRow} key={index}>
              <input
                value={option.name}
                placeholder="نام گزینه (رنگ، سایز، مدل…)"
                onChange={(event) =>
                  updateOption(index, { name: event.target.value })
                }
              />
              <input
                value={option.values}
                placeholder="مقادیر با ویرگول (قرمز، آبی، S، M)"
                onChange={(event) =>
                  updateOption(index, { values: event.target.value })
                }
              />
              <button
                type="button"
                className={styles.iconDanger}
                onClick={() =>
                  setOptions(options.filter((_, optionIndex) => optionIndex !== index))
                }
                aria-label={`حذف گزینه ${index + 1}`}
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
              {colorGroup && values.length > 0 && (
                <div className={styles.colorChips}>
                  {values.map((value) => (
                    <label key={value} className={styles.colorChip}>
                      <input
                        type="color"
                        value={option.colorCodes[value] ?? "#000000"}
                        onChange={(event) =>
                          updateColorCode(index, value, event.target.value)
                        }
                        aria-label={`کد رنگ ${value}`}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className={styles.optionActions}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              setOptions([
                ...options,
                { name: "", values: "", colorCodes: {} },
              ])
            }
          >
            افزودن گزینه
          </button>
          <button type="button" className={styles.primary} onClick={generate}>
            تولید ترکیب‌ها
          </button>
        </div>
      </div>

      <div className={styles.variantTableWrap}>
        <div className={styles.variantTableHeader}>
          <h3>ترکیب‌های واریانت ({variants.length.toLocaleString("fa-IR")})</h3>
          <button type="button" className={styles.ghost} onClick={addVariant}>
            افزودن واریانت دستی
          </button>
        </div>

        {variants.length === 0 ? (
          <p className={styles.emptyState}>
            واریانتی تعریف نشده است. اگر محصول واریانت ندارد، فقط قیمت و موجودی
            پایه را در مرحلهٔ اول وارد کنید.
          </p>
        ) : (
          <div className={styles.variantTable}>
            <div className={styles.variantRow + " " + styles.variantHead}>
              <span>رنگ</span>
              <span>سایز</span>
              <span>قیمت</span>
              <span>تخفیف %</span>
              <span>موجودی</span>
              <span>SKU</span>
              <span>تصویر</span>
              <span>فعال</span>
              <span />
            </div>
            {variants.map((variant, index) => (
              <div className={styles.variantRow} key={index}>
                <div className={styles.variantColorCell}>
                  <input
                    type="color"
                    value={variant.color_code || "#000000"}
                    onChange={(event) =>
                      updateVariant(index, { color_code: event.target.value })
                    }
                    aria-label="کد رنگ"
                  />
                  <input
                    value={variant.color_name}
                    placeholder="نام رنگ"
                    onChange={(event) =>
                      updateVariant(index, { color_name: event.target.value })
                    }
                  />
                </div>
                <input
                  value={variant.size}
                  placeholder="سایز"
                  onChange={(event) =>
                    updateVariant(index, { size: event.target.value })
                  }
                />
                <input
                  type="number"
                  min={0}
                  value={variant.price}
                  onChange={(event) =>
                    updateVariant(index, { price: Number(event.target.value) || 0 })
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={variant.discount}
                  onChange={(event) =>
                    updateVariant(index, {
                      discount: Number(event.target.value) || 0,
                    })
                  }
                />
                <input
                  type="number"
                  min={0}
                  value={variant.stock}
                  onChange={(event) =>
                    updateVariant(index, {
                      stock: Math.max(0, Math.round(Number(event.target.value) || 0)),
                    })
                  }
                />
                <input
                  value={variant.sku}
                  placeholder="SKU"
                  dir="ltr"
                  onChange={(event) =>
                    updateVariant(index, { sku: event.target.value })
                  }
                />
                <div className={styles.variantImageCell}>
                  <ImageUploader
                    label={`تصویر واریانت ${index + 1}`}
                    value={variant.image_url}
                    onChange={(url) => updateVariant(index, { image_url: url })}
                    maxSizeMB={4}
                    compress={{ maxWidth: 800, quality: 0.8 }}
                  />
                </div>
                <input
                  type="checkbox"
                  checked={variant.is_active}
                  onChange={(event) =>
                    updateVariant(index, { is_active: event.target.checked })
                  }
                  aria-label="واریانت فعال"
                />
                <button
                  type="button"
                  className={styles.iconDanger}
                  onClick={() => removeVariant(index)}
                  aria-label={`حذف واریانت ${index + 1}`}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
