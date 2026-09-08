// =============================================
// CART (سبد خرید) PAGE LOGIC — sabad.html
// نسخه ۲: انتخاب آیتم (checkbox)، طراحی جدید ردیف‌ها، آکاردئون کد تخفیف
// =============================================
import * as wishlistService from './wishlist-service.js';

const DB = {
    theme: 'theme',
    legacySession: 'current_user'
};

let state = {
    user: null,
    cart: [],
    products: [],
    selectedIds: new Set(),
    shippingCost: 35000,
    appliedDiscount: 0,
    appliedCoupon: null,
    theme: localStorage.getItem(DB.theme) || 'light'
};

const FALLBACK_IMG = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkvallQ5ZGN8H0RHyH6fe91ycZ2NbnLPmx9x-2_NqnBQ&s=10';

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

let lastHeaderScrollY = 0;
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    initSearch();

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
});

let appInitialized = false;
window.addEventListener('firebase-ready', initApp);
if (window.fbAuth) initApp();

function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
        if (!user) {
            localStorage.removeItem(DB.legacySession);
            window.location.href = 'login.html';
            return;
        }

        localStorage.setItem(DB.legacySession, user.uid);

        const profile = await getUserProfile(user.uid);
        if (!profile) {
            window.location.href = 'login.html';
            return;
        }

        state.user = { uid: user.uid, ...profile };
        state.cart = Array.isArray(state.user.cart) ? state.user.cart : [];
        state.selectedIds = new Set(state.cart.map(i => i.id)); // پیش‌فرض: همه انتخاب‌شده

        const authLink = document.getElementById('authLink');
        const userLabel = document.getElementById('userLabel');
        if (authLink && userLabel) {
            authLink.href = 'profile.html';
            userLabel.classList.remove('skeleton', 'user-label-skeleton');
            userLabel.innerText = state.user.name || 'پنل کاربری';
        }

        await loadProducts();
        renderCart();
    });
}

// --- FIRESTORE HELPERS ---
async function getUserProfile(uid) {
    try {
        const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid));
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error('خطا در خواندن پروفایل از Firestore:', e);
        showToast('خطا در ارتباط با سرور', 'error');
        return null;
    }
}

async function loadProducts() {
    try {
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'products'), window.fbOrderBy('id', 'desc'));
        const snap = await window.fbGetDocs(q);
        state.products = [];
        snap.forEach(docSnap => state.products.push(docSnap.data()));
    } catch (e) {
        console.error('خطا در خواندن محصولات از Firestore:', e);
        state.products = [];
        showToast('خطا در دریافت محصولات از سرور', 'error');
    }
}

// --- THEME ---
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

// --- LIVE SEARCH ---
function initSearch() {
    const inp = document.getElementById('mainSearch');
    const clear = document.getElementById('clearSearch');
    const dd = document.getElementById('searchDropdown');
    if (!inp || !dd) return;

    let timer;
    inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        if (clear) clear.style.display = q ? 'flex' : 'none';
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!q || q.length < 2) { dd.style.display = 'none'; return; }
            const matches = state.products.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 5);
            if (matches.length) {
                dd.innerHTML = `<div class="sd-section-head">نتایج جستجو</div>` + matches.map(p => `
                    <div class="sd-item" onclick="window.location.href='product.html?id=${encodeURIComponent(p.id)}'">
                        <img src="${esc(p.image || FALLBACK_IMG)}" class="sd-prod-img" onerror="this.src='${FALLBACK_IMG}'">
                        <div style="flex:1;min-width:0;">
                            <div class="sd-prod-name">${esc(p.name)}</div>
                            <div class="sd-prod-price">${Number(p.price).toLocaleString('en-US')} تومان</div>
                        </div>
                    </div>`).join('');
                dd.style.display = 'block';
            } else {
                dd.innerHTML = `<div class="sd-empty" style="padding:20px;text-align:center;font-size:13px;color:var(--text-muted);">نتیجه‌ای یافت نشد</div>`;
                dd.style.display = 'block';
            }
        }, 200);
    });

    if (clear) clear.addEventListener('click', () => { inp.value = ''; clear.style.display = 'none'; dd.style.display = 'none'; inp.focus(); });
    document.addEventListener('click', e => { if (!inp.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none'; });
}

// --- SKELETON <-> REAL TOGGLE ---
function revealCartContent() {
    const skel = document.getElementById('cartSkeletonContainer');
    const real = document.getElementById('mainContainer');
    if (skel) skel.classList.add('hidden');
    if (real) real.classList.remove('hidden');
}

// --- RENDERING ---
function renderCart() {
    revealCartContent();

    const container = document.getElementById('cartItemsContainer');
    const trustBar = document.getElementById('cartTrustBar');
    const bulkBar = document.getElementById('cartBulkBar');
    const bottomBadges = document.getElementById('cartBottomBadges');
    const sidebar = document.getElementById('cartSidebarReal');
    const subtitleEl = document.getElementById('cartHeaderSubtitle');

    const totalQty = state.cart.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
    ['headerCartCount', 'mnCartCount', 'headerCartCount2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = totalQty.toLocaleString('fa-IR');
    });

    if (state.cart.length === 0) {
        if (subtitleEl) subtitleEl.innerText = 'سبد خرید شما خالی است';
        if (trustBar) trustBar.style.display = 'none';
        if (bulkBar) bulkBar.style.display = 'none';
        if (bottomBadges) bottomBadges.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';
        container.innerHTML = `
            <div class="empty-cart">
                <div class="empty-icon"><i class="fas fa-shopping-basket"></i></div>
                <h2>سبد خرید شما خالی است!</h2>
                <p style="color: var(--text-muted); font-size: 13px; font-weight: 700;">می‌توانید برای مشاهده محصولات به صفحه فروشگاه بروید.</p>
                <a href="index.html" class="empty-btn">بازگشت به فروشگاه</a>
            </div>`;
        const suggestionsSection = document.getElementById('suggestionsSection');
        if (suggestionsSection) suggestionsSection.style.display = 'none';
        return;
    }

    if (subtitleEl) subtitleEl.innerText = `${state.cart.length.toLocaleString('fa-IR')} کالا در سبد شما`;
    if (trustBar) trustBar.style.display = 'grid';
    if (bulkBar) bulkBar.style.display = 'flex';
    if (bottomBadges) bottomBadges.style.display = 'grid';
    if (sidebar) sidebar.style.display = 'block';

    // پاکسازی selectedIds از آیتم‌هایی که دیگر در سبد نیستند
    const cartIds = new Set(state.cart.map(i => i.id));
    state.selectedIds.forEach(id => { if (!cartIds.has(id)) state.selectedIds.delete(id); });

    let html = '';
    let subtotal = 0;
    let totalDiscount = 0;

    state.cart.forEach(item => {
        const product = state.products.find(p => p.id == item.id);
        if (!product) return;

        const finalPrice = product.price - (product.price * (product.discount || 0) / 100);
        const itemTotal = finalPrice * item.qty;
        const itemDiscount = (product.price - finalPrice) * item.qty;
        const isSelected = state.selectedIds.has(item.id);

        if (isSelected) {
            subtotal += itemTotal;
            totalDiscount += itemDiscount;
        }

        let colorName = item.color || 'مشکی';

        let stockClass = '';
        let stockText = '';
        if (product.stock <= 0) { stockClass = 'out'; stockText = 'ناموجود'; }
        else if (product.stock <= 2) { stockClass = 'low'; stockText = `تنها ${product.stock} عدد`; }
        else { stockText = `موجود (${product.stock} عدد)`; }

        const disablePlus = product.stock <= 0 || item.qty >= product.stock;
        const disableMinus = item.qty <= 1;
        const isWished = wishlistService.hasId(getWishlist(), item.id);

        html += `
            <div class="cart-item-v2" data-id="${item.id}">
                <label class="civ2-select">
                    <input type="checkbox" class="item-select-cb" data-id="${item.id}" ${isSelected ? 'checked' : ''} onchange="onItemSelectChange(${item.id}, this.checked)" aria-label="انتخاب این کالا">
                </label>
                <div class="civ2-img-wrap">
                    <img src="${esc(product.image || FALLBACK_IMG)}" alt="${esc(product.name)}" onerror="this.src='${FALLBACK_IMG}'">
                </div>
                <div class="civ2-info">
                    <span class="civ2-stock ${stockClass}">${stockText}</span>
                    <div class="civ2-name">${esc(product.name)}</div>
                    <div class="civ2-sub">رنگ: ${esc(colorName)}</div>
                    <div class="civ2-actions">
                        <button type="button" class="civ2-icon-btn${isWished ? ' active' : ''}" title="افزودن به علاقه‌مندی" onclick="toggleWishlistFromCart(${item.id})">
                            <i class="${isWished ? 'fas' : 'far'} fa-heart"></i>
                        </button>
                        <button type="button" class="civ2-icon-btn" title="اشتراک‌گذاری" onclick="shareCartItem(${item.id})">
                            <i class="fas fa-share-alt"></i>
                        </button>
                        <button type="button" class="civ2-icon-btn" title="مشاهده محصول" onclick="window.location.href='product.html?id=${item.id}'">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="civ2-left-col">
                    <div class="civ2-top-row">
                        <div class="civ2-trash" onclick="removeItem(${item.id})" title="حذف از سبد"><i class="fas fa-trash"></i></div>
                        <div class="civ2-qty">
                            <button type="button" onclick="updateQty(${item.id}, -1)" ${disableMinus ? 'disabled' : ''} aria-label="کاهش تعداد">−</button>
                            <input type="text" value="${item.qty}" readonly aria-label="تعداد">
                            <button type="button" onclick="updateQty(${item.id}, 1)" ${disablePlus ? 'disabled' : ''} aria-label="افزایش تعداد">+</button>
                        </div>
                    </div>
                    <div class="civ2-price-block">
                        <div class="civ2-final">${itemTotal.toLocaleString('en-US')} <small>تومان</small></div>
                        ${product.discount > 0 ? `
                            <span class="civ2-old">${(product.price * item.qty).toLocaleString('en-US')} تومان</span>
                            <span class="civ2-discount-pill">${product.discount}٪ تخفیف</span>` : ''}
                    </div>
                </div>
            </div>`;
    });

    container.innerHTML = html;
    updateSelectAllUI();
    updateBulkDeleteUI();
    updateSummary(subtotal, totalDiscount);
    renderSuggestions();

    const pointsEl = document.getElementById('cbbPoints');
    if (pointsEl) pointsEl.innerText = `${Math.round(subtotal / 20000).toLocaleString('fa-IR')} امتیاز`;
}

// --- SELECTION ---
function onItemSelectChange(id, checked) {
    if (checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
    renderCart();
}

function toggleSelectAllItems(cb) {
    if (cb.checked) state.cart.forEach(i => state.selectedIds.add(i.id));
    else state.selectedIds.clear();
    renderCart();
}

function updateSelectAllUI() {
    const cb = document.getElementById('selectAllItemsCb');
    if (!cb) return;
    cb.checked = state.cart.length > 0 && state.cart.every(i => state.selectedIds.has(i.id));
}

function updateBulkDeleteUI() {
    const btn = document.getElementById('cartBulkDeleteBtn');
    if (btn) btn.disabled = state.selectedIds.size === 0;
}

async function removeSelectedItems() {
    if (state.selectedIds.size === 0) return;
    if (!confirm(`آیا از حذف ${state.selectedIds.size.toLocaleString('fa-IR')} کالای انتخاب‌شده اطمینان دارید؟`)) return;
    state.cart = state.cart.filter(i => !state.selectedIds.has(i.id));
    state.selectedIds.clear();
    await saveCart();
    renderCart();
    showToast('کالاهای انتخاب‌شده حذف شدند', 'success');
}

// --- DISCOUNT ACCORDION ---
function toggleDiscountBox() {
    const acc = document.getElementById('discountAccordion');
    if (acc) acc.classList.toggle('collapsed');
}

// --- LOGIC ---
async function updateQty(id, change) {
    const itemIndex = state.cart.findIndex(i => i.id == id);
    if (itemIndex === -1) return;

    const product = state.products.find(p => p.id == id);
    const currentQty = state.cart[itemIndex].qty;
    const newQty = currentQty + change;

    if (newQty < 1) return;

    if (product) {
        if (product.stock <= 0) { showToast('متاسفانه این محصول ناموجود شده است.', 'error'); return; }
        if (newQty > product.stock) { showToast(`حداکثر ${product.stock} عدد موجود است.`, 'error'); return; }
    }

    state.cart[itemIndex].qty = newQty;
    await saveCart();
    renderCart();
}

async function removeItem(id) {
    if (confirm('آیا از حذف این محصول از سبد خرید اطمینان دارید؟')) {
        state.cart = state.cart.filter(i => i.id != id);
        state.selectedIds.delete(id);
        await saveCart();
        renderCart();
        showToast('محصول حذف شد', 'success');
    }
}

async function saveCart() {
    if (!state.user) return;
    try {
        await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', state.user.uid), { cart: state.cart });
        state.user.cart = state.cart;
    } catch (e) {
        console.error('خطا در ذخیره سبد خرید در Firestore:', e);
        showToast('خطا در ذخیره سبد خرید روی سرور', 'error');
    }
}

// --- WISHLIST FROM CART ---
function getWishlist() {
    if (!state.user) return [];
    return wishlistService.normalizeList(state.user.wishlist);
}

async function toggleWishlistFromCart(id) {
    if (!state.user) return;
    const product = state.products.find(p => p.id == id);
    const currentList = getWishlist();
    const { list: updatedList } = wishlistService.toggle(currentList, id, product);
    try {
        await wishlistService.persistToFirestore(state.user.uid, updatedList, window.fbUpdateDoc, window.fbDoc, window.fbDb);
        state.user.wishlist = updatedList;
        renderCart();
        showToast('علاقه‌مندی‌ها بروزرسانی شد', 'success');
    } catch (e) {
        console.error('خطا در بروزرسانی علاقه‌مندی‌ها:', e);
        showToast('خطا در ذخیره‌سازی', 'error');
    }
}

function shareCartItem(id) {
    const product = state.products.find(p => p.id == id);
    if (!product) return;
    const url = `${location.origin}/product.html?id=${encodeURIComponent(id)}`;
    const text = `${product.name} - ${url}`;
    if (navigator.share) { navigator.share({ title: product.name, text, url }).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast('لینک کپی شد', 'success')).catch(() => showToast('کپی ناموفق', 'error'));
    } else {
        showToast('مرورگر از کپی پشتیبانی نمی‌کند', 'error');
    }
}

/* =========================================================
   کوپن: محاسبه‌ی مبلغ واقعی تخفیفِ کوپن اعمال‌شده
   ========================================================= */
function computeCouponDiscountAmount(coupon, subtotal) {
    if (!coupon) return 0;
    if (coupon.minAmount && subtotal < coupon.minAmount) return 0;
    let amount = 0;
    if (coupon.discountType === 'fixed') amount = Number(coupon.discountValue) || 0;
    else amount = subtotal * ((Number(coupon.discountValue) || 0) / 100);
    if (coupon.maxDiscount != null && amount > coupon.maxDiscount) amount = coupon.maxDiscount;
    if (amount > subtotal) amount = subtotal;
    return Math.max(0, amount);
}

function updateSummary(subtotal, discount) {
    const selectedCount = state.cart.filter(i => state.selectedIds.has(i.id)).reduce((acc, i) => acc + i.qty, 0);
    document.getElementById('summaryCount').innerText = selectedCount.toLocaleString('en-US');
    document.getElementById('summarySubtotal').innerText = subtotal.toLocaleString('en-US') + ' تومان';
    document.getElementById('summaryDiscount').innerText = discount.toLocaleString('en-US') + ' تومان';

    let shipping = subtotal > 0 ? state.shippingCost : 0;
    if (subtotal > 1000000) shipping = 0;
    document.getElementById('summaryShipping').innerText = shipping === 0 ? 'رایگان' : shipping.toLocaleString('en-US') + ' تومان';

    const couponRow = document.getElementById('couponSummaryRow');
    let couponDiscount = 0;
    if (state.appliedCoupon) {
        couponDiscount = computeCouponDiscountAmount(state.appliedCoupon, subtotal);
        if (couponRow) {
            couponRow.style.display = 'flex';
            document.getElementById('summaryCouponDiscount').innerText = couponDiscount > 0
                ? '−' + Math.round(couponDiscount).toLocaleString('en-US') + ' تومان'
                : 'مشروط به حداقل خرید';
        }
    } else if (couponRow) {
        couponRow.style.display = 'none';
    }

    const total = subtotal + shipping - couponDiscount;
    document.getElementById('summaryTotal').innerText = Math.ceil(Math.max(0, total)).toLocaleString('en-US') + ' تومان';

    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.disabled = subtotal <= 0;
}

async function findCouponByCode(code) {
    if (!code) return null;
    try {
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'coupons'), window.fbWhere('code', '==', code));
        const snap = await window.fbGetDocs(q);
        if (snap.empty) return null;
        let result = null;
        snap.forEach(d => { if (!result) result = { ...d.data(), _docId: d.id }; });
        return result;
    } catch (e) {
        console.error('خطا در خواندن کد تخفیف از Firestore:', e);
        return null;
    }
}

function checkCouponValidity(coupon) {
    if (!coupon || !coupon.active) return { ok: false, reason: 'این کد تخفیف نامعتبر یا غیرفعال است' };
    const now = new Date();
    if (coupon.startDate && now < new Date(coupon.startDate)) return { ok: false, reason: 'این کد تخفیف هنوز فعال نشده است' };
    if (coupon.endDate) {
        const end = new Date(coupon.endDate);
        end.setHours(23, 59, 59, 999);
        if (now > end) return { ok: false, reason: 'مهلت استفاده از این کد تخفیف به پایان رسیده است' };
    }
    if (coupon.usageLimit != null && (coupon.usedCount || 0) >= coupon.usageLimit) {
        return { ok: false, reason: 'ظرفیت استفاده از این کد تخفیف تکمیل شده است' };
    }
    if (coupon.audience && coupon.audience !== 'all') {
        if (!state.user || !state.user.createdAt) return { ok: false, reason: 'این کد تخفیف برای این حساب کاربری قابل استفاده نیست' };
        const days = (now - new Date(state.user.createdAt)) / 86400000;
        if (coupon.audience === 'newUsers' && days > (coupon.audienceDays || 30)) return { ok: false, reason: 'این کد فقط برای کاربران تازه‌عضو معتبر است' };
        if (coupon.audience === 'oldUsers' && days < (coupon.audienceDays || 365)) return { ok: false, reason: 'این کد فقط برای کاربران قدیمی معتبر است' };
    }
    if (coupon.scope === 'category' && coupon.scopeCategory) {
        const cartHasCategory = state.cart.some(item => {
            if (!state.selectedIds.has(item.id)) return false;
            const p = state.products.find(prod => prod.id == item.id);
            return p && p.category === coupon.scopeCategory;
        });
        if (!cartHasCategory) return { ok: false, reason: `این کد فقط برای دسته‌بندی «${coupon.scopeCategory}» معتبر است` };
    }
    return { ok: true };
}

function resetDiscountBoxStyle() {
    const box = document.querySelector('.discount-box');
    if (box) { box.style.background = ''; box.style.borderColor = ''; }
}

async function applyDiscount() {
    const inputEl = document.getElementById('discountInput');
    const code = inputEl.value.trim().toUpperCase();
    if (!code) return;

    const btn = document.querySelector('.discount-btn');
    const originalLabel = btn ? btn.innerText : '';
    if (btn) { btn.disabled = true; btn.innerText = '...'; }

    try {
        const coupon = await findCouponByCode(code);
        if (!coupon) {
            state.appliedCoupon = null;
            resetDiscountBoxStyle();
            showToast('کد تخفیف نامعتبر است', 'error');
            renderCart();
            return;
        }
        const validity = checkCouponValidity(coupon);
        if (!validity.ok) {
            state.appliedCoupon = null;
            resetDiscountBoxStyle();
            showToast(validity.reason, 'error');
            renderCart();
            return;
        }
        state.appliedCoupon = coupon;
        const box = document.querySelector('.discount-box');
        if (box) { box.style.background = 'rgba(16, 185, 129, 0.1)'; box.style.borderColor = 'var(--success)'; }
        showToast(`کد «${coupon.code}» با موفقیت اعمال شد`, 'success');
        renderCart();
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = originalLabel; }
    }
}

function processCheckout() {
    const selectedCount = state.selectedIds.size;
    if (state.cart.length === 0 || selectedCount === 0) {
        showToast('حداقل یک کالا را برای خرید انتخاب کنید', 'error');
        return;
    }

    if (!state.user || !state.user.address) {
        showToast('لطفاً ابتدا آدرس خود را در پروفایل تکمیل کنید', 'error');
        setTimeout(() => window.location.href = 'profile.html', 1500);
        return;
    }

    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('active');

    setTimeout(() => {
        overlay.classList.remove('active');
        window.location.href = 'checkout.html';
    }, 2000);
}

function renderSuggestions() {
    const container = document.getElementById('suggestionGrid');
    const section = document.getElementById('suggestionsSection');
    if (!container || !section) return;

    const cartCategories = [...new Set(state.cart.map(item => {
        const p = state.products.find(prod => prod.id == item.id);
        return p ? p.category : null;
    }).filter(Boolean))];

    const suggestions = state.products.filter(p =>
        !state.cart.find(c => c.id == p.id) &&
        cartCategories.includes(p.category) && p.stock > 0
    ).slice(0, 4);

    if (suggestions.length > 0) {
        section.style.display = 'block';
        container.innerHTML = suggestions.map(p => `
            <div class="sugg-card" onclick="addToCartQuick(${p.id})">
                <img src="${esc(p.image || FALLBACK_IMG)}" alt="${esc(p.name)}" onerror="this.src='${FALLBACK_IMG}'">
                <div class="sugg-title">${esc(p.name)}</div>
                <div class="sugg-price">${(p.price - (p.price * (p.discount || 0) / 100)).toLocaleString('en-US')} تومان</div>
                <button type="button"><i class="fas fa-plus"></i> افزودن به سبد</button>
            </div>`).join('');
    } else {
        section.style.display = 'none';
    }
}

async function addToCartQuick(id) {
    const p = state.products.find(prod => prod.id == id);
    if (!p || p.stock <= 0) return showToast('محصول ناموجود است', 'error');

    const existing = state.cart.find(i => i.id == id);
    if (existing) {
        if (existing.qty >= p.stock) return showToast(`موجودی این محصول ${p.stock} عدد است`, 'error');
        existing.qty++;
    } else {
        state.cart.push({ id: id, qty: 1, color: p.colors && p.colors.length ? p.colors[0].name : 'مشکی' });
    }
    state.selectedIds.add(id);
    await saveCart();
    renderCart();
    showToast('به سبد خرید اضافه شد', 'success');
}

let toastTimer = null;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    clearTimeout(toastTimer);
    toast.className = `toast ${type} show`;
    toastMsg.innerText = msg;
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// =========================================================
// FIX: این فایل به‌صورت module لود می‌شود، پس توابعی که در
// onclick داخل HTML (استاتیک یا داینامیک) صدا زده می‌شوند باید
// صریحاً روی window قرار بگیرند (هم‌سو با الگوی product.js/profile.js)
// =========================================================
window.toggleTheme = toggleTheme;
window.updateQty = updateQty;
window.removeItem = removeItem;
window.onItemSelectChange = onItemSelectChange;
window.toggleSelectAllItems = toggleSelectAllItems;
window.removeSelectedItems = removeSelectedItems;
window.toggleDiscountBox = toggleDiscountBox;
window.applyDiscount = applyDiscount;
window.processCheckout = processCheckout;
window.addToCartQuick = addToCartQuick;
window.toggleWishlistFromCart = toggleWishlistFromCart;
window.shareCartItem = shareCartItem;