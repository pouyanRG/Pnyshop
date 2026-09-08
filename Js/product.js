import * as wishlistService from './wishlist-service.js';
import { skelFill, skelDone, skelError, skelRun, skelText, skelRevealText } from './skeleton.js';

const FALLBACK_IMG = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkvallQ5ZGN8H0RHyH6fe91ycZ2NbnLPmx9x-2_NqnBQ&s=10';
const DB = { session: 'current_user', theme: 'theme' };
const state = {
    theme: localStorage.getItem(DB.theme) || 'light',
    product: null, images: [], selectedColor: '', currentUser: null,
    mobileSwiper: null, lightboxSwiper: null, lightboxIndex: 0
};

function getProductIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('id');
    if (!raw) return null;
    if (!/^\d+$/.test(raw.trim())) return null;
    const num = parseInt(raw, 10);
    if (!Number.isSafeInteger(num) || num <= 0) return null;
    return num;
}
function esc(str) {
    return String(str ?? '').replace(/[&<>"'\\]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\\':'&#92;'}[ch]));
}

function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const icon = t === 'dark' ? 'fa-sun' : 'fa-moon';
    const label = t === 'dark' ? 'حالت روز' : 'حالت شب';

    document.querySelectorAll('#themeToggle i, #mobileTheme i').forEach(i => {
        i.className = `fas ${icon}`;
        const thumb = i.closest('.tsp-thumb');
        if (thumb) {
            thumb.classList.remove('pop');
            void thumb.offsetWidth; // ری‌فلو برای ری‌استارت انیمیشن
            thumb.classList.add('pop');
        }
    });

    const labelEl = document.getElementById('themeLabel');
    if (labelEl) labelEl.innerText = label;

    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-checked', t === 'dark' ? 'true' : 'false');
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem(DB.theme, state.theme);
    applyTheme(state.theme);
}
function setMobileThemeBtn() {
    const btn = document.getElementById('mobileTheme');
    if (btn) btn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
}
function resetZoomOnResize() {
    if (window.innerWidth <= 900) {
        const wrap = document.getElementById('mainImageWrap');
        if (wrap) wrap.classList.remove('zoomed');
    }
}

let searchDebounceTimer = null;

function initSearch() {
    const inp = document.getElementById('mainSearch');
    const clear = document.getElementById('clearSearch');
    const dd = document.getElementById('searchDropdown');
    if (!inp || !dd) return;

    inp.addEventListener('input', () => {
        const q = inp.value.trim();
        if (clear) clear.style.display = q ? 'flex' : 'none';

        clearTimeout(searchDebounceTimer);
        if (!q || q.length < 2) {
            dd.style.display = 'none';
            return;
        }

        searchDebounceTimer = setTimeout(async () => {
            try {
                const searchQuery = window.fbQuery(
                    window.fbCollection(window.fbDb, 'products'),
                    window.fbWhere('name', '>=', q),
                    window.fbWhere('name', '<=', q + '\uf8ff'),
                    window.fbLimit(6)
                );
                const snap = await window.fbGetDocs(searchQuery);
                const matches = [];
                snap.forEach(d => matches.push(d.data()));

                if (matches.length) {
                    dd.innerHTML = matches.map(p => {
                        const fp = p.price - (p.price * (p.discount || 0) / 100);
                        return `<div class="sd-item" tabindex="0" role="option" onclick="window.location.href='product.html?id=${encodeURIComponent(p.id)}'" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.href='product.html?id=${encodeURIComponent(p.id)}'}">
                            <img src="${esc(p.image || FALLBACK_IMG)}" class="sd-prod-img" onerror="this.src='${FALLBACK_IMG}'" alt="${esc(p.name)}">
                            <div style="flex:1;min-width:0;">
                                <div class="sd-prod-name">${esc(p.name)}</div>
                                <div class="sd-prod-price">${fp.toLocaleString('en-US')} تومان</div>
                            </div>
                        </div>`;
                    }).join('');
                } else {
                    dd.innerHTML = `<div class="sd-empty"><i class="fas fa-search-minus"></i><div>نتیجه‌ای یافت نشد</div></div>`;
                }
                dd.style.display = 'block';
            } catch (err) {
                console.error('Search error:', err);
            }
        }, 300);
    });

    if (clear) clear.addEventListener('click', () => { inp.value = ''; clear.style.display = 'none'; dd.style.display = 'none'; inp.focus(); });
    document.addEventListener('click', e => { if (!inp.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none'; });
}

async function getUserProfile(uid) {
    try { const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid)); return snap.exists() ? snap.data() : null; }
    catch (e) { return null; }
}
function updateAuthUI() {
    const authLink = document.getElementById('authLink');
    const label = document.getElementById('userLabel');
    if (state.currentUser) { authLink.href = 'profile.html'; label.innerText = state.currentUser.name || 'پنل'; }
    else { authLink.href = 'login.html'; label.innerText = 'ورود'; }
}
function updateCartUI(cart) {
    const list = Array.isArray(cart) ? cart : [];
    const c = list.reduce((a, i) => a + (i.qty || 0), 0);
    const hc = document.getElementById('headerCartCount');
    const nc = document.getElementById('mnCartCount');
    if (hc) hc.innerText = c.toLocaleString('fa-IR');
    if (nc) nc.innerText = c.toLocaleString('fa-IR');
}
function initFirebaseAuth() {
    if (!window.fbAuth || !window.fbOnAuthStateChanged) return;
    window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
        if (user) {
            const profile = await getUserProfile(user.uid);
            state.currentUser = { uid: user.uid, ...(profile || {}) };
            localStorage.setItem(DB.session, user.uid);
            updateCartUI(state.currentUser.cart || []);
        } else {
            state.currentUser = null; localStorage.removeItem(DB.session); updateCartUI([]);
        }
        updateAuthUI(); updateWishlistUI();
    });
}

async function fetchProductById(id) {
    const q = window.fbQuery(window.fbCollection(window.fbDb, 'products'), window.fbWhere('id', '==', id), window.fbLimit(5));
    const snap = await window.fbGetDocs(q);
    if (snap.empty) return null;
    const matches = []; snap.forEach(d => matches.push({ ...d.data(), _docId: d.id }));
    if (matches.length > 1) matches.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    return matches[0];
}

async function fetchRelatedProducts(product) {
    try {
        const category = product.category;
        const excludeId = product.id;
        const path = (product.categoryPath && product.categoryPath.length) ? product.categoryPath : (product.breadcrumb ? product.breadcrumb.split(' > ') : []);
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'products'), window.fbWhere('category', '==', category), window.fbLimit(30));
        const snap = await window.fbGetDocs(q);
        const list = [];
        snap.forEach(d => { const data = d.data(); if (data.id !== excludeId) list.push(data); });
        function pathOverlap(other) {
            const otherPath = (other.categoryPath && other.categoryPath.length) ? other.categoryPath : (other.breadcrumb ? other.breadcrumb.split(' > ') : []);
            let overlap = 0;
            for (let i = 0; i < Math.min(path.length, otherPath.length); i++) { if (path[i] === otherPath[i]) overlap++; else break; }
            return overlap;
        }
        list.sort((a, b) => pathOverlap(b) - pathOverlap(a));
        return list.slice(0, 5);
    } catch (e) { return []; }
}

function showError(title, msg) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('productContent').style.display = 'none';
    const box = document.getElementById('errorState');
    box.style.display = 'block';
    document.getElementById('errorTitle').innerText = title;
    document.getElementById('errorMsg').innerText = msg;
}
function getCatDisplay(p) { return p.breadcrumb || p.category || 'دسته‌بندی نشده'; }
function navigateToCategory(catName) {
    try { sessionStorage.setItem('pending_srp_category', catName); } catch (e) {}
    window.location.href = 'index.html';
}
function colorStock(color, product) {
    if (color && typeof color.stock === 'number') return color.stock;
    return (product && typeof product.stock === 'number') ? product.stock : 0;
}
function applyColorImage(colorObj) {
    if (!colorObj || !colorObj.image) return;
    const mainImg = document.getElementById('mainImage');
    if (mainImg) mainImg.src = colorObj.image;
}
function renderStarsHtml(rating) {
    const rounded = Math.round((rating || 0) * 2) / 2;
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (rounded >= i) html += '<i class="fas fa-star"></i>';
        else if (rounded >= i - 0.5) html += '<i class="fas fa-star-half-alt"></i>';
        else html += '<i class="far fa-star"></i>';
    }
    return html;
}

function renderProduct(p) {
    document.title = (p.name || 'محصول') + ' | SHOP';
    const bc = document.getElementById('breadcrumbRow');
    let bcHtml = `<a href="index.html">خانه</a>`;
    const path = (p.categoryPath && p.categoryPath.length) ? p.categoryPath : (p.breadcrumb ? p.breadcrumb.split(' > ') : []);
    path.forEach(part => {
        bcHtml += `<i class="fas fa-chevron-left"></i><a href="index.html" data-cat-name="${esc(part)}" onclick="event.preventDefault();navigateToCategory(this.dataset.catName);">${esc(part)}</a>`;
    });
    bcHtml += `<i class="fas fa-chevron-left"></i><span style="color:var(--text-primary);">${esc(p.name)}</span>`;
    bc.innerHTML = bcHtml;

    document.getElementById('catChipText').innerText = getCatDisplay(p);
    document.getElementById('prodTitle').innerText = p.name || '';
    document.getElementById('hotTag').style.display = p.hot ? 'flex' : 'none';

    const rating = p.rating || 0;
    document.getElementById('starsRow').innerHTML = renderStarsHtml(rating);
    document.getElementById('ratingNum').innerText = rating.toFixed(1);
    document.getElementById('reviewsLink').innerText = `${(p.reviews || 0).toLocaleString('fa-IR')} دیدگاه`;

    const stockEl = document.getElementById('stockNote');
    if (p.stock <= 0) { stockEl.className = 'stock-note stock-out'; stockEl.innerText = 'ناموجود'; }
    else if (p.stock <= 2) { stockEl.className = 'stock-note stock-low'; stockEl.innerText = `تنها ${p.stock.toLocaleString('fa-IR')} عدد`; }
    else { stockEl.className = 'stock-note stock-ok'; stockEl.innerText = 'موجود'; }

    const fp = p.price - (p.price * (p.discount || 0) / 100);
    document.getElementById('finalPrice').innerHTML = `${Math.round(fp).toLocaleString('en-US')} <small>تومان</small>`;
    if (p.discount > 0) {
        document.getElementById('oldPrice').style.display = 'inline';
        document.getElementById('oldPrice').innerText = p.price.toLocaleString('en-US');
        document.getElementById('discountPill').style.display = 'inline';
        document.getElementById('discountPill').innerText = `${p.discount}٪`;
        document.getElementById('discountRibbon').style.display = 'inline-block';
        document.getElementById('discountRibbon').innerText = `${p.discount}٪`;
        const mdr = document.getElementById('mobileDiscountRibbon');
        if (mdr) { mdr.style.display = 'inline-block'; mdr.innerText = `${p.discount}٪`; }
    }

    const cols = (p.colors && p.colors.length) ? p.colors : [{ name: 'مشکی', code: '#000000' }];
    const firstAvailable = cols.find(c => colorStock(c, p) > 0) || cols[0];
    state.selectedColor = firstAvailable.name;
    document.getElementById('colorNameLabel').innerText = firstAvailable.name;
    document.getElementById('colorsRow').innerHTML = cols.map((c) => {
        const cStock = colorStock(c, p);
        const isOut = cStock <= 0;
        const isActive = c.name === firstAvailable.name;
        return `
        <button type="button" class="color-wrap${isActive ? ' active' : ''}${isOut ? ' out-of-stock' : ''}"
            data-color-name="${esc(c.name)}"
            onclick="selectColor(this, this.dataset.colorName)"
            aria-pressed="${isActive ? 'true' : 'false'}"
            aria-label="رنگ ${esc(c.name)}${isOut ? ' - ناموجود' : ''}">
            <div class="color-dot${isActive ? ' active' : ''}${isOut ? ' oos-dot' : ''}" style="background:${esc(c.code)};"></div>
            <span class="color-lbl">${esc(c.name)}</span>
            ${isOut ? '<span class="color-oos-lbl">ناموجود</span>' : ''}
        </button>`;
    }).join('');

    updateAddToCartAvailability();

    const descSectionEl = document.getElementById('descSection');
    if (p.description && p.description.trim()) {
        descSectionEl.style.display = 'block';
        document.getElementById('descText').innerText = p.description;
    } else {
        descSectionEl.style.display = 'none';
    }

    // Specs - mobile list + desktop table
    if (p.specs && Object.keys(p.specs).length) {
        document.getElementById('specsSection').style.display = 'block';
        // Desktop table
        const tbody = document.querySelector('#specsTable tbody');
        tbody.innerHTML = Object.entries(p.specs).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
        // Mobile list
        document.getElementById('specsList').innerHTML = Object.entries(p.specs).map(([k, v]) => `
            <div class="spec-item"><span class="spec-key">${esc(k)}</span><span class="spec-val">${esc(v)}</span></div>
        `).join('');
    }

    const main = p.image || FALLBACK_IMG;
    const galleryRaw = (p.gallery && p.gallery.length) ? p.gallery : [];
    const seenImages = new Set([main]);
    const dedupedGallery = [];
    galleryRaw.forEach(g => { if (g && !seenImages.has(g)) { seenImages.add(g); dedupedGallery.push(g); } });
    state.images = [main, ...dedupedGallery];

    const noImageBadge = document.getElementById('noImageBadge');
    const mobileNoImageBadge = document.getElementById('mobileNoImageBadge');
    const hasImage = p.image && p.image.trim();
    if (noImageBadge) noImageBadge.style.display = hasImage ? 'none' : 'flex';
    if (mobileNoImageBadge) mobileNoImageBadge.style.display = hasImage ? 'none' : 'flex';

    renderDesktopGallery();
    renderMobileGallery();
    applyColorImage(firstAvailable);
    updateWishlistUI();
    renderStructuredData(p, fp);

    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('productContent').style.display = 'block';

    if (p.category) fetchRelatedProducts(p).then(renderRelated);
}

function renderStructuredData(p, finalPrice) {
    try {
        const data = {
            '@context': 'https://schema.org/',
            '@type': 'Product',
            name: p.name || '',
            image: (state.images && state.images.length) ? state.images : [p.image || FALLBACK_IMG],
            description: p.description || p.name || '',
            sku: String(p.id || ''),
            brand: { '@type': 'Brand', name: p.brand || 'SHOP' },
            offers: {
                '@type': 'Offer',
                url: location.href,
                priceCurrency: 'IRR',
                price: Math.round(finalPrice),
                availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
            }
        };
        if (p.reviews > 0) {
            data.aggregateRating = {
                '@type': 'AggregateRating',
                ratingValue: (p.rating || 0).toFixed(1),
                reviewCount: p.reviews
            };
        }
        let el = document.getElementById('productJsonLd');
        if (!el) {
            el = document.createElement('script');
            el.type = 'application/ld+json';
            el.id = 'productJsonLd';
            document.head.appendChild(el);
        }
        el.textContent = JSON.stringify(data);
    } catch (e) { console.error('خطا در structured data:', e); }
}

function renderDesktopGallery() {
    const rail = document.getElementById('thumbRail');
    const mainImg = document.getElementById('mainImage');
    mainImg.src = state.images[0];
    mainImg.alt = state.product ? esc(state.product.name) : 'تصویر محصول';
    rail.innerHTML = state.images.map((src, i) => `
        <button type="button" class="thumb-item${i === 0 ? ' active' : ''}" data-idx="${i}" onclick="setMainImage(${i})" aria-label="تصویر ${i + 1}" aria-pressed="${i === 0 ? 'true' : 'false'}">
            <img src="${esc(src)}" onerror="this.src='${FALLBACK_IMG}'" alt="تصویر ${i + 1}">
        </button>`).join('');
    const wrap = document.getElementById('mainImageWrap');
    wrap.addEventListener('mousemove', handleZoomMove);
    wrap.addEventListener('mouseleave', () => wrap.classList.remove('zoomed'));
    const zoomBtn = document.getElementById('zoomBtn');
    if (zoomBtn) zoomBtn.onclick = (e) => { e.stopPropagation(); openLightbox(state.currentMainIdx || 0); };
}
function setMainImage(idx) {
    state.currentMainIdx = idx;
    document.getElementById('mainImage').src = state.images[idx];
    document.querySelectorAll('.thumb-item').forEach(t => {
        const active = parseInt(t.dataset.idx) === idx;
        t.classList.toggle('active', active);
        t.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}
function handleZoomMove(e) {
    const supportsHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!supportsHover || window.innerWidth <= 900) return;
    const wrap = document.getElementById('mainImageWrap');
    const rect = wrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    wrap.style.setProperty('--zx', x + '%');
    wrap.style.setProperty('--zy', y + '%');
    wrap.classList.add('zoomed');
}

function renderMobileGallery() {
    if (typeof Swiper === 'undefined') { console.warn('[Product] Swiper not loaded'); return; }
    const wrapper = document.getElementById('mobileGalleryWrapper');
    wrapper.innerHTML = state.images.map((src, i) => `
        <div class="swiper-slide" data-idx="${i}">
            <img src="${esc(src)}" onerror="this.src='${FALLBACK_IMG}'" alt="تصویر ${i + 1}">
        </div>`).join('');
    document.getElementById('galleryCounter').innerText = `۱ / ${state.images.length.toLocaleString('fa-IR')}`;
    if (state.mobileSwiper) state.mobileSwiper.destroy(true, true);
    state.mobileGalleryDragging = false;
    state.mobileSwiper = new Swiper('#mobileGallerySwiper', {
        direction: 'horizontal',
        loop: state.images.length > 1,
        pagination: { el: '.mobile-gallery-swiper .swiper-pagination', clickable: true },
        on: {
            slideChange: function () {
                const realIdx = this.realIndex + 1;
                document.getElementById('galleryCounter').innerText = `${realIdx.toLocaleString('fa-IR')} / ${state.images.length.toLocaleString('fa-IR')}`;
            },
            touchStart: function () { state.mobileGalleryDragging = false; },
            touchMove: function () { state.mobileGalleryDragging = true; },
            click: function () { if (state.mobileGalleryDragging) return; openLightbox(this.realIndex); }
        }
    });
}

function openLightbox(startIdx) {
    if (typeof Swiper === 'undefined') { console.warn('[Product] Swiper not loaded'); return; }
    const overlay = document.getElementById('lightboxOverlay');
    const wrapper = document.getElementById('lightboxWrapper');
    wrapper.innerHTML = state.images.map(src => `
        <div class="swiper-slide">
            <div class="swiper-zoom-container">
                <img src="${esc(src)}" onerror="this.src='${FALLBACK_IMG}'" alt="تصویر بزرگ">
            </div>
        </div>`).join('');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (state.lightboxSwiper) state.lightboxSwiper.destroy(true, true);
    state.lightboxSwiper = new Swiper('#lightboxSwiper', {
        direction: 'horizontal',
        zoom: { maxRatio: 4, minRatio: 1 },
        initialSlide: startIdx || 0,
        navigation: { nextEl: '.lightbox-swiper .swiper-button-next', prevEl: '.lightbox-swiper .swiper-button-prev' },
        on: {
            slideChange: function () {
                document.getElementById('lightboxCount').innerText = `${(this.activeIndex + 1).toLocaleString('fa-IR')} / ${state.images.length.toLocaleString('fa-IR')}`;
            }
        }
    });
    document.getElementById('lightboxCount').innerText = `${((startIdx || 0) + 1).toLocaleString('fa-IR')} / ${state.images.length.toLocaleString('fa-IR')}`;
}
function closeLightbox() {
    document.getElementById('lightboxOverlay').classList.remove('open');
    document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

function selectColor(wrap, name) {
    document.querySelectorAll('.color-wrap').forEach(w => { w.classList.remove('active'); w.setAttribute('aria-pressed', 'false'); });
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    wrap.classList.add('active'); wrap.setAttribute('aria-pressed', 'true');
    wrap.querySelector('.color-dot').classList.add('active');
    state.selectedColor = name;
    document.getElementById('colorNameLabel').innerText = name;
    applyColorImage(getSelectedColorObj());
    updateAddToCartAvailability();
}
function getSelectedColorObj() {
    if (!state.product || !state.product.colors) return null;
    return state.product.colors.find(c => c.name === state.selectedColor) || null;
}
function updateAddToCartAvailability() {
    if (!state.product) return;
    const btn = document.getElementById('btnAddCart');
    const cObj = getSelectedColorObj();
    const availableStock = cObj ? colorStock(cObj, state.product) : (state.product.stock || 0);
    const qtyInp = document.getElementById('qtyInput');
    if (availableStock <= 0) {
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-ban"></i> ناموجود';
        if (qtyInp) { setQtyValue(0); qtyInp.disabled = true; }
    } else {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-shopping-cart"></i> افزودن به سبد';
        if (qtyInp) { qtyInp.disabled = false; let v = parseInt(qtyInp.value); if (isNaN(v) || v < 1) v = 1; if (v > availableStock) v = availableStock; setQtyValue(v); }
    }
}
function setQtyValue(v) {
    const inp = document.getElementById('qtyInput');
    if (!inp) return;
    inp.value = v; inp.setAttribute('aria-valuenow', String(v));
}
function changeQty(delta) {
    const inp = document.getElementById('qtyInput');
    const cObj = getSelectedColorObj();
    const stock = cObj ? colorStock(cObj, state.product) : (state.product ? (state.product.stock || 0) : 0);
    if (stock <= 0) { showToast('این کالا/رنگ ناموجود است'); return; }
    let v = parseInt(inp.value) + delta;
    if (v < 1) v = 1;
    if (v > stock) { showToast(`حداکثر ${stock.toLocaleString('fa-IR')} عدد موجود است`); return; }
    setQtyValue(v);
}

let isAddingToCart = false;
async function addToCart() {
    if (!state.product) return;
    if (isAddingToCart) return;
    if (!state.currentUser) {
        showToast('لطفاً ابتدا وارد شوید');
        setTimeout(() => window.location.href = 'login.html', 1200);
        return;
    }
    isAddingToCart = true;
    const btn = document.getElementById('btnAddCart');
    const original = btn.innerHTML;
    try {
        const qty = parseInt(document.getElementById('qtyInput').value) || 1;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال بررسی...';
        let liveProduct = state.product;
        try {
            const fresh = await fetchProductById(state.product.id);
            if (fresh) { liveProduct = fresh; state.product = fresh; }
        } catch (e) { console.error('خطا در بازخوانی:', e); }
        const cObj = (liveProduct.colors || []).find(c => c.name === state.selectedColor) || null;
        const liveStock = cObj ? colorStock(cObj, liveProduct) : (liveProduct.stock || 0);
       
        if (liveStock <= 0) {
            showToast('متاسفانه این محصول/رنگ ناموجود شده');
            updateAddToCartAvailability();
            return;
        }

        if (qty > liveStock) {
            showToast(`موجودی کافی نیست؛ فقط ${liveStock.toLocaleString('fa-IR')} عدد`);
            btn.disabled = false; btn.innerHTML = original; return;
        }
       
        let freshCart = [];
        try {
            const userSnap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'users', state.currentUser.uid));
            if (userSnap.exists()) {
                const userData = userSnap.data();
                freshCart = Array.isArray(userData.cart) ? [...userData.cart] : [];
            }
        } catch (e) { console.error('خطا در خواندن سبد:', e); }

        let cart = freshCart;
        const ex = cart.find(x => x.id === liveProduct.id && x.color === state.selectedColor);
        if (ex) {
            if (ex.qty + qty > liveStock) { showToast('موجودی کافی نیست'); btn.disabled = false; btn.innerHTML = original; return; }
            ex.qty += qty;
        } else {
            cart.push({ id: liveProduct.id, qty, color: state.selectedColor, name: liveProduct.name });
        }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ثبت...';
        try {
            await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', state.currentUser.uid), { cart });
            state.currentUser.cart = cart;
            updateCartUI(cart);
            showToast(`با رنگ ${state.selectedColor} به سبد اضافه شد`);
        } catch (e) { console.error(e); showToast('خطا در اتصال به سرور'); }
        finally { updateAddToCartAvailability(); }
    } finally { isAddingToCart = false; }
}

function getWishlist() {
    if (!state.currentUser) return [];
    return wishlistService.normalizeList(state.currentUser.wishlist);
}

async function toggleWishlist() {
    if (!state.product) return;
    if (!state.currentUser) { 
        showToast('برای علاقه‌مندی وارد شوید'); 
        setTimeout(() => window.location.href = 'login.html', 1200); 
        return; 
    }

    const btn = document.getElementById('wishBtn');
    const icon = btn.querySelector('i');
    const currentList = getWishlist();

    // استفاده از سرویس جدید برای سوییچ و ثبت قیمت زمان اضافه شدن
    const { list: updatedList, added } = wishlistService.toggle(currentList, state.product.id, state.product);

    if (added) { 
        btn.classList.add('active'); 
        icon.className = 'fas fa-heart'; 
    } else { 
        btn.classList.remove('active'); 
        icon.className = 'far fa-heart'; 
    }

    btn.disabled = true;
    await saveWishlistWithRetry(updatedList, !added, btn, icon, 0);
}

async function saveWishlistWithRetry(wl, wasActive, btn, icon, attempt) {
    try {
        // ذخیره یکپارچه روی Firestore با استفاده از تابع سرویس
        await wishlistService.persistToFirestore(state.currentUser.uid, wl, window.fbUpdateDoc, window.fbDoc, window.fbDb);
        state.currentUser.wishlist = wl;
        showToast(wasActive ? 'حذف شد' : 'اضافه شد');
        btn.disabled = false;
    } catch (e) {
        console.error('خطا:', e);
        if (attempt < 1) { 
            setTimeout(() => saveWishlistWithRetry(wl, wasActive, btn, icon, attempt + 1), 900); 
            return; 
        }
        if (wasActive) { btn.classList.add('active'); icon.className = 'fas fa-heart'; }
        else { btn.classList.remove('active'); icon.className = 'far fa-heart'; }
        showToast('خطا در ذخیره‌سازی'); 
        btn.disabled = false;
    }
}

function updateWishlistUI() {
    if (!state.product) return;
    const wl = getWishlist();
    const btn = document.getElementById('wishBtn');
    if (!btn) return;
    const icon = btn.querySelector('i');

    // بررسی وجود محصول در لیست با تابع سرویس
    if (wishlistService.hasId(wl, state.product.id)) { 
        btn.classList.add('active'); 
        icon.className = 'fas fa-heart'; 
    } else { 
        btn.classList.remove('active'); 
        icon.className = 'far fa-heart'; 
    }
}



function shareProduct() {
    if (!state.product) return;
    const text = `${state.product.name} - ${location.href}`;
    if (navigator.share) { navigator.share({ title: state.product.name, text }).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(() => showToast('لینک کپی شد')).catch(() => showToast('کپی ناموفق'));
    } else { showToast('مرورگر از کپی پشتیبانی نمی‌کند'); }
}

function renderRelated(list) {
    if (!list || !list.length) return;
    const section = document.getElementById('relatedSection');
    const grid = document.getElementById('relatedGrid');
    section.style.display = 'block';
    grid.innerHTML = list.map(p => {
        const fp = p.price - (p.price * (p.discount || 0) / 100);
        const img = p.image || FALLBACK_IMG;
        return `<div class="rel-card" tabindex="0" role="button" onclick="window.location.href='product.html?id=${encodeURIComponent(p.id)}'" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.href='product.html?id=${encodeURIComponent(p.id)}'}">
            <div class="rel-img"><img src="${esc(img)}" onerror="this.src='${FALLBACK_IMG}'" alt="${esc(p.name)}"></div>
            <div class="rel-body">
                <div class="rel-name">${esc(p.name)}</div>
                <div class="rel-price">${fp.toLocaleString('en-US')} تومان</div>
            </div>
        </div>`;
    }).join('');
}

let toastTimer = null;
function showToast(msg) {
    const t = document.getElementById('toast');
    clearTimeout(toastTimer);
    t.innerText = msg;
    t.classList.add('show');
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

async function initPage() {
    applyTheme(state.theme);
    setMobileThemeBtn();
    initSearch();
    const id = getProductIdFromURL();
    if (id === null) {
        showError('شناسه نامعتبر', 'لینک معتبر نیست.');
        return;
    }
    try {
        const product = await fetchProductById(id);
        if (!product) { showError('محصول یافت نشد', 'این محصول ممکن است حذف شده باشد.'); return; }
        state.product = product;
        renderProduct(product);
    } catch (e) {
        console.error('خطا:', e);
        showError('خطا در اتصال', 'لطفاً اینترنت خود را بررسی کنید.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('resize', () => { setMobileThemeBtn(); resetZoomOnResize(); });
});

let lastHeaderScrollY = 0;
window.addEventListener('scroll', () => {
    const header = document.getElementById('mainHeader');
    const bottomNav = document.querySelector('.mobile-nav');
    const currentY = window.scrollY;

    if (header) header.classList.toggle('scrolled', currentY > 10);

    if (currentY <= 10) {
        if (header) header.classList.remove('header-hidden');
        if (bottomNav) bottomNav.classList.remove('mn-wide');
    } else if (currentY > lastHeaderScrollY) {
        if (header) header.classList.add('header-hidden');
        if (bottomNav) bottomNav.classList.add('mn-wide');
    } else if (currentY < lastHeaderScrollY) {
        if (header) header.classList.remove('header-hidden');
        if (bottomNav) bottomNav.classList.remove('mn-wide');
    }

    lastHeaderScrollY = currentY;
}, { passive: true });

let isAppInitialized = false;

function runInit() {
    if (isAppInitialized) return;
    isAppInitialized = true;
    initPage();
    initFirebaseAuth();
}
window.addEventListener('firebase-ready', runInit);
if (window.fbAuth && window.fbDb) {
    runInit();
}


window.toggleTheme = toggleTheme;
window.changeQty = changeQty;
window.addToCart = addToCart;
window.toggleWishlist = toggleWishlist;
window.shareProduct = shareProduct;
window.closeLightbox = closeLightbox;
window.selectColor = selectColor;
window.setMainImage = setMainImage;
window.navigateToCategory = navigateToCategory;

