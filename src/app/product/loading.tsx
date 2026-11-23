import styles from "./product-page.module.css";

export default function ProductLoading() {
  return (
    <main className={`${styles.loadingPage} storefront-product-page`} dir="rtl" aria-busy="true">
      <p className={styles.loadingStatus} role="status">در حال بارگذاری جزئیات محصول...</p>
      <div className={styles.loadingContent} aria-hidden="true">
        <div className={styles.loadingPanel} />
        <div className={styles.loadingPanel}>
          <div className={styles.loadingLine} />
          <div className={styles.loadingLine} />
          <div className={styles.loadingLine} />
          <div className={styles.loadingLine} />
          <div className={styles.loadingLine} />
        </div>
      </div>
    </main>
  );
}
