"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Json, Product, ProductImage, ProductVariant } from "@/types/database";
import styles from "./product-page.module.css";

type CartItem = { id: string; qty: number; color: string; name?: string };
type ProductColor = { name: string; code?: string; image?: string; stock?: number };

function asColors(value: Json): ProductColor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const color = item as Record<string, Json | undefined>;
    if (typeof color.name !== "string" || !color.name) return [];
    return [{
      name: color.name,
      code: typeof color.code === "string" ? color.code : undefined,
      image: typeof color.image === "string" ? color.image : undefined,
      stock: typeof color.stock === "number" ? color.stock : undefined,
    }];
  });
}

function asImages(product: Product, galleryImages: ProductImage[]) {
  const catalogGallery = galleryImages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => image.url);
  const gallery = Array.isArray(product.gallery)
    ? product.gallery.filter((image): image is string => typeof image === "string" && Boolean(image))
    : [];
  return Array.from(new Set([
    ...catalogGallery,
    product.image_url,
    ...gallery,
  ].filter((image): image is string => Boolean(image))));
}

function asSpecifications(value: Json) {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];
  return Object.entries(value).filter((entry): entry is [string, string | number | boolean] =>
    ["string", "number", "boolean"].includes(typeof entry[1]),
  );
}

function parseCart(value: Json): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Json | undefined>;
    const id = String(row.id ?? "");
    const qty = Number(row.qty);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(qty) || qty < 1) return [];
    return [{ id, qty, color: typeof row.color === "string" ? row.color : "مشکی" }];
  });
}

function serializeCart(items: CartItem[]): Json[] {
  return items.map(({ id, qty, color, name }) => ({
    id,
    qty,
    color,
    ...(name ? { name } : {}),
  }));
}

export type ProductPageVariant = Pick<
  ProductVariant,
  "color_name" | "color_code" | "size" | "price" | "discount" | "stock" | "image_url" | "is_active"
>;

export function ProductPage({
  product,
  related,
  variants,
  variantsUnavailable,
  galleryImages,
}: {
  product: Product;
  related: Product[];
  variants: ProductPageVariant[];
  variantsUnavailable: boolean;
  galleryImages: ProductImage[];
}) {
  const router = useRouter();
  const colors = useMemo(() => asColors(product.colors), [product.colors]);
  const images = useMemo(() => asImages(product, galleryImages), [product, galleryImages]);
  const [selectedColor, setSelectedColor] = useState<ProductColor | null>(
    () => colors.find((color) => (color.stock ?? product.stock) > 0) ?? colors[0] ?? null,
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [wished, setWished] = useState(false);
  const [notice, setNotice] = useState("");
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        clientRef.current ??= createSupabaseBrowserClient();
        const client = await clientRef.current;
        const { data: { user }, error } = await client.auth.getUser();
        if (error) throw error;
        if (!user || cancelled) return;
        const { data, error: profileError } = await client
          .from("profiles")
          .select("wishlist")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (cancelled) return;
        const wishlist = Array.isArray(data?.wishlist) ? data.wishlist : [];
        setWished(wishlist.some((entry) => {
          if (entry && typeof entry === "object" && !Array.isArray(entry) && "id" in entry) {
            return String(entry.id) === String(product.id);
          }
          return String(entry) === String(product.id);
        }));
      } catch (error) {
        console.error("Could not load product wishlist state:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const stock = selectedColor?.stock ?? product.stock;
  const rawRating = Number(product.rating);
  const rating = Number.isFinite(rawRating) ? Math.min(5, Math.max(0, rawRating)) : 0;
  const sellableVariants = useMemo(
    () => variants.filter((variant) => variant.is_active),
    [variants],
  );
  const colorOffer = useMemo(() => {
    if (!selectedColor) return null;
    const offers = sellableVariants
      .filter((variant) => variant.color_name === selectedColor.name)
      .map((variant) => ({
        final: Math.round(variant.price * (1 - variant.discount / 100)),
        price: variant.price,
        discount: variant.discount,
      }));
    if (offers.length === 0) return null;
    return offers.reduce((best, offer) => (offer.final < best.final ? offer : best));
  }, [sellableVariants, selectedColor]);
  const finalPrice =
    colorOffer?.final ?? Math.round(product.price * (1 - product.discount / 100));
  const oldPrice = colorOffer
    ? (colorOffer.discount > 0 ? colorOffer.price : null)
    : (product.discount > 0 ? product.price : null);
  const displayedImage = selectedGalleryImage || selectedColor?.image || images[imageIndex] || null;

  async function addToCart() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      clientRef.current ??= createSupabaseBrowserClient();
      const client = await clientRef.current;
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.push("/login");
        return;
      }

      const [profileResult, liveProductResult] = await Promise.all([
        client.from("profiles").select("cart").eq("id", user.id).maybeSingle(),
        client.from("products").select("id,stock,colors,is_active").eq("id", product.id).maybeSingle(),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (liveProductResult.error) throw liveProductResult.error;
      if (!liveProductResult.data?.is_active) {
        setNotice("این محصول دیگر در دسترس نیست.");
        return;
      }

      const liveColors = asColors(liveProductResult.data.colors);
      const liveColor = liveColors.find((color) => color.name === selectedColor?.name);
      const availableStock = liveColor?.stock ?? liveProductResult.data.stock;
      if (availableStock < quantity) {
        setNotice(`موجودی کافی نیست؛ حداکثر ${availableStock} عدد موجود است.`);
        return;
      }

      const cart = parseCart(profileResult.data?.cart ?? []);
      const selectedName = selectedColor?.name ?? "مشکی";
      const existing = cart.find((item) => item.id === String(product.id) && item.color === selectedName);
      if (existing && existing.qty + quantity > availableStock) {
        setNotice(`حداکثر ${availableStock} عدد از این رنگ موجود است.`);
        return;
      }
      const nextCart = existing
        ? cart.map((item) => item === existing ? { ...item, qty: item.qty + quantity } : item)
        : [...cart, { id: String(product.id), qty: quantity, color: selectedName, name: product.name }];
      const { error: saveError } = await client.from("profiles")
        .update({ cart: serializeCart(nextCart), updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (saveError) throw saveError;
      setNotice("محصول به سبد خرید اضافه شد.");
    } catch (error) {
      console.error("Could not add product to cart:", error);
      setNotice("ذخیرهٔ سبد خرید انجام نشد. اتصال سوپابیس و schema را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleWishlist() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      clientRef.current ??= createSupabaseBrowserClient();
      const client = await clientRef.current;
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.push("/login");
        return;
      }
      const { data, error } = await client.from("profiles")
        .select("wishlist")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      const current = Array.isArray(data?.wishlist) ? data.wishlist : [];
      const alreadySaved = current.some((entry) => {
        if (entry && typeof entry === "object" && !Array.isArray(entry) && "id" in entry) {
          return String(entry.id) === String(product.id);
        }
        return String(entry) === String(product.id);
      });
      const updated = alreadySaved
        ? current.filter((entry) => {
            if (entry && typeof entry === "object" && !Array.isArray(entry) && "id" in entry) {
              return String(entry.id) !== String(product.id);
            }
            return String(entry) !== String(product.id);
          })
        : [...current, { id: Number(product.id), priceAtAdd: finalPrice, addedAt: new Date().toISOString() }];
      const { error: saveError } = await client.from("profiles")
        .update({ wishlist: updated as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (saveError) throw saveError;
      setWished(!alreadySaved);
    } catch (error) {
      console.error("Could not update product wishlist:", error);
      setNotice("علاقه‌مندی ذخیره نشد. اتصال سوپابیس و schema را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.page} storefront-product-page`} dir="rtl">
      <main className={styles.content}>
        <div className={styles.pageTop}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.back()}
            aria-label="بازگشت به صفحهٔ قبل"
          >
            <i className="fas fa-arrow-left" aria-hidden="true" />
            بازگشت
          </button>
        </div>

        <nav className={styles.breadcrumb} aria-label="مسیر">
          <Link href="/">خانه</Link><i className="fas fa-chevron-left" aria-hidden="true" />
          <span>{product.category || "محصولات"}</span><i className="fas fa-chevron-left" aria-hidden="true" />
          <strong>{product.name}</strong>
        </nav>

        <div className={styles.productGrid}>
          <section className={styles.gallery} aria-label="گالری محصول">
            <div className={styles.mainImage}>
              {displayedImage && failedImage !== displayedImage
                ? (
                  <Image
                    src={displayedImage}
                    alt={product.name}
                    fill
                    sizes="(max-width: 760px) 100vw, 48vw"
                    loading="eager"
                    onError={() => setFailedImage(displayedImage)}
                  />
                )
                : (
                  <div className={styles.imageFallback} role="img" aria-label="تصویر محصول در دسترس نیست">
                    <i className="far fa-image" aria-hidden="true" />
                    <span>تصویر محصول در دسترس نیست</span>
                  </div>
                )}
            </div>
            {images.length > 1 && (
              <div className={styles.thumbnails}>
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={`${image}-${index}`}
                    className={index === imageIndex ? styles.selectedThumbnail : ""}
                    onClick={() => { setImageIndex(index); setSelectedGalleryImage(image); }}
                    aria-label={`تصویر ${index + 1}`}
                    aria-pressed={index === imageIndex}
                  >
                    <Image src={image} alt="" fill sizes="64px" loading={index === imageIndex ? "eager" : "lazy"} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className={styles.details}>
            <div className={styles.metaRow}>
              <span className={styles.category}><i className="fas fa-check-circle" aria-hidden="true" /> {product.category || "محصول فروشگاه"}</span>
              {product.brand ? <span className={styles.brand}>{product.brand}</span> : null}
            </div>
            <h1>{product.name}</h1>
            {product.is_hot && <span className={styles.hot}><i className="fas fa-fire" aria-hidden="true" /> فروش ویژه</span>}
            <div className={styles.rating}>
              <span role="img" aria-label={`امتیاز ${rating}`}>
                {"★".repeat(Math.round(rating))}
                {"☆".repeat(5 - Math.round(rating))}
              </span>
              <b>{rating.toFixed(1)}</b>
              <small>{Number(product.review_count ?? 0).toLocaleString("fa-IR")} دیدگاه</small>
              <em className={stock > 0 ? styles.inStock : styles.outOfStock}>
                {stock > 0 ? (stock <= 2 ? `تنها ${stock.toLocaleString("fa-IR")} عدد` : "موجود") : "ناموجود"}
              </em>
            </div>
            <div className={styles.prices}>
              {oldPrice !== null && <del>{Number(oldPrice).toLocaleString("fa-IR")} تومان</del>}
              <strong>{finalPrice.toLocaleString("fa-IR")} <small>تومان</small></strong>
            </div>

            {colors.length > 0 && (
              <div className={styles.colorBlock}>
                <b>رنگ: {selectedColor?.name ?? "انتخاب نشده"}</b>
                <div className={styles.colorChoices}>
                  {colors.map((color) => (
                    <button
                      type="button"
                      key={color.name}
                      disabled={(color.stock ?? product.stock) <= 0}
                      aria-pressed={selectedColor?.name === color.name}
                      className={selectedColor?.name === color.name ? styles.selectedColor : ""}
                      onClick={() => {
                        setSelectedColor(color);
                        setQuantity(1);
                        setImageIndex(0);
                        setSelectedGalleryImage(null);
                      }}
                    >
                      <span style={{ backgroundColor: color.code || "#555" }} />
                      {color.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {product.warranty ? (
              <p className={styles.warranty}>
                <i className="fas fa-shield-alt" aria-hidden="true" /> {product.warranty}
              </p>
            ) : null}

            <div className={styles.actions}>
              <div className={styles.quantity}>
                <button type="button" aria-label="کاهش تعداد" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1}>
                  <i className="fas fa-minus" aria-hidden="true" />
                </button>
                <span>{quantity.toLocaleString("fa-IR")}</span>
                <button type="button" aria-label="افزایش تعداد" onClick={() => setQuantity((value) => Math.min(stock, value + 1))} disabled={quantity >= stock}>
                  <i className="fas fa-plus" aria-hidden="true" />
                </button>
              </div>
              <button type="button" className={styles.addButton} onClick={addToCart} disabled={busy || stock <= 0} aria-busy={busy}>
                <i className="fas fa-shopping-cart" aria-hidden="true" /> {busy ? "در حال ثبت..." : "افزودن به سبد"}
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={toggleWishlist}
                disabled={busy}
                aria-label={wished ? "حذف از علاقه‌مندی" : "افزودن به علاقه‌مندی"}
                aria-pressed={wished}
              >
                <i className={`${wished ? "fas" : "far"} fa-heart`} aria-hidden="true" />
              </button>
            </div>
            {notice && <p className={styles.notice} role="status">{notice}</p>}
            {variantsUnavailable && (
              <p className={styles.dataNotice} role="status">
                قیمت بعضی مدل‌ها موقتاً در دسترس نیست؛ قیمت پایهٔ محصول نمایش داده شده است.
              </p>
            )}
            <div className={styles.trust}>
              <span><i className="fas fa-shield-alt" aria-hidden="true" /> ضمانت اصالت</span>
              <span><i className="fas fa-undo" aria-hidden="true" /> ۷ روز بازگشت</span>
              <span><i className="fas fa-truck" aria-hidden="true" /> ارسال سریع</span>
            </div>
          </section>
        </div>

        {product.description && (
          <section className={styles.section}>
            <h2>توضیحات</h2><p>{product.description}</p>
          </section>
        )}
        {asSpecifications(product.specifications).length > 0 && (
          <section className={styles.section}>
            <h2>مشخصات فنی</h2>
            <dl className={styles.specs}>
              {asSpecifications(product.specifications).map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
              ))}
            </dl>
          </section>
        )}
        {related.length > 0 && (
          <section className={styles.section}>
            <h2>محصولات مشابه</h2>
            <div className={styles.related}>
              {related.map((item) => (
                <Link
                  href={`/product?id=${encodeURIComponent(item.id)}`}
                  className={styles.relatedCard}
                  key={item.id}
                >
                  <span className={styles.relatedImage}>
                    {item.image_url
                      ? <Image src={item.image_url} alt={item.name} fill sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 20vw" />
                      : <i className="far fa-image" aria-hidden="true" />}
                  </span>
                  <span className={styles.relatedBody}>
                    <b className={styles.relatedName}>{item.name}</b>
                    <small className={styles.relatedPrice}>
                      {Math.round(item.price * (1 - item.discount / 100)).toLocaleString("fa-IR")} تومان
                    </small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
