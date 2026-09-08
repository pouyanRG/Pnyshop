import * as wishlistService from './wishlist-service.js';

const WISHLIST_KEY = 'shop_wishlist';
const THEME_KEY = 'theme';
function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}
const LEGACY_SESSION_KEY = 'current_user'; // فقط پل موقتی برای صفحات مهاجرت‌نشده

let state = {
    theme: localStorage.getItem(THEME_KEY) || 'light',
    products: [],
    user: null,      // { uid, name, mobile, melli, email, address, post, date, wallet, points, cart, ... }
    orders: []        // آخرین سفارشات این کاربر از Firestore
};

/* --- Window Load & Preloader Elimination --- */
window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('loadingScreen');
        if(loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 400);
});

/* --- Initialization --- */
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    initSearch();
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


let appInitialized = false;

window.addEventListener('firebase-ready', initApp);
if (window.fbAuth) initApp();

function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
        if (!user) {
            localStorage.removeItem(LEGACY_SESSION_KEY);
            window.location.href = 'login.html';
            return;
        }

        localStorage.setItem(LEGACY_SESSION_KEY, user.uid); // پل موقتی

        await loadUserData(user.uid);
        await loadProductsForSearch();
        initSearchAfterLoad();
    });
}

/* --- Synced Light/Dark Theme Engine --- */
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
    localStorage.setItem(THEME_KEY, state.theme);
    applyTheme(state.theme);
}

/* --- Products (for header live search) --- */
async function loadProductsForSearch() {
    try {
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'products'), window.fbOrderBy('id', 'desc'));
        const snap = await window.fbGetDocs(q);
        state.products = [];
        snap.forEach(docSnap => state.products.push(docSnap.data()));
    } catch (e) {
        console.error('خطا در خواندن محصولات از Firestore:', e);
        state.products = [];
    }
}

function initSearchAfterLoad() {
    // در صورتی که initSearch زودتر بدون محصولات صدا خورده، دوباره بایندینگ لازم نیست
    // چون رویدادها یک‌بار در initSearch ثبت شده و state.products به‌روزرسانی شده است.
}

function initSearch() {
    const inp = document.getElementById('mainSearch');
    const clear = document.getElementById('clearSearch');
    const dd = document.getElementById('searchDropdown');
    if (!inp || !dd) return;

    let timer;
    inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        if(clear) clear.style.display = q ? 'flex' : 'none';
        clearTimeout(timer);
        timer = setTimeout(() => {
            if(!q || q.length < 2) { dd.style.display = 'none'; return; }
            const matches = state.products.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 5);
            if(matches.length) {
                dd.innerHTML = `<div class="sd-section-head">نتایج جستجو</div>` + matches.map(p => `
                    <div class="sd-item" onclick="window.location.href='product.html?id=${encodeURIComponent(p.id)}'">
                        <img src="${esc(p.image)}" class="sd-prod-img" onerror="this.src='https://via.placeholder.com/44'">
                        <div>
                            <div class="sd-prod-name">${esc(p.name)}</div>
                            <div class="sd-prod-price">${Math.round(p.price - (p.price * (p.discount || 0) / 100)).toLocaleString('en-US')} تومان</div>
                        </div>
                    </div>`).join('');
                dd.style.display = 'block';
            } else {
                dd.innerHTML = `<div class="sd-section-head">نتیجه‌ای یافت نشد</div>`;
                dd.style.display = 'block';
            }
        }, 200);
    });

    if(clear) {
        clear.addEventListener('click', () => { inp.value = ''; clear.style.display = 'none'; dd.style.display = 'none'; inp.focus(); });
    }
    document.addEventListener('click', e => { if(!inp.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none'; });
}

/* --- Reveal helper: اسکلتون → محتوای واقعی --- */
function revealProfileContent() {
    const skel = document.getElementById('profileSkeleton');
    const real = document.getElementById('profileContainer');
    if (skel) skel.classList.add('hidden');
    if (real) real.classList.remove('hidden');
}

/* --- User Profile Loader (Firestore) --- */
async function loadUserData(uid) {
    let profile = await getUserProfile(uid);

    if (!profile) {
        // در حالت عادی login.html همیشه سند کاربر را می‌سازد؛ این فقط یک شبکه‌ی ایمنی است
        profile = {
            mobile: '', name: '', melli: '', email: '', address: '', post: '',
            date: new Date().toLocaleDateString('fa-IR'),
            wallet: 0, points: 0, cart: [], wishlist: []
        };
        try {
            await window.fbSetDoc(window.fbDoc(window.fbDb, 'users', uid), profile);
        } catch (e) {
            console.error('خطا در ساخت پروفایل پیش‌فرض در Firestore:', e);
        }
    }

    // ادغام و همگام‌سازی علاقه‌مندی‌های حالت مهمان (localStorage) با سرور هنگام ورود
    try {
        profile.wishlist = await wishlistService.syncWishlistOnLogin(
            uid,
            profile.wishlist || [],
            window.fbUpdateDoc,
            window.fbDoc,
            window.fbDb
        );
    } catch (e) {
        console.error('خطا در همگام‌سازی علاقه‌مندی‌ها هنگام ورود:', e);
    }

    state.user = { uid, ...profile };

    /* Update Sidebar */
    document.getElementById('side-name').innerText = state.user.name ? state.user.name : "کاربر مهمان";
    const sideEmailEl = document.getElementById('side-email');
    if (sideEmailEl) sideEmailEl.innerText = state.user.email || '';

    /* Update Top Header Auth Button */
    const authLink = document.getElementById('authLink');
    const userLabel = document.getElementById('userLabel');
    if (authLink && userLabel) {
        authLink.href = 'profile.html';
        userLabel.classList.remove('skeleton', 'user-label-skeleton');
        userLabel.innerText = state.user.name ? state.user.name : "پروفایل";
    }

    /* Update Forms & Text Displays */
    const fields = ['name', 'melli', 'email', 'address', 'post', 'date', 'mobile', 'wallet', 'points'];
    fields.forEach(f => {
        const displayEl = document.getElementById('v-' + f);
        const inputEl = document.getElementById('i-' + f);
        let val = state.user[f] !== undefined ? state.user[f] : (f === 'wallet' || f === 'points' ? '0' : '');
        if(f === 'wallet' || f === 'points') val = Number(val).toLocaleString('en-US');

        if (displayEl) displayEl.innerText = val || 'ثبت نشده';
        if (inputEl) inputEl.value = state.user[f] || '';
    });

    /* Sync Global Cart Badge Counts */
    updateCartBadges(state.user.cart || []);

    renderFavs();
    await renderOrders();

    // اسکلتون سایدبار + کارت اطلاعات شخصی فقط اینجا (بعد از آماده شدن کامل داده) کنار می‌رود
    revealProfileContent();
}

async function getUserProfile(uid) {
    try {
        const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid));
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error('خطا در خواندن پروفایل از Firestore:', e);
        return null;
    }
}

/* --- Synchronize Copied Top & Bottom Cart Count Badges --- */
function updateCartBadges(cartArray) {
    const totalQty = cartArray.reduce((acc, item) => acc + (Number(item.qty) || 1), 0);
    const headBadge = document.getElementById('headerCartCount');
    const navBadge = document.getElementById('mnCartCount');
    if(headBadge) headBadge.innerText = totalQty.toLocaleString('fa-IR');
    if(navBadge) navBadge.innerText = totalQty.toLocaleString('fa-IR');
}

/* --- Section Navigation Engine --- */
function showSection(sectionId, element) {
    const cards = document.querySelectorAll('.main-content > .card');
    cards.forEach(card => card.classList.add('hidden'));

    const targetCard = document.getElementById('sec-' + sectionId);
    if (targetCard) {
        targetCard.classList.remove('hidden');
    } else return;

    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => item.classList.remove('active'));
    if (element) element.classList.add('active');

    if (sectionId === 'orders') {
        const orderTabs = document.querySelectorAll('.order-tab-btn');
        orderTabs.forEach(btn => btn.classList.remove('active'));
        if(orderTabs[0]) orderTabs[0].classList.add('active');
        renderOrdersList('current');
    }
}

/* --- Profile Edit Toggler --- */
function toggleEdit(status) {
    const fields = ['name', 'melli', 'email', 'address', 'post', 'mobile'];
    fields.forEach(f => {
        const spanEl = document.getElementById('v-' + f);
        const inpEl = document.getElementById('i-' + f);
        if(spanEl) spanEl.style.display = status ? 'none' : 'block';
        if(inpEl) inpEl.style.display = status ? 'block' : 'none';
    });
    document.getElementById('edit-btn').style.display = status ? 'none' : 'inline-flex';
    document.getElementById('save-btn').style.display = status ? 'inline-flex' : 'none';
}

/* --- Save User Information (Firestore) --- */
async function saveUserData() {
    if (!state.user || !state.user.uid) return;

        const rawMobile = document.getElementById('i-mobile').value.trim();
    // نرمال‌سازی ارقام فارسی/عربی به لاتین (هماهنگ با login.js)
    const toLatinDigits = s => String(s || '').replace(/[۰-۹٠-٩]/g, ch => {
        const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
        const i1 = fa.indexOf(ch); if (i1 > -1) return String(i1);
        const i2 = ar.indexOf(ch); if (i2 > -1) return String(i2);
        return ch;
    });
    const mobile = toLatinDigits(rawMobile);

    if (mobile && !/^09\d{9}$/.test(mobile)) {
        alert('شماره موبایل معتبر نیست (باید مثلاً 09123456789 باشد).');
        return;
    }

    const updatedData = {
        name: document.getElementById('i-name').value.trim(),
        melli: document.getElementById('i-melli').value.trim(),
        email: document.getElementById('i-email').value.trim(),
        address: document.getElementById('i-address').value.trim(),
        post: document.getElementById('i-post').value.trim(),
        mobile: mobile
    };

    const saveBtn = document.getElementById('save-btn');
    const originalHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ذخیره...';

    try {
        await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', state.user.uid), updatedData);
        Object.assign(state.user, updatedData);
        alert("اطلاعات حساب با موفقیت ذخیره شد.");
        toggleEdit(false);
        await loadUserData(state.user.uid);
    } catch (e) {
        console.error('خطا در ذخیره پروفایل در Firestore:', e);
        alert("خطا در ذخیره اطلاعات روی سرور. دوباره تلاش کنید.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
    }
}

/* --- Wishlist (Firestore & Local Storage Sync) --- */
function getWishlistIds() {
    if (state.user && Array.isArray(state.user.wishlist) && state.user.wishlist.length > 0) {
        return wishlistService.getIds(state.user.wishlist);
    }
    return wishlistService.getIds(wishlistService.getLegacyLocal());
}

function renderFavs() {
    const wishlistIds = getWishlistIds();
    const products = state.products;
    const listDiv = document.getElementById('favs-list');

    if (!listDiv) return;

    const favProducts = products.filter(p => wishlistIds.includes(Number(p.id)));

    if (favProducts.length === 0) {
        listDiv.innerHTML = '<div style="text-align:center; padding:40px; font-weight:700; color:var(--text-muted); grid-column: 1/-1;">لیست علاقه‌مندی‌های شما خالی است.</div>';
        return;
    }

    listDiv.innerHTML = favProducts.map(p => {
        // محاسبه قیمت نهایی با تابع سرویس
        const finalPrice = wishlistService.getFinalPrice(p);
        const oldPrice = Number(p.price).toLocaleString('en-US');
        const priceDisplay = Number(p.discount) > 0 ? `<span class="old-price">${oldPrice}</span>` : '';
        const pid = Number(p.id);

        return `
            <div class="wishlist-card">
                <div class="wishlist-img-wrapper" onclick="window.location.href='product.html?id=${pid}'" style="cursor:pointer;">
                    <img src="${esc(p.image)}" alt="${esc(p.name)}" onerror="this.src='https://via.placeholder.com/160'">
                    <div class="wishlist-actions-overlay">
                        <button class="action-btn-small btn-add-cart-mini" onclick="event.stopPropagation(); addToCartFromWishlist(${pid})" title="افزودن به سبد">
                            <i class="fas fa-shopping-cart"></i>
                        </button>
                        <button class="action-btn-small btn-remove-mini" onclick="event.stopPropagation(); removeFromFav(${pid})" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="wishlist-info">
                    <div class="wishlist-title">${esc(p.name)}</div>
                    <div class="wishlist-price-row">
                        ${priceDisplay}
                        <div class="final-price">${finalPrice.toLocaleString('en-US')} <small>تومان</small></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function removeFromFav(id) {
    if (!confirm("آیا از حذف این کالا از علاقه‌مندی‌ها اطمینان دارید؟")) return;

    const targetId = Number(id);
    const currentList = state.user && state.user.wishlist ? state.user.wishlist : wishlistService.getLegacyLocal();
    
    // سوییچ (حذف) با تابع سرویس
    const { list: updatedList } = wishlistService.toggle(currentList, targetId);

    // به‌روزرسانی استیت محلی
    if (state.user) {
        state.user.wishlist = updatedList;
    }
    wishlistService.saveLegacyLocal(updatedList);

    // ذخیره همگام روی دیتابیس Firestore
    if (state.user && state.user.uid) {
        try {
            await wishlistService.persistToFirestore(state.user.uid, updatedList, window.fbUpdateDoc, window.fbDoc, window.fbDb);
        } catch (e) {
            console.error('خطا در به‌روزرسانی علاقه‌مندی‌ها در Firestore:', e);
        }
    }

    renderFavs();
}

async function addToCartFromWishlist(id) {
    if (!state.user || !state.user.uid) return;
    const targetProd = state.products.find(p => Number(p.id) === Number(id));
    if(!targetProd) return;

    if (Number(targetProd.stock) <= 0) {
        alert('متاسفانه این محصول در حال حاضر ناموجود است.');
        return;
    }

    // انتخاب اولین رنگ موجود (هماهنگ با الگوی cart.js/product.js)؛
    // قبلاً اصلاً فیلد color ست نمی‌شد که باعث ناهماهنگی با بقیه‌ی سبد می‌شد.
    let colorName = 'مشکی';
    if (Array.isArray(targetProd.colors) && targetProd.colors.length) {
        const availableColor = targetProd.colors.find(c => (typeof c.stock === 'number' ? c.stock : targetProd.stock) > 0);
        colorName = (availableColor || targetProd.colors[0]).name;
    }

    let userCart = Array.isArray(state.user.cart) ? [...state.user.cart] : [];
    let existingItem = userCart.find(item => Number(item.id) === Number(id) && item.color === colorName);
    if (existingItem) {
        if (existingItem.qty >= targetProd.stock) {
            alert(`حداکثر ${targetProd.stock} عدد از این محصول موجود است.`);
            return;
        }
        existingItem.qty = Number(existingItem.qty) + 1;
    } else {
        userCart.push({ id: targetProd.id, name: targetProd.name, color: colorName, qty: 1 });
    }

    try {
        await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', state.user.uid), { cart: userCart });
        state.user.cart = userCart;
        updateCartBadges(userCart);
        alert("محصول با موفقیت به سبد خرید اضافه شد.");
    } catch (e) {
        console.error('خطا در بروزرسانی سبد خرید در Firestore:', e);
        alert("خطا در افزودن به سبد خرید. دوباره تلاش کنید.");
    }
}
/* --- Orders (Firestore) ---
   کالکشن "orders" دارای فیلد userId (برابر uid کاربر) است؛
   برای جلوگیری از نیاز به ایندکس ترکیبی، فقط با where فیلتر
   می‌کنیم و مرتب‌سازی بر اساس تاریخ را در سمت کلاینت انجام می‌دهیم. */
async function renderOrders() {
    if (!state.user || !state.user.uid) return;
    try {
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'orders'), window.fbWhere('userId', '==', state.user.uid));
        const snap = await window.fbGetDocs(q);
        state.orders = [];
        snap.forEach(docSnap => state.orders.push({ ...docSnap.data(), _docId: docSnap.id }));
        state.orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } catch (e) {
        console.error('خطا در خواندن سفارشات از Firestore:', e);
        state.orders = [];
    }
    renderOrdersList('current');
}

/* --- Orders Tab Filtering & Render Engine --- */
function filterOrders(type, btnElement) {
    document.querySelectorAll('.order-tab-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) {
        btnElement.classList.add('active');
    } else if (typeof event !== 'undefined' && event && event.target) {
        event.target.classList.add('active');
    }
    renderOrdersList(type);
}

function renderOrdersList(filterType = 'current') {
    let myOrders = state.orders.slice();

    if (filterType === 'current') {
        // سفارشاتی که نه تحویل شده‌اند و نه لغو شده‌اند
        myOrders = myOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    } else {
        // سفارشات تحویل داده شده
        myOrders = myOrders.filter(o => o.status === 'delivered');
    }

    const listDiv = document.getElementById('orders-list');
    if (!listDiv) return;

    if (myOrders.length === 0) {
        listDiv.innerHTML = `<div style="text-align:center; padding:40px; font-weight:700; color:var(--text-muted);">${filterType === 'current' ? 'سفارش جاری فعال ندارید.' : 'سفارش تحویل داده شده‌ای یافت نشد.'}</div>`;
        return;
    }

    listDiv.innerHTML = '';

    myOrders.forEach(order => {
        const dateObj = new Date(order.createdAt || Date.now());
        const datePersian = dateObj.toLocaleDateString('fa-IR');
        const timePersian = dateObj.toLocaleTimeString('fa-IR');

        let currentStepIndex = 0;
        if (order.status === 'paid' || order.status === 'pending_payment') currentStepIndex = 0;
        else if (order.status === 'processing') currentStepIndex = 1;
        else if (order.status === 'shipped') currentStepIndex = 2;
        else if (order.status === 'delivered') currentStepIndex = 3;

        let statusClass = [], checkIcon = [], lineClass = [];
        for (let i = 0; i < 4; i++) {
            if (i <= currentStepIndex) {
                statusClass.push('completed'); checkIcon.push('<i class="fas fa-check"></i>');
            } else {
                statusClass.push('inactive'); checkIcon.push('');
            }

            if (i < currentStepIndex) lineClass.push('filled final-filled');
            else if (i === currentStepIndex) lineClass.push('filled filling-' + (i + 1));
            else lineClass.push('');
        }

        if (order.status === 'delivered') {
            lineClass = ['filled final-filled', 'filled final-filled', 'filled final-filled'];
        }

        let itemsGridHtml = '';
        if (order.items && Array.isArray(order.items)) {
            itemsGridHtml = order.items.map(item => {
                const productData = state.products.find(p => Number(p.id) === Number(item.id));
                const imgUrl = esc(productData ? productData.image : 'https://via.placeholder.com/80');
                const safeItemName = esc(item.name || (productData ? productData.name : ''));
                return `
                    <div class="order-item-box">
                        <img src="${imgUrl}" class="order-item-img" alt="${safeItemName}">
                        <div class="item-name">${safeItemName}</div>
                        <div style="font-size:10px; font-weight:700; color:var(--text-muted);">x${Number(item.qty) || 1}</div>
                    </div>`;
            }).join('');
        }

        const orderLabel = esc(order.orderId || order._docId.slice(0, 6).toUpperCase());

        let cancelBtnHtml = '';
        if (filterType === 'current' && order.status === 'pending_payment') {
            cancelBtnHtml = `<button class="btn-cancel-order" onclick="cancelOrder('${order._docId}')"><i class="fas fa-times"></i> انصراف از سفارش</button>`;
        } else if (filterType === 'current' && (order.status === 'paid' || order.status === 'processing')) {
            cancelBtnHtml = `<button class="btn-cancel-order" onclick="cancelOrder('${order._docId}')"><i class="fas fa-headset"></i> لغو با پشتیبانی</button>`;
        }

        listDiv.innerHTML += `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <span class="order-id">#${orderLabel}</span>
                        <span class="order-date" style="margin-right:10px;">${datePersian} - ${timePersian}</span>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted);">شماره موبایل:</div>
                        <div style="font-weight:900; font-size:13px; color:var(--text-primary);">${esc(state.user.mobile || state.user.email || '')}</div>
                    </div>
                </div>

                <div class="order-progress-wrapper">
                    <div class="steps-container">
                        <div class="step-circle-box ${statusClass[0]}">
                            <div class="circle-icon">${checkIcon[0] || '۱'}</div>
                            <div class="step-label">تایید سفارش</div>
                        </div>
                        <div class="track-line ${lineClass[0]}"></div>
                        <div class="step-circle-box ${statusClass[1]}">
                            <div class="circle-icon">${checkIcon[1] || '۲'}</div>
                            <div class="step-label">پردازش انبار</div>
                        </div>
                        <div class="track-line ${lineClass[1]}"></div>
                        <div class="step-circle-box ${statusClass[2]}">
                            <div class="circle-icon">${checkIcon[2] || '۳'}</div>
                            <div class="step-label">ارسال مرسوله</div>
                        </div>
                        <div class="track-line ${lineClass[2]}"></div>
                        <div class="step-circle-box ${statusClass[3]}">
                            <div class="circle-icon">${checkIcon[3] || '۴'}</div>
                            <div class="step-label">تحویل نهایی</div>
                        </div>
                    </div>
                </div>

                <div style="margin-top:16px; font-size:12px; font-weight:700; color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
                    <i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> آدرس تحویل: ${esc(order.address) || 'ثبت نشده'}
                </div>

                <div class="order-items-grid">
                    ${itemsGridHtml}
                </div>

                <div class="order-footer">
                    <div>
                        <div style="font-size:11px; font-weight:700; color:var(--text-muted);">مبلغ نهایی پرداخت شده</div>
                        <div class="total-price">${Number(order.totalAmount || 0).toLocaleString('en-US')} <small>تومان</small></div>
                    </div>
                    ${cancelBtnHtml}
                </div>
            </div>
        `;
    });
}

/* --- Cancel Order (Firestore Sync) ---
   ⚠️ طبق firestore.rules، مالک سفارش فقط زمانی می‌تواند خودش سفارش را
   تغییر/حذف کند که وضعیت هنوز pending_payment باشد (یعنی پولی واقعاً
   کم نشده). برای سفارش‌های paid/processing، بازگشت وجه خودکار از سمت
   کلاینت مجاز نیست (برای جلوگیری از کلاهبرداری مالی) و باید توسط ادمین
   از پنل مدیریت انجام شود. بنابراین این تابع دو رفتار متفاوت دارد. */
async function cancelOrder(docId) {
    const targetOrder = state.orders.find(o => o._docId === docId);
    if (!targetOrder) return;

    if (targetOrder.status === 'pending_payment') {
        if (!confirm('آیا از انصراف از این سفارش (که هنوز پرداخت نشده) اطمینان دارید؟')) return;
        try {
            await window.fbDeleteDoc(window.fbDoc(window.fbDb, 'orders', docId));
            state.orders = state.orders.filter(o => o._docId !== docId);
            alert('سفارش با موفقیت لغو شد.');
            renderOrdersList('current');
        } catch (e) {
            console.error('خطا در لغو سفارش در Firestore:', e);
            alert('خطا در لغو سفارش. لطفاً دوباره تلاش کنید.');
        }
        return;
    }

    // برای سفارش‌های پرداخت‌شده/در حال پردازش، لغو با بازگشت وجه فقط
    // توسط پشتیبانی/ادمین ممکن است (نه مستقیم از کلاینت)
    alert('این سفارش قبلاً پرداخت شده است. برای لغو و بازگشت وجه، لطفاً از طریق پشتیبانی فروشگاه اقدام کنید.');
}


/* --- Secure Session Logout (Firebase) --- */
function logout() {
    if (confirm("آیا برای خروج از حساب کاربری خود اطمینان دارید؟")) {
        window.fbSignOut(window.fbAuth).finally(() => {
            localStorage.removeItem(LEGACY_SESSION_KEY);
            window.location.href = 'index.html';
        });
    }
}


// مپ کردن توابع برای رویدادهای onclick در HTML
window.showSection = showSection;
window.toggleEdit = toggleEdit;
window.saveUserData = saveUserData;
window.removeFromFav = removeFromFav;
window.addToCartFromWishlist = addToCartFromWishlist;
window.filterOrders = filterOrders;
window.cancelOrder = cancelOrder;
window.logout = logout;
window.toggleTheme = toggleTheme;