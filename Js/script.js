/* ============================================
   CONFIG & STATE
   ============================================ */
const DB = {
    slides: 'shop_slides',
    session: 'current_user',
    history: 'shop_search_history',
    wishlist: 'shop_wishlist',
    theme: 'theme',
    recentlyViewed: 'shop_recently_viewed'
};
 
/* تصویر پیش‌فرض یکسان در کل صفحه (منبع واحد fallback، هماهنگ با admin.html) */
const FALLBACK_IMG = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkvallQ5ZGN8H0RHyH6fe91ycZ2NbnLPmx9x-2_NqnBQ&s=10';
 
 
/* ============================================
   SECURITY: HTML ESCAPING
   -------------------------------------------
   نسخه‌ی کامل escape (برخلاف نسخه‌ی قبلی که فقط ' و " را
   جایگزین می‌کرد) — تمام کاراکترهای خطرناک HTML/JS را پوشش
   می‌دهد. محصولات از پنل ادمین می‌آیند (که خودش ورودی کاربر
   می‌گیرد)، پس هر رشته‌ای که وارد innerHTML می‌شود باید از این
   عبور کند.
   ============================================ */
function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}
/* برای درج امن در onclick="...('...')" — escape می‌کند و کوتیشن تکی را هم می‌بندد */
function escAttr(str) {
    return esc(str).replace(/'/g, '&#39;');
}
 
const Store = {
    /* قبلاً این متد فقط ۳۰۰ محصول اول را (limit(300) بدون هیچ صفحه‌بندی)
       می‌گرفت؛ یعنی فروشگاه‌هایی با بیش از ۳۰۰ کالا، در جستجو، SRP و
       بخش «قسطی شگفت» به‌طور نامرئی محصولات جدیدتر/بیشتر را از دست
       می‌دادند. از این پس با startAfter در دسته‌های ۳۰۰تایی می‌خوانیم
       تا کل کاتالوگ (تا یک سقف ایمنی منطقی) بارگذاری شود. */
    async getProductsForSearch() {
        const BATCH_SIZE = 300;
        const SAFETY_MAX_DOCS = 3000; // سقف ایمنی برای جلوگیری از خواندن نامحدود/پرهزینه
        const list = [];
        let cursor = null;
        try {
            while (list.length < SAFETY_MAX_DOCS) {
                const clauses = [window.fbCollection(window.fbDb, 'products'), window.fbOrderBy('id', 'desc')];
                if (cursor) clauses.push(window.fbStartAfter(cursor));
                clauses.push(window.fbLimit(BATCH_SIZE));
                const q = window.fbQuery(...clauses);
                const snap = await window.fbGetDocs(q);
                if (snap.empty) break;
                let lastDoc = null;
                snap.forEach(docSnap => { list.push(docSnap.data()); lastDoc = docSnap; });
                if (snap.size < BATCH_SIZE) break; // این آخرین دسته بود
                cursor = lastDoc;
            }
        } catch (e) {
            console.error('خطا در بارگذاری کامل کاتالوگ محصولات:', e);
        }
        return list;
    },
    async getProductById(id) {
        try {
            const q = window.fbQuery(window.fbCollection(window.fbDb, 'products'), window.fbWhere('id', '==', id), window.fbLimit(1));
            const snap = await window.fbGetDocs(q);
            if (snap.empty) return null;
            let result = null;
            snap.forEach(d => { result = d.data(); });
            return result;
        } catch (e) {
            console.error('خطا در دریافت محصول از Firestore:', e);
            return null;
        }
    },
    getSlides() {
        const raw = localStorage.getItem(DB.slides);
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch(e) { return null; }
    },
    setSlides(list) {
        localStorage.setItem(DB.slides, JSON.stringify(list));
    },
    getSession() {
        return localStorage.getItem(DB.session);
    },
    setSession(uid) {
        localStorage.setItem(DB.session, uid);
    },
    clearSession() {
        localStorage.removeItem(DB.session);
    },
    getHistory() {
        try { return JSON.parse(localStorage.getItem(DB.history)) || []; }
        catch(e) { return []; }
    },
    setHistory(list) {
        localStorage.setItem(DB.history, JSON.stringify(list));
    },
    getWishlist() {
        try { return JSON.parse(localStorage.getItem(DB.wishlist)) || []; }
        catch(e) { return []; }
    },
    setWishlist(list) {
        localStorage.setItem(DB.wishlist, JSON.stringify(list));
    },
    /* پرسونالایز کردن هوم بر اساس رفتار کاربر: لیست شناسه‌ی محصولاتی که
       اخیراً بازدید کرده (جدیدترین اول)، برای رندر «بازدیدهای اخیر» و
       پیشنهاد بر اساس دسته‌بندی مورد علاقه استفاده می‌شود. */
    getRecentlyViewed() {
        try { return JSON.parse(localStorage.getItem(DB.recentlyViewed)) || []; }
        catch(e) { return []; }
    },
    addRecentlyViewed(id) {
        const MAX = 16;
        let list = Store.getRecentlyViewed().filter(x => x !== id);
        list.unshift(id);
        if (list.length > MAX) list = list.slice(0, MAX);
        localStorage.setItem(DB.recentlyViewed, JSON.stringify(list));
    },
    getTheme() {
        return localStorage.getItem(DB.theme);
    },
    setTheme(t) {
        localStorage.setItem(DB.theme, t);
    },
    async getUserProfile(uid) {
        try {
            const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid));
            return snap.exists() ? snap.data() : null;
        } catch(e) {
            console.error('خطا در خواندن پروفایل از Firestore:', e);
            return null;
        }
    },
    async updateUserProfile(uid, partialData) {
        try {
            await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', uid), partialData);
            return true;
        } catch(e) {
            console.error('خطا در بروزرسانی پروفایل در Firestore:', e);
            return false;
        }
    },
    async getAmazingTimerSettings() {
        try {
            const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'settings', 'amazingTimer'));
            return snap.exists() ? snap.data() : null;
        } catch(e) {
            console.error('خطا در خواندن تنظیمات تایمر:', e);
            return null;
        }
    },
    /* منبع واحد درخت دسته‌بندی — همان سندی که admin.html می‌سازد/می‌خواند.
       دیگر هیچ کپی هاردکد شده‌ای از دسته‌بندی در index.html نگه‌داری نمی‌شود. */
    async getCategoryTree() {
        try {
            const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'settings', 'categoryTree'));
            if (snap.exists() && snap.data() && snap.data().tree) {
                return snap.data().tree;
            }
            return null;
        } catch(e) {
            console.error('خطا در خواندن درخت دسته‌بندی از Firestore:', e);
            return null;
        }
    }
};
 
const state = {
    searchCatalog: [],
    slides: [],
    theme: Store.getTheme() || 'light',
    cartCount: 0,
    srpQuery: '',
    srpCat: '',
    srpMode: null,
    srpRating: 0,
    srpResults: [],
    megaOpen: false,
    currentUser: null,
    amazingTimerEndAt: null,
    amazingTimerStartAt: null,
    categoryData: {},
    /* متغیرهای ضروری فیلتر SRP */
    srpBrands: new Set(),
    srpColors: new Set(),
    srpPriceMin: 0,
    srpPriceMax: 0,
    srpCatalogMaxPrice: 0
};
 
const MAX_HIST = 8;
let heroSwiperInstance = null;
let amazingSwiperInstance = null;
let amazingSwiperReady = false;
let amazingResumeTimer = null;
let toastTimer = null;
let amazingTimerInitialized = false;
let srpTriggerEl = null;           // عنصری که مودال SRP را باز کرده (برای بازگرداندن فوکوس)
let priceFilterDebounce = null;    // تایمر debounce برای اینپوت‌های محدوده قیمت
 
/* ============================================
   THEME SYNCHRONIZATION
   ============================================ */
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
    Store.setTheme(state.theme);
    applyTheme(state.theme);
}
 
/* ============================================
   DATA LOADING
   ============================================ */
 
async function loadSearchCatalog() {
    try {
        state.searchCatalog = await Store.getProductsForSearch();
    } catch (e) {
        console.error('خطا در بارگذاری کاتالوگ جستجو:', e);
        state.searchCatalog = [];
    }
}
 
function loadSlidesData() {
    const ss = Store.getSlides();
    if (ss !== null) {
        state.slides = ss;
    } else {
        seedSlides();
    }
}
 
function seedSlides() {
    state.slides = [
        { image: 'https://dkstatics-public.digikala.com/digikala-adservice-banners/114974665b95b81ac9f34f5c4541ed103cbeefc6_1781939408.jpg?x-oss-process=image/quality,q_95/format,webp'},
        { image: 'https://dkstatics-public.digikala.com/digikala-adservice-banners/9187933a6a5d160c4dd53aa11d2ed21e3864fda1_1781700091.gif?x-oss-process=image?x-oss-process=image/format,webp'},
        { image: 'https://dkstatics-public.digikala.com/digikala-adservice-banners/106a9545642ec0528d7bcb59f56625689ccac627_1781703061.jpg?x-oss-process=image/quality,q_95/format,webp'}
    ];
    Store.setSlides(state.slides);
}
 
/* ============================================
   SWIPER CAROUSELS INITIALIZATION
   ============================================ */
function initHeroSwiper() {
    const track = document.getElementById('sliderTrack');
    if (state.slides.length > 0) {
        track.innerHTML = state.slides.map(s => `
            <div class="swiper-slide">
                <img src="${esc(s.image)}" alt="${esc(s.title || 'اسلاید تبلیغاتی')}" loading="eager" onerror="this.src='https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkvallQ5ZGN8H0RHyH6fe91ycZ2NbnLPmx9x-2_NqnBQ&s=10'">
                ${s.title ? `<div class="slide-overlay"><div class="slide-text"><h2>${esc(s.title)}</h2></div></div>` : ''}
            </div>
        `).join('');
    }

    heroSwiperInstance = new Swiper('.hero-swiper', {
        direction: 'horizontal',
        loop: true,
        autoplay: {
            delay: 4500,
            disableOnInteraction: false,
        },
        pagination: {
            el: '.hero-pagination',
            clickable: true,
        },
        navigation: {
            nextEl: '.hero-next',
            prevEl: '.hero-prev',
        },
        effect: 'fade',
        fadeEffect: { crossFade: true }
    });

    // مطابق دقیق الگوی renderProduct در product.js:
    // ساخت Swiper قبل از نمایش container انجام می‌شود،
    // سپس loadingState مخفی و content واقعی نمایان می‌شود
    const heroLoadingState = document.getElementById('heroLoadingState');
    const heroSwiperContainer = document.getElementById('heroSwiperContainer');
    if (heroLoadingState) heroLoadingState.style.display = 'none';
    if (heroSwiperContainer) heroSwiperContainer.style.display = 'block';
}
 
function pauseAmazingAutoplay() {
    clearTimeout(amazingResumeTimer);
    if (amazingSwiperInstance && amazingSwiperInstance.autoplay) {
        amazingSwiperInstance.autoplay.stop();
    }
}
 
function scheduleAmazingResume() {
    clearTimeout(amazingResumeTimer);
    amazingResumeTimer = setTimeout(() => {
        if (amazingSwiperInstance && amazingSwiperInstance.autoplay) {
            amazingSwiperInstance.autoplay.start();
        }
    }, 8000);
}
 
function initAmazingSwiper() {
    amazingSwiperInstance = new Swiper('.amazing-swiper', {
        direction: 'horizontal',
        loop: true,
        rtl: true,
        centeredSlides: true,
        slidesPerView: 'auto',
        spaceBetween: 12,
        grabCursor: true,
        autoplay: {
            delay: 3000,
            disableOnInteraction: false,
        },
        navigation: {
            nextEl: '.amazing-nav-next',
            prevEl: '.amazing-nav-prev',
        },
        breakpoints: {
            769: {
                centeredSlides: false,
                slidesPerView: 'auto',
                spaceBetween: 18,
            },
            1200: {
                centeredSlides: false,
                slidesPerView: 'auto',
                spaceBetween: 20,
            }
        },
        observer: true,
        observeParents: true,
        on: {
            touchStart: pauseAmazingAutoplay,
            sliderMove: pauseAmazingAutoplay,
            touchEnd: scheduleAmazingResume,
        }
    });
}
 
 
/* ============================================
   PRODUCTS RENDER
   ============================================ */
function getCatName(cat) {
    if (state.categoryData[cat]) return cat;
    return cat || 'دسته‌بندی نشده';
}
function renderAmazingOffers() {
    const source = state.searchCatalog;
    const dealsWrapper = document.getElementById('dealsScroll');
    const offers = source.filter(p => p.discount > 0);
    const amazingSkeletonRow = document.getElementById('amazingSkeletonRow');
    const amazingSwiperEl = document.getElementById('amazingSwiperEl');
    const amazingSectionRoot = document.getElementById('amazingSectionRoot');
    const amazingEmptyState = document.getElementById('amazingEmptyState');
 
    if (offers.length === 0) {
        if (amazingSwiperInstance) {
            amazingSwiperInstance.destroy(true, true);
            amazingSwiperInstance = null;
            amazingSwiperReady = false;
        }
        if (amazingSkeletonRow) amazingSkeletonRow.style.display = 'none';
        if (amazingSwiperEl) amazingSwiperEl.style.display = 'none';
        // به‌جای مخفی کردن کامل سکشن، یک empty state طراحی‌شده نمایش داده می‌شود
        // تا کاربر متوجه شود این بخش عمداً خالی نیست، فقط فعلاً پیشنهادی ندارد
        if (amazingEmptyState) amazingEmptyState.style.display = 'block';
        amazingSectionRoot.style.display = 'block';
        return;
    }
 
    if (amazingEmptyState) amazingEmptyState.style.display = 'none';
    amazingSectionRoot.style.display = 'block';
 
    let loopOffers = [...offers];
    while (loopOffers.length < 12 && offers.length > 0) {
        loopOffers = [...loopOffers, ...offers];
    }
 
    // Destroy old Swiper before rebuilding slides
    if (amazingSwiperInstance) {
        amazingSwiperInstance.destroy(true, true);
        amazingSwiperInstance = null;
        amazingSwiperReady = false;
    }
 
    // Rebuild slides
    dealsWrapper.innerHTML = loopOffers.map(p => createAmazingSlide(p)).join('');
 
    // Hide skeleton and show real slider
    if (amazingSkeletonRow) {
        amazingSkeletonRow.style.display = 'none';
    }
 
    if (amazingSwiperEl) {
        amazingSwiperEl.style.display = 'block';
    }
 
    // Initialize fresh Swiper after it becomes visible
    initAmazingSwiper();
    amazingSwiperReady = true;
}
/* ============================================
   AMAZING OFFERS — "قسطی شگفت" CARD BUILDER
   ============================================ */
function createAmazingSlide(p) {
    const fp = p.price - (p.price * (p.discount || 0) / 100);
    const imgSrc = p.image || FALLBACK_IMG;
 
    const installmentOptions = [4];
    const installmentCount = installmentOptions[p.id % installmentOptions.length];
    const perInstallmentPrice = Math.round(fp / installmentCount);
 
    const codeBadge = p.discount > 0
        ? `<span class="amazing-code-badge">کد ${p.discount.toLocaleString('fa-IR')}</span>`
        : '';
 
    const priceRow = p.discount > 0
        ? `<span class="amazing-discount-badge">${p.discount.toLocaleString('fa-IR')}٪</span><span class="amazing-old-price">${p.price.toLocaleString('en-US')}</span>`
        : `<span></span><span></span>`;
 
    return `
        <div class="swiper-slide">
            <button type="button" class="amazing-card" onclick="openProduct(${Number(p.id)})" aria-label="${escAttr(p.name)}">
                <div class="amazing-card-img-wrap">
                    ${codeBadge}
                    <img src="${esc(imgSrc)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
                    <div class="amazing-store-badge"><i class="fas fa-star" style="color:#f59e0b;"></i> ${(p.rating||0).toFixed(1)}</div>
                </div>
                <div class="amazing-card-body">
                    <div class="amazing-installment-row">
                        <div class="amazing-installment-badge">
                            <b>${installmentCount.toLocaleString('fa-IR')}</b>
                            <span>قسط</span>
                        </div>
                        <div class="amazing-installment-price">
                            <b>${perInstallmentPrice.toLocaleString('en-US')}</b>
                            <span>تومانی</span>
                        </div>
                    </div>
 
                    <div class="amazing-title">${esc(p.name)}</div>
                    <div class="amazing-store-name"><i class="fas fa-store"></i>pnyshop فروشگاه</div>
                    <div class="amazing-price-row">
                        ${priceRow}
                    </div>
                    <div class="amazing-final-price">${fp.toLocaleString('en-US')} تومان</div>
                </div>
            </button>
        </div>`;
}
 
 
async function loadSpotlightCards() {
    try {
        const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'settings', 'spotlightCards'));
        return (snap.exists() && Array.isArray(snap.data().cards)) ? snap.data().cards : [];
    } catch (e) {
        console.error('خطا در خواندن ویترین ویژه از Firestore:', e);
        return [];
    }
}
 
function createSpotlightCard(c) {
    const imgSrc = c.image || FALLBACK_IMG;
    return `
        <div class="spotlight-card" ${c.link ? `onclick="window.location.href='${escAttr(c.link)}'"` : ''}>
            <img src="${esc(imgSrc)}" alt="${esc(c.title || '')}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
            <div class="spotlight-overlay">
                ${c.price ? `<div class="spotlight-price">${esc(c.price)}</div>` : ''}
                <div class="spotlight-name">${esc(c.title || '')}</div>
                ${c.link ? `<button type="button" class="spotlight-buy-btn" onclick="event.stopPropagation();window.location.href='${escAttr(c.link)}'">خرید کن</button>` : ''}
            </div>
        </div>`;
}
 

async function renderSpotlight() {
    const loadingState = document.getElementById('spotlightLoadingState');
    const grid = document.getElementById('spotlightGrid');
    const section = grid ? grid.closest('section') : null;
    if (section) section.style.display = 'block';

    const cards = await loadSpotlightCards();

    // مطابق دقیق الگوی product.js: بعد از رسیدن پاسخ سرور، اسکلتون
    // مخفی و محتوای واقعی نمایش داده می‌شود (loadingState → none،
    // content → مقدار نمایشی واقعی‌اش، همان‌طور که آنجا 'block' بود)
    if (loadingState) loadingState.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    if (cards.length === 0) {
        if (grid) grid.innerHTML = `
            <div class="spotlight-empty-state">
                <i class="fas fa-store"></i>
                <div class="se-title">ویترین ویژه فعلاً خالی است</div>
                <div class="se-sub">به‌زودی محصولات منتخب اینجا نمایش داده می‌شوند.</div>
            </div>`;
        return;
    }
    if (grid) grid.innerHTML = cards.map(c => createSpotlightCard(c)).join('');
}
 
/* ============================================
   PERSONALIZATION — بازدیدهای اخیر + پیشنهاد بر اساس دسته‌بندی مورد علاقه
   -------------------------------------------
   کاملاً سمت کلاینت و بدون نیاز به سرویس توصیه‌گر جداگانه: از شناسه‌های
   ذخیره‌شده در localStorage (Store.getRecentlyViewed) استفاده می‌کند و
   با کاتالوگ فعلی (state.searchCatalog) تطبیق می‌دهد.
   ============================================ */
function renderRecentlyViewed() {
    const section = document.getElementById('recentlyViewedSection');
    const grid = document.getElementById('recentlyViewedGrid');
    if (!section || !grid) return;
 
    const ids = Store.getRecentlyViewed();
    if (!ids.length) { section.style.display = 'none'; return; }
 
    const byId = new Map(state.searchCatalog.map(p => [Number(p.id), p]));
    const items = ids.map(id => byId.get(Number(id))).filter(Boolean).slice(0, 10);
    if (!items.length) { section.style.display = 'none'; return; }
 
    grid.innerHTML = items.map(p => createSRPCard(p)).join('');
    section.style.display = 'block';
}
 
function renderPersonalizedRecommendations() {
    const section = document.getElementById('personalizedSection');
    const grid = document.getElementById('personalizedGrid');
    const titleEl = document.getElementById('personalizedTitle');
    if (!section || !grid) return;
 
    const ids = Store.getRecentlyViewed();
    const byId = new Map(state.searchCatalog.map(p => [Number(p.id), p]));
    const viewedItems = ids.map(id => byId.get(Number(id))).filter(Boolean);
 
    if (!viewedItems.length) { section.style.display = 'none'; return; }
 
    // دسته‌بندی پرتکرار بین بازدیدهای اخیر کاربر
    const catCounts = {};
    viewedItems.forEach(p => {
        const cat = p.category || 'نامشخص';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    const favCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!favCategory) { section.style.display = 'none'; return; }
 
    const viewedIdSet = new Set(viewedItems.map(p => Number(p.id)));
    const recs = state.searchCatalog
        .filter(p => p.category === favCategory && !viewedIdSet.has(Number(p.id)) && p.stock > 0)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0))
        .slice(0, 10);
 
    if (!recs.length) { section.style.display = 'none'; return; }
 
    if (titleEl) titleEl.innerText = `چون به «${favCategory}» علاقه دارید`;
    grid.innerHTML = recs.map(p => createSRPCard(p)).join('');
    section.style.display = 'block';
}
 
/* ============================================
   BACK-IN-STOCK BANNER (اصلاح‌شده و بهینه‌سازی‌شده)
   -------------------------------------------
   بر اساس لیست علاقه‌مندی‌های محلی (wishlist)، اگر کالایی که قبلاً
   ناموجود بوده الان موجودی مثبت داشته باشد، یک بنر اطلاع‌رسانی نشان داده می‌شود.
   ============================================ */

function checkBackInStock() {
    const banner = document.getElementById('backInStockBanner');
    if (!banner) return;

    // ۱. بررسی دفاعی در برابر null یا undefined بودن کاتالوگ یا لیست علاقه‌مندی‌ها
    const rawWishlist = Store.getWishlist();
    if (!Array.isArray(rawWishlist) || !rawWishlist.length) return;

    const catalog = Array.isArray(state.searchCatalog) ? state.searchCatalog : [];
    if (!catalog.length) return;

    // ۲. جلوگیری از خطر NaN و تبدیل ایمن شناسه‌ها به عدد معتبر
    const wishlistIds = new Set(
        rawWishlist
            .map(id => Number(id))
            .filter(id => Number.isFinite(id) && id > 0)
    );

    if (!wishlistIds.size) return;

    // ۳. خواندن سوابق موجودی قبلی محصولات از Storage برای تشخیص تغییر واقعی (جدیداً موجود شده)
    let knownInStock = new Set();
    try {
        const stored = localStorage.getItem('bis_known_instock');
        if (stored) knownInStock = new Set(JSON.parse(stored));
    } catch (e) {
        console.error('خطا در خواندن سوابق موجودی:', e);
    }

    // ۴. جداسازی کالاهایی که واقعاً جدیداً موجود شده‌اند (تفاوت موجودی قبلی و فعلی)
    const newlyBackInStock = [];
    const currentInStockIds = [];

    catalog.forEach(p => {
        const numId = Number(p.id);
        if (wishlistIds.has(numId) && Number(p.stock) > 0) {
            currentInStockIds.push(numId);
            if (!knownInStock.has(numId)) {
                newlyBackInStock.push(p);
            }
        }
    });

    // ۵. به‌روزرسانی سابقه کالاهای موجود در لیست علاقه‌مندی‌ها
    try {
        localStorage.setItem('bis_known_instock', JSON.stringify(currentInStockIds));
    } catch (e) {
        console.error('خطا در ذخیره سوابق موجودی:', e);
    }

    // اگر کالای جدیدی شارژ نشده باشد، بنر نشان داده نمی‌شود
    if (!newlyBackInStock.length) return;

    // ۶. بررسی اتیکت‌گذاری صحیح Session Storage بر اساس شناسه‌های محصولات تغییریافته
    const bisHash = newlyBackInStock.map(p => p.id).sort().join(',');
    if (sessionStorage.getItem('bis_dismissed_hash') === bisHash) return;

    const first = newlyBackInStock[0];
    
    // استفاده از تابع esc که در کدهای اصلی پروژه موجود است (پوشش مشکل شماره ۸)
    const safeName = typeof esc === 'function' ? esc(first.name) : String(first.name || '');
    
    const text = newlyBackInStock.length === 1
        ? `«${safeName}» از لیست علاقه‌مندی‌هایتان دوباره موجود شد!`
        : `${newlyBackInStock.length.toLocaleString('fa-IR')} کالا از لیست علاقه‌مندی‌هایتان دوباره موجود شدند!`;

    // ۷. رعایت ساختار معنایی (Semantic HTML)، دکمه واقعی بستن و تعامل‌پذیری کیبورد
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'اطلاع‌رسانی موجودی کالا');
    banner.setAttribute('tabindex', '0');

    banner.innerHTML = `
        <i class="fas fa-bell bis-icon" aria-hidden="true"></i>
        <span class="bis-text">${text}</span>
        <button type="button" class="bis-close-btn" id="bisCloseBtn" aria-label="بستن اعلان">
            <i class="fas fa-times" aria-hidden="true"></i>
        </button>`;

    banner.style.display = 'flex';

    // ۸. مدیریت هوشمندانه و ناهماهنگ نبودن هدایت کاربر (Navigation Consistency)
    const handleNavigation = () => {
        dismissBackInStockBanner(bisHash);
        if (newlyBackInStock.length === 1) {
            if (typeof openProduct === 'function') {
                openProduct(first.id);
            } else {
                window.location.href = `product.html?id=${encodeURIComponent(first.id)}`;
            }
        } else {
            window.location.href = 'profile.html';
        }
    };

    // ۹. جلوگیری از تداخل رویدادها (Event Binding) و اضافه کردن Listener با الگوی استاندارد
    const newBanner = banner.cloneNode(true);
    banner.parentNode.replaceChild(newBanner, banner);

    newBanner.addEventListener('click', handleNavigation);
    newBanner.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleNavigation();
        }
    });

    // ۱۰. پاک‌سازی دقیق رویدادها هنگام کلیک روی دکمه بستن
    const closeBtn = newBanner.querySelector('#bisCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissBackInStockBanner(bisHash);
        });
    }
}

function dismissBackInStockBanner(hash) {
    if (hash) {
        sessionStorage.setItem('bis_dismissed_hash', hash);
    }
    const banner = document.getElementById('backInStockBanner');
    if (banner) {
        banner.style.display = 'none';
        // پاک‌سازی کامل Element برای جلوگیری از Memory Leak و مانده‌های Event
        const cleanBanner = banner.cloneNode(false);
        banner.parentNode.replaceChild(cleanBanner, banner);
    }
}

/* ============================================
   RIPPLE EFFECT
   ============================================ */
document.addEventListener('click', e => {
    const card=e.target.closest('.p-card');
    if (!card) return;
    const container=card.querySelector('.ripple-container');
    if (!container) return;
    const rect=card.getBoundingClientRect();
    const wave=document.createElement('span');
    wave.className='ripple-wave';
    const size=Math.max(card.offsetWidth, card.offsetHeight);
    wave.style.cssText=`width:${size}px;height:${size}px;top:${e.clientY-rect.top-size/2}px;right:${rect.right-e.clientX-size/2}px;`;
    container.appendChild(wave);
    wave.addEventListener('animationend', ()=>wave.remove());
});
 
/* ============================================
   SEARCH HELPERS & DROPDOWN LOGIC
   ============================================ */
function norm(s) { return (s||'').replace(/[يى]/g,'ی').replace(/[كک]/g,'ک').replace(/[\u064B-\u065F]/g,'').replace(/\s+/g,' ').trim().toLowerCase(); }
function levenshtein(a, b) {
    const m = [], la = a.length, lb = b.length;
    for (let i=0;i<=lb;i++) m[i]=[i];
    for (let j=0;j<=la;j++) m[0][j]=j;
    for (let i=1;i<=lb;i++) for (let j=1;j<=la;j++) m[i][j] = b[i-1]===a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
    return m[lb][la];
}
function fuzzyMatch(q, text) {
    const qn=norm(q), tn=norm(text);
    if (tn.includes(qn)) return true;
    return tn.split(' ').some(w => w.length>=3 && levenshtein(qn,w)<=Math.floor(qn.length/4));
}
function scoreProduct(q, p) {
    if (!q) return 100;
    const qn=norm(q), name=norm(p.name||''), desc=norm(p.description||''), cat=norm(p.breadcrumb||p.category||'');
    let sc=0;
    if (name===qn) sc+=200; else if (name.startsWith(qn)) sc+=150; else if (name.includes(qn)) sc+=100;
    else if (cat.includes(qn)) sc+=60; else if (desc.includes(qn)) sc+=40; else if (fuzzyMatch(q, p.name)) sc+=30; else if (fuzzyMatch(q, desc)) sc+=10;
    if (!sc) return 0;
    if (p.stock>0) sc+=50; else sc-=100;
    sc+=(p.rating||0)*5; sc+=Math.min((p.reviews||0)/10,20);
    if (p.hot) sc+=15;
    return sc;
}
function getSearchSource() {
return state.searchCatalog;
}
function searchProds(q) {
    const source = getSearchSource();
    if (!q||q.trim().length<1) return source.slice();
    return source.map(p=>({...p,_s:scoreProduct(q,p)})).filter(p=>p._s>0).sort((a,b)=>b._s-a._s);
}
 
function getHistory() { return Store.getHistory(); }
function addHistory(q) {
    if (!q||q.trim().length<2) return;
    let h=getHistory().filter(x=>x.toLowerCase()!==q.toLowerCase());
    h.unshift(q.trim());
    if (h.length>MAX_HIST) h=h.slice(0,MAX_HIST);
    Store.setHistory(h);
}
function removeHistory(q) {
    const h=getHistory().filter(x=>x!==q);
    Store.setHistory(h);
    showDropdown(document.getElementById('mainSearch').value);
}
 
/* ============================================
   FLATTEN CATEGORY TREE (عمق متغیر) برای جستجوی دسته‌بندی
   ============================================ */
function getAllCatItems() {
    const items = [];
    function walk(node, path) {
        if (Array.isArray(node)) {
            node.forEach(leaf => {
                items.push({ text: leaf, path: path.join(' > ') });
            });
            return;
        }
        if (node && typeof node === 'object') {
            for (const [key, child] of Object.entries(node)) {
                items.push({ text: key, path: path.join(' > ') || 'دسته اصلی' });
                walk(child, [...path, key]);
            }
        }
    }
    walk(state.categoryData, []);
    return items;
}
 
function showDropdown(val) {
    const dd=document.getElementById('searchDropdown'), q=val.trim();
    const searchInput = document.getElementById('mainSearch');
    let html='';
    if (!q) {
        const hist=getHistory();
        if (!hist.length) { dd.style.display='none'; if (searchInput) searchInput.setAttribute('aria-expanded','false'); return; }
        html+=`<div class="sd-section-head"><i class="fas fa-history"></i> جستجوهای اخیر</div>`;
        hist.forEach(item => {
            html+=`<div class="sd-history-item">
                <button type="button" class="sd-history-left" onclick="triggerSearch('${escAttr(item)}')">
                    <div class="sd-icon"><i class="fas fa-clock"></i></div><span class="sd-history-text">${esc(item)}</span>
                </button>
                <button type="button" class="sd-del-btn" onclick="event.stopPropagation();removeHistory('${escAttr(item)}')" aria-label="حذف از تاریخچه"><i class="fas fa-times"></i></button>
            </div>`;
        });
    } else if (q.length>=2) {
        const qn=norm(q);
        const source = getSearchSource();
        const prods=source.map(p=>({...p,_s:scoreProduct(q,p)})).filter(p=>p._s>0).sort((a,b)=>b._s-a._s).slice(0,4);
        if (prods.length) {
            html+=`<div class="sd-section-head"><i class="fas fa-box"></i> محصولات پیشنهادی</div>`;
            prods.forEach(p => {
                const fp=p.price-(p.price*(p.discount||0)/100);
                const imgSrc = p.image || FALLBACK_IMG;
                html+=`<button type="button" class="sd-item" onclick="openProduct(${Number(p.id)});closeDropdown();">
                    <img src="${esc(imgSrc)}" class="sd-prod-img" alt="${esc(p.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
                    <div style="flex:1;min-width:0;"><div class="sd-prod-name">${esc(p.name)}</div><div class="sd-prod-price">${fp.toLocaleString('en-US')} تومان</div></div>
                </button>`;
            });
        }
        const cats=getAllCatItems().filter(c=>norm(c.text).includes(qn)||fuzzyMatch(q,c.text)).slice(0,3);
        if (cats.length) {
            html+=`<div class="sd-section-head"><i class="fas fa-sitemap"></i> دسته‌بندی‌ها</div>`;
            cats.forEach(c => {
                html+=`<button type="button" class="sd-item" onclick="openSRP('${escAttr(c.text)}','');closeDropdown();addHistory('${escAttr(c.text)}');">
                    <div class="sd-icon"><i class="fas fa-tag"></i></div>
                    <div class="sd-text"><div class="sd-text-main">${esc(c.text)}</div><div class="sd-text-sub">${esc(c.path)}</div></div>
                </button>`;
            });
        }
        if (!prods.length&&!cats.length) {
            html=`<div class="sd-empty"><i class="fas fa-search-minus"></i>نتیجه‌ای یافت نشد</div>`;
        } else {
            html+=`<button type="button" class="sd-search-all" onclick="triggerSearch('${escAttr(q)}')">
                <div class="sd-icon" style="background:var(--primary-soft2);"><i class="fas fa-search" style="color:var(--primary);"></i></div>
                <span>جستجوی "<strong>${esc(q)}</strong>" در همه محصولات</span>
                <i class="fas fa-arrow-left" style="color:var(--primary);font-size:12px;margin-inline-end:auto;"></i>
            </button>`;
        }
    } else { dd.style.display='none'; if (searchInput) searchInput.setAttribute('aria-expanded','false'); return; }
    dd.innerHTML=html; dd.style.display='block';
    if (searchInput) searchInput.setAttribute('aria-expanded','true');
}
 
function closeDropdown() {
    document.getElementById('searchDropdown').style.display='none';
    const searchInput = document.getElementById('mainSearch');
    if (searchInput) searchInput.setAttribute('aria-expanded','false');
}
function triggerSearch(q) { if (!q||!q.trim()) return; addHistory(q.trim()); closeDropdown(); document.getElementById('mainSearch').value=q; openSRP(q,''); }
 
function initSearch() {
    const inp=document.getElementById('mainSearch');
    const clear=document.getElementById('clearSearch');
    if (!inp) return;
    let t;
    inp.addEventListener('focus', ()=>showDropdown(inp.value));
    inp.addEventListener('input', ()=>{
        const v=inp.value;
        clear.style.display=v?'flex':'none';
        clearTimeout(t);
        t=setTimeout(()=>showDropdown(v),180);
    });
    inp.addEventListener('keydown', e=>{
        if (e.key==='Enter'&&inp.value.trim().length>=1) triggerSearch(inp.value.trim());
        if (e.key==='Escape') closeDropdown();
    });
    if (clear) {
        clear.addEventListener('click', ()=>{
            inp.value=''; clear.style.display='none'; closeDropdown(); inp.focus();
        });
    }
    const srpInp=document.getElementById('srpInput');
    if (srpInp) srpInp.addEventListener('keydown', e=>{ if (e.key==='Escape') closeSRP(); });
}
 
/* ============================================
   MEGA MENU & SRP & MODAL
   ============================================ */
let megaActiveMain = null;
let megaHoverTimer = null;

/* ============================================
   SRP: FILTER SHEET, PRICE RANGE, BRAND, COLOR
   ============================================ */
function buildFilterOptions() {
    const source = getSearchSource();
    const brands = new Map();
    const colors = new Map();
    let maxPrice = 0;
    source.forEach(p => {
        if (p.brand && p.brand.trim()) {
            const b = p.brand.trim();
            brands.set(b, (brands.get(b) || 0) + 1);
        }
        if (Array.isArray(p.colors)) {
            p.colors.forEach(c => { if (c && c.name && !colors.has(c.name)) colors.set(c.name, c.code || '#ccc'); });
        }
        const fp = p.price - (p.price * (p.discount || 0) / 100);
        if (fp > maxPrice) maxPrice = fp;
    });
    state.srpCatalogMaxPrice = Math.ceil(maxPrice / 100000) * 100000 || 10000000;
    renderBrandFilter(Array.from(brands.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30));
    renderColorFilter(Array.from(colors.entries()).slice(0, 20));
    initPriceRange();
}

function renderBrandFilter(list) {
    const box = document.getElementById('brandFilterList');
    if (!box) return;
    if (!list.length) { box.innerHTML = `<div class="filter-empty-note">برندی یافت نشد</div>`; return; }
    box.innerHTML = list.map(([name, count]) => `
        <label class="brand-check-item">
            <input type="checkbox" value="${escAttr(name)}" onchange="toggleBrandFilter('${escAttr(name)}', this.checked)" ${state.srpBrands.has(name) ? 'checked' : ''}>
            <span>${esc(name)}</span>
            <small>${count.toLocaleString('fa-IR')}</small>
        </label>`).join('');
}
function toggleBrandFilter(name, checked) {
    if (checked) state.srpBrands.add(name); else state.srpBrands.delete(name);
    updateFilterBadges();
    debouncedSrpFilter();
}

function renderColorFilter(list) {
    const box = document.getElementById('colorFilterGrid');
    if (!box) return;
    if (!list.length) { box.innerHTML = `<div class="filter-empty-note">رنگی یافت نشد</div>`; return; }
    box.innerHTML = list.map(([name, code]) => `
        <button type="button" class="color-swatch-item${state.srpColors.has(name) ? ' active' : ''}" onclick="toggleColorFilter('${escAttr(name)}', this)">
            <span class="color-swatch-box" style="background:${esc(code)};"></span>
            <span class="color-swatch-label">${esc(name)}</span>
        </button>`).join('');
}
function toggleColorFilter(name, btn) {
    if (state.srpColors.has(name)) { state.srpColors.delete(name); btn.classList.remove('active'); }
    else { state.srpColors.add(name); btn.classList.add('active'); }
    updateFilterBadges();
    debouncedSrpFilter();
}

/* ===== اسلایدر دو-دستگیره قیمت ===== */
function initPriceRange() {
    const minEl = document.getElementById('priceRangeMin');
    const maxEl = document.getElementById('priceRangeMax');
    if (!minEl || !maxEl) return;
    const top = state.srpCatalogMaxPrice || 10000000;
    minEl.max = top; maxEl.max = top;
    state.srpPriceMin = 0;
    state.srpPriceMax = top;
    minEl.value = 0;
    maxEl.value = top;
    updatePriceRangeUI();
}
function onPriceRangeInput(which) {
    const minEl = document.getElementById('priceRangeMin');
    const maxEl = document.getElementById('priceRangeMax');
    let vMin = parseInt(minEl.value), vMax = parseInt(maxEl.value);
    const gap = Math.max(10000, Math.round((parseInt(maxEl.max) || 0) * 0.01));
    if (vMin > vMax - gap) {
        if (which === 'min') { vMin = Math.max(0, vMax - gap); minEl.value = vMin; }
        else { vMax = vMin + gap; maxEl.value = vMax; }
    }
    state.srpPriceMin = vMin; state.srpPriceMax = vMax;
    updatePriceRangeUI();
    debouncedSrpFilter();
}
function updatePriceRangeUI() {
    const maxEl = document.getElementById('priceRangeMax');
    const top = parseInt(maxEl.max) || 1;
    const minDisplay = document.getElementById('priceMinDisplay');
    const maxDisplay = document.getElementById('priceMaxDisplay');
    const fill = document.getElementById('dualRangeFill');
    if (minDisplay) minDisplay.innerText = Number(state.srpPriceMin || 0).toLocaleString('fa-IR');
    if (maxDisplay) maxDisplay.innerText = Number(state.srpPriceMax || top).toLocaleString('fa-IR');
    document.getElementById('priceMin').value = state.srpPriceMin || 0;
    document.getElementById('priceMax').value = state.srpPriceMax || top;
    if (fill) {
        fill.style.left = ((state.srpPriceMin / top) * 100) + '%';
        fill.style.right = (100 - (state.srpPriceMax / top) * 100) + '%';
    }
    updateFilterBadges();
}

/* ===== باز/بسته‌کردن شیت فیلتر (موبایل) ===== */
function openFilterSheet(section) {
    const panel = document.getElementById('srpFilters');
    const overlay = document.getElementById('filterSheetOverlay');
    if (!panel) return;
    panel.classList.add('open');
    if (overlay) overlay.classList.add('show');
    if (section && section !== 'all') {
        const target = panel.querySelector(`.filter-acc-item[data-acc="${section}"]`);
        if (target) {
            panel.querySelectorAll('.filter-acc-item').forEach(it => { if (it !== target) it.classList.remove('open'); });
            target.classList.add('open');
            setTimeout(() => target.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
        }
    }
}
function closeFilterSheet() {
    const panel = document.getElementById('srpFilters');
    const overlay = document.getElementById('filterSheetOverlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
}
function toggleAcc(headBtn) {
    const item = headBtn.closest('.filter-acc-item');
    if (item) item.classList.toggle('open');
}

/* ===== سینک select مرتب‌سازی موبایل/دسکتاپ ===== */
function onSrpSortChange(val) {
    const d = document.getElementById('srpSort');
    const m = document.getElementById('srpSortMobile');
    if (d && d.value !== val) d.value = val;
    if (m && m.value !== val) m.value = val;
    srpFilter();
}

/* ===== نشان‌گر تعداد فیلترهای فعال روی چیپ «فیلتر» ===== */
function updateFilterBadges() {
    let count = 0;
    if (state.srpBrands.size) count += state.srpBrands.size;
    if (state.srpColors.size) count += state.srpColors.size;
    const fAvailEl = document.getElementById('fAvail');
    const fDiscEl = document.getElementById('fDisc');
    if (fAvailEl && fAvailEl.checked) count++;
    if (fDiscEl && fDiscEl.checked) count++;
    if (state.srpPriceMin > 0 || (state.srpPriceMax && state.srpPriceMax < state.srpCatalogMaxPrice)) count++;
    if (state.srpRating > 0) count++;

    const badge = document.getElementById('srpFilterChipBadge');
    if (badge) {
        if (count > 0) { badge.style.display = 'inline-flex'; badge.innerText = count.toLocaleString('fa-IR'); }
        else badge.style.display = 'none';
    }
    const map = { price: state.srpPriceMin > 0 || (state.srpPriceMax && state.srpPriceMax < state.srpCatalogMaxPrice), brand: state.srpBrands.size > 0, color: state.srpColors.size > 0 };
    Object.entries(map).forEach(([key, active]) => {
        const chip = document.querySelector(`.srp-chip[data-chip="${key}"]`);
        if (chip) chip.classList.toggle('active', active);
    });
}

/* ============================================
   openSRP / closeSRP / clearSrpFilters (به‌روزشده)
   ============================================ */
function openSRP(q, cat, mode) {
    state.srpQuery = q || ''; state.srpCat = cat || ''; state.srpRating = 0; state.srpMode = mode || null;
    closeMegaMenu(); closeDropdown();
    srpTriggerEl = document.activeElement;

    document.getElementById('srpOverlay').classList.add('open');
    document.getElementById('srpInput').value = q || '';
    document.getElementById('fAvail').checked = false;
    document.getElementById('fDisc').checked = false;

    const sortVal = (mode === 'bestseller') ? 'rating' : 'relevant';
    document.getElementById('srpSort').value = sortVal;
    const msel = document.getElementById('srpSortMobile');
    if (msel) msel.value = sortVal;

    document.body.style.overflow = 'hidden';
    state.srpBrands.clear();
    state.srpColors.clear();

    buildFilterOptions();
    updateRatingButtonsUI();
    srpFilter();

    setTimeout(() => { const inp = document.getElementById('srpInput'); if (inp) inp.focus(); }, 50);
}

function closeSRP() {
    document.getElementById('srpOverlay').classList.remove('open');
    closeFilterSheet();
    document.body.style.overflow = '';
    if (srpGridObserver) { srpGridObserver.disconnect(); srpGridObserver = null; }
    if (srpTriggerEl && typeof srpTriggerEl.focus === 'function') { srpTriggerEl.focus(); }
    srpTriggerEl = null;
}

function clearSrpFilters() {
    document.getElementById('fAvail').checked = false;
    document.getElementById('fDisc').checked = false;
    document.getElementById('srpSort').value = 'relevant';
    const msel = document.getElementById('srpSortMobile'); if (msel) msel.value = 'relevant';

    state.srpRating = 0;
    state.srpBrands.clear();
    state.srpColors.clear();
    state.srpPriceMin = 0;
    state.srpPriceMax = state.srpCatalogMaxPrice || 0;

    const rmin = document.getElementById('priceRangeMin'); if (rmin) rmin.value = 0;
    const rmax = document.getElementById('priceRangeMax'); if (rmax) rmax.value = state.srpCatalogMaxPrice || 0;
    updatePriceRangeUI();
    updateRatingButtonsUI();

    document.querySelectorAll('.color-swatch-item.active').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#brandFilterList input[type=checkbox]').forEach(cb => cb.checked = false);

    updateFilterBadges();
    srpFilter();
    showToast('فیلترها پاک شد');
}
 
/* جمع‌آوری تمام آیتم‌های برگ (سطح ۳ به پایین) صرف‌نظر از عمق درخت،
   تا هر ستون بتواند بدون توجه به عمق واقعی دسته‌بندی یک لیست ساده نشان دهد */
function collectMegaLeaves(node, acc) {
    if (Array.isArray(node)) { node.forEach(v => acc.push(v)); return acc; }
    if (node && typeof node === 'object') { Object.values(node).forEach(v => collectMegaLeaves(v, acc)); }
    return acc;
}
 
function renderMegaMenu() {
    const rail = document.getElementById('megaCatsRail');
    const mains = Object.keys(state.categoryData);
    if (!mains.length) {
        rail.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">دسته‌بندی‌ای یافت نشد.</div>`;
        document.getElementById('megaCatsPanel').innerHTML = '';
        return;
    }
    rail.innerHTML = mains.map((main, i) => `
        <button type="button" class="mega-cat-rail-item" role="tab" id="mega-rail-${i}"
            data-main="${escAttr(main)}"
            onmouseenter="megaScheduleActivate('${escAttr(main)}')"
            onfocus="megaScheduleActivate('${escAttr(main)}')"
            onclick="megaActivateMain('${escAttr(main)}');megaShowPanel();"
            onkeydown="handleMegaRailKeydown(event, ${i})">
            <span>${esc(main)}</span>
            <i class="fas fa-chevron-left mcr-arrow"></i>
        </button>`).join('');
    megaActivateMain(mains[0]);
}
 
/* هاور روی هر دسته‌ی اصلی با تأخیر کوتاه محتوای ستون‌ها را عوض می‌کند
   تا رد شدن تصادفی ماوس باعث تعویض ناخواسته نشود */
function megaScheduleActivate(main) {
    clearTimeout(megaHoverTimer);
    megaHoverTimer = setTimeout(() => megaActivateMain(main), 180);
}
 
function megaActivateMain(main) {
    clearTimeout(megaHoverTimer);
    megaActiveMain = main;
    document.querySelectorAll('.mega-cat-rail-item').forEach(el => {
        el.classList.toggle('active', el.dataset.main === main);
    });
    renderMegaPanel(main);
}
 
function renderMegaPanel(main) {
    const panel = document.getElementById('megaCatsPanel');
    const subs = state.categoryData[main];
    let cols = '';
    if (subs && typeof subs === 'object' && !Array.isArray(subs)) {
        for (const [sub, deeper] of Object.entries(subs)) {
            const leaves = collectMegaLeaves(deeper, []);
            const shown = leaves.slice(0, 7);
            const hasMore = leaves.length > shown.length;
            cols += `<div class="mega-panel-col">
                <div class="mm-col-title">${esc(sub)}</div>
                ${shown.map(item => `<button type="button" class="mm-link" onclick="openSRP('${escAttr(item)}','');closeMegaMenu();">${esc(item)}</button>`).join('')}
                ${hasMore ? `<button type="button" class="mm-link mm-viewall" onclick="openSRP('${escAttr(sub)}','');closeMegaMenu();">مشاهده همه <i class="fas fa-arrow-left" style="font-size:10px;"></i></button>` : ''}
            </div>`;
        }
    } else if (Array.isArray(subs)) {
        cols += `<div class="mega-panel-col">
            <div class="mm-col-title">${esc(main)}</div>
            ${subs.map(item => `<button type="button" class="mm-link" onclick="openSRP('${escAttr(item)}','');closeMegaMenu();">${esc(item)}</button>`).join('')}
        </div>`;
    }
    cols += `<div class="mega-panel-col mega-panel-highlight">
        <div class="mm-col-title">پیشنهاد ما</div>
        <button type="button" class="mm-link" onclick="openSRP('','', 'bestseller');closeMegaMenu();"><i class="fas fa-fire" style="color:var(--danger);font-size:11px;"></i> پرفروش‌ترین‌ها</button>
        <button type="button" class="mm-link" onclick="openSRP('','', 'discount');closeMegaMenu();"><i class="fas fa-tag" style="color:var(--danger);font-size:11px;"></i> تخفیفات ویژه</button>
    </div>`;
    panel.innerHTML = `<div class="mega-panel-columns">${cols || '<div class="mega-panel-empty">زیردسته‌ای یافت نشد.</div>'}</div>`;
}
 
/* در موبایل، پنل زیردسته‌ها روی رَیل اصلی سر می‌خورد (drill-down تمام‌صفحه) */
function megaShowPanel() {
    document.getElementById('megaMenu').setAttribute('data-mobile-view', 'panel');
}
function megaShowRail() {
    document.getElementById('megaMenu').setAttribute('data-mobile-view', 'rail');
}
 
function toggleMegaMenu() {
    state.megaOpen = !state.megaOpen;
    const menu = document.getElementById('megaMenu');
    menu.classList.toggle('open', state.megaOpen);
    menu.setAttribute('aria-hidden', state.megaOpen ? 'false' : 'true');
    menu.setAttribute('data-mobile-view', 'rail');
    const trigger = document.getElementById('megaTrigger');
    if (trigger) { trigger.classList.toggle('active', state.megaOpen); trigger.setAttribute('aria-expanded', state.megaOpen ? 'true' : 'false'); }
    const arr = document.getElementById('megaArrow');
    if (arr) arr.style.transform = state.megaOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    if (state.megaOpen) {
        const firstRail = document.querySelector('.mega-cat-rail-item');
        if (firstRail) firstRail.focus();
    }
}
 
function closeMegaMenu() {
    if (!state.megaOpen) return;
    state.megaOpen = false;
    const menu = document.getElementById('megaMenu');
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    const trigger = document.getElementById('megaTrigger');
    if (trigger) { trigger.classList.remove('active'); trigger.setAttribute('aria-expanded', 'false'); }
    const arr = document.getElementById('megaArrow');
    if (arr) arr.style.transform = 'rotate(0deg)';
}
 
/* ناوبری کامل با کیبورد: فلش پایین از دکمه‌ی «دسته‌بندی‌ها» وارد رَیل می‌شود،
   بین آیتم‌های رَیل با فلش بالا/پایین حرکت می‌کند، Esc همیشه می‌بندد و فوکوس را برمی‌گرداند */
function handleMegaTriggerKeydown(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!state.megaOpen) toggleMegaMenu();
        else { const firstRail = document.querySelector('.mega-cat-rail-item'); if (firstRail) firstRail.focus(); }
    } else if (e.key === 'Escape' && state.megaOpen) {
        closeMegaMenu();
    }
}
 
function handleMegaRailKeydown(e, idx) {
    const items = document.querySelectorAll('.mega-cat-rail-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[idx + 1] || items[0];
        next.focus();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[idx - 1] || items[items.length - 1];
        prev.focus();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const firstLink = document.querySelector('.mega-cats-panel .mm-link');
        if (firstLink) firstLink.focus();
    } else if (e.key === 'Escape') {
        closeMegaMenu();
        const trigger = document.getElementById('megaTrigger');
        if (trigger) trigger.focus();
    }
}

function setSrpRating(r) { state.srpRating=r; updateRatingButtonsUI(); srpFilter(); }
function updateRatingButtonsUI() {
    document.querySelectorAll('.star-filter-item').forEach(btn => {
        const btnRating = parseInt(btn.dataset.rating, 10);
        btn.classList.toggle('active', btnRating === state.srpRating);
        btn.setAttribute('aria-pressed', btnRating === state.srpRating ? 'true' : 'false');
    });
}

 
function debouncedSrpFilter() {
    clearTimeout(priceFilterDebounce);
    priceFilterDebounce = setTimeout(srpFilter, 350);
}
 
function srpFilter() {
    const q=document.getElementById('srpInput').value.trim();
    const sort=document.getElementById('srpSort').value;
    const pMin=parseFloat(document.getElementById('priceMin').value)||0;
    const pMax=parseFloat(document.getElementById('priceMax').value)||Infinity;
    const avail=document.getElementById('fAvail').checked;
    const disc=document.getElementById('fDisc').checked;
    const minRat=state.srpRating;
 
    // ===== حالت‌های واقعی فیلتر (نه جستجوی متنی جعلی) =====
    // mode='all' یعنی همه‌ی محصولات بدون هیچ محدودیتی
    // mode='bestseller' یعنی مرتب‌سازی بر اساس امتیاز/تعداد نظرات، نه جستجوی کلمه
    // mode='discount' یعنی فقط کالاهای تخفیف‌دار
    let res;
    if (state.srpMode) {
        res = getSearchSource().slice();
        if (state.srpMode === 'discount') {
            res = res.filter(p => (p.discount || 0) > 0);
        } else if (state.srpMode === 'bestseller') {
            res = res.slice().sort((a, b) => ((b.rating || 0) * 10 + (b.reviews || 0)) - ((a.rating || 0) * 10 + (a.reviews || 0)));
        }
        // mode === 'all' → بدون فیلتر خاصی، کل کاتالوگ
    } else {
        res = q.length >= 1 ? searchProds(q) : getSearchSource().slice();
        if (state.srpCat) res = res.filter(p => p.category === state.srpCat || (p.breadcrumb && p.breadcrumb.toLowerCase().includes(state.srpCat.toLowerCase())));
        if (!q && !state.srpCat && state.srpQuery) {
            const sq = norm(state.srpQuery);
            res = res.filter(p => norm(p.name).includes(sq) || norm(p.breadcrumb || p.category).includes(sq) || fuzzyMatch(state.srpQuery, p.name));
        }
    }
 
    res = res.filter(p => { const fp = p.price - (p.price * (p.discount || 0) / 100); return fp >= pMin && fp <= pMax; });
    if (avail) res = res.filter(p => p.stock > 0);
    if (disc) res = res.filter(p => (p.discount || 0) > 0);
    if (minRat > 0) res = res.filter(p => (p.rating || 0) >= minRat);
    if (state.srpBrands.size) res = res.filter(p => p.brand && state.srpBrands.has(p.brand.trim()));   // ← جدید
    if (state.srpColors.size) res = res.filter(p => Array.isArray(p.colors) && p.colors.some(c => c && state.srpColors.has(c.name))); // ← جدید
 
    if (sort==='cheapest') res.sort((a,b)=>(a.price-(a.price*(a.discount||0)/100))-(b.price-(b.price*(b.discount||0)/100)));
    else if (sort==='expensive') res.sort((a,b)=>(b.price-(b.price*(b.discount||0)/100))-(a.price-(a.price*(a.discount||0)/100)));
    else if (sort==='rating') res.sort((a,b)=>(b.rating||0)-(a.rating||0));
    else if (sort==='newest') res.sort((a,b)=>b.id-a.id);
 
    res.sort((a,b)=>{ if (a.stock===0&&b.stock>0) return 1; if (a.stock>0&&b.stock===0) return -1; return 0; });
    state.srpResults=res;
    const labelMap = { all: 'همه محصولات', bestseller: 'پرفروش‌ترین‌ها', discount: 'تخفیفات ویژه' };
    renderSRP(res, state.srpMode ? labelMap[state.srpMode] : (q||state.srpQuery));
}

function renderSRP(res, q) {
    const titleEl = document.getElementById('srpTitle');
    const count=document.getElementById('srpCount'), grid=document.getElementById('srpGrid');
    if (titleEl) {
        if (q) titleEl.innerText = state.srpMode ? `نتایج «${q}»` : `نتایج جستجو برای «${q}»`;
        else titleEl.innerText = 'همه محصولات';
    }
    count.innerHTML = `${res.length.toLocaleString('fa-IR')} محصول یافت شد`;
    const fc = document.getElementById('filterResultCount');
    if (fc) fc.innerText = res.length.toLocaleString('fa-IR');
    if (!res.length) {
        const sim=getSearchSource().filter(p=>p.stock>0).sort((a,b)=>(b.rating||0)-(a.rating||0)).slice(0,4);
        grid.innerHTML=`<div class="srp-empty"><i class="fas fa-search"></i><h3>محصولی یافت نشد</h3><p>کلمه جستجو یا فیلترها را تغییر دهید</p></div>
            ${sim.length?`<div class="srp-suggestions"><h4><i class="fas fa-lightbulb" style="color:var(--warning)"></i> شاید این موارد را بپسندید</h4>
            <div class="srp-grid" style="grid-column:1/-1;">${sim.map(p=>createSRPCard(p)).join('')}</div></div>`:''}`;
        return;
    }
    renderGridChunked(grid, res, createSRPCard, 16);
}
 
/* ============================================
   LAZY/CHUNKED GRID RENDERING (IntersectionObserver)
   -------------------------------------------
   قبلاً renderSRP همه‌ی نتایج (که می‌تواند صدها آیتم باشد) را یکجا
   innerHTML می‌کرد؛ این هم اسکرول اولیه را کند می‌کرد و هم DOM سنگینی
   می‌ساخت. حالا فقط یک دسته‌ی اول رندر می‌شود و با نزدیک شدن کاربر به
   انتهای صفحه (از طریق یک عنصر sentinel نامرئی)، دسته‌ی بعدی اضافه
   می‌شود؛ دقیقاً مثل اسکرول بی‌نهایت واقعی، بدون رندر یکجای کل آرایه.
   ============================================ */
let srpGridObserver = null;
function renderGridChunked(container, items, cardFn, chunkSize) {
    if (srpGridObserver) { srpGridObserver.disconnect(); srpGridObserver = null; }
    container.innerHTML = '';
    let cursor = 0;
 
    function appendNextChunk() {
        const next = items.slice(cursor, cursor + chunkSize);
        if (!next.length) return;
        const frag = document.createElement('div');
        frag.innerHTML = next.map(p => cardFn(p)).join('');
        while (frag.firstChild) container.appendChild(frag.firstChild);
        cursor += next.length;
 
        // sentinel قبلی (اگر بود) حذف و یک sentinel تازه در انتهای گرید اضافه می‌شود
        const oldSentinel = container.querySelector('.srp-load-sentinel');
        if (oldSentinel) oldSentinel.remove();
        if (cursor < items.length) {
            const sentinel = document.createElement('div');
            sentinel.className = 'srp-load-sentinel';
            sentinel.style.cssText = 'grid-column:1/-1;height:1px;';
            container.appendChild(sentinel);
            if (srpGridObserver) srpGridObserver.observe(sentinel);
        }
    }
 
    srpGridObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) appendNextChunk(); });
    }, { root: null, rootMargin: '600px 0px', threshold: 0 });
 
    appendNextChunk();
}
 



function createSRPCard(p) {
    const fp = Math.round(p.price - (p.price * (p.discount || 0) / 100));
    const imgSrc = p.image || FALLBACK_IMG;
    const pid = Number(p.id);
    const isWished = getWishlist().includes(pid);
    const badge = p.discount > 0 ? `<span class="p-discount-badge">${p.discount.toLocaleString('fa-IR')}٪</span>` : '';
    const colorsHtml = (Array.isArray(p.colors) && p.colors.length)
        ? `<div class="p-color-dots">${p.colors.slice(0, 5).map(c => `<span class="p-color-dot" style="background:${esc(c.code)};" title="${escAttr(c.name)}"></span>`).join('')}${p.colors.length > 5 ? `<span class="p-color-more">+${(p.colors.length - 5).toLocaleString('fa-IR')}</span>` : ''}</div>`
        : '';
    const specLine = p.brand ? `<div class="p-spec-line">${esc(p.brand)}</div>` : '';
    const outOfStock = Number(p.stock) <= 0;
    const btnLabel = outOfStock ? 'ناموجود' : 'افزودن به سبد خرید';

    return `
    <div class="p-card-wrap">
    <article class="p-card" tabindex="0" role="button" aria-label="${escAttr(p.name)}"
        onclick="openProductFromCard(${pid}, '${escAttr(p.name)}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openProductFromCard(${pid}, '${escAttr(p.name)}');}">
        <div class="ripple-container"></div>
        <div class="p-img-wrap">
            ${badge}
            <button type="button" class="p-wishlist-btn${isWished ? ' active' : ''}" onclick="event.stopPropagation();quickWishlist(${pid}, this)" aria-label="افزودن به علاقه‌مندی">
                <i class="${isWished ? 'fas' : 'far'} fa-heart"></i>
            </button>
            <img src="${esc(imgSrc)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
        </div>
        <div class="p-body">
            ${colorsHtml}
            <h3 class="p-name">${esc(p.name)}</h3>
            ${specLine}
            <div class="p-price-row">
                <span class="p-final">${fp.toLocaleString('en-US')} <small>تومان</small></span>
            </div>
            <button type="button" class="p-add-btn" ${outOfStock ? 'disabled' : ''} onclick="event.stopPropagation();quickAddToCart(${pid}, this)">
                <i class="fas fa-shopping-bag"></i> ${btnLabel}
            </button>
        </div>
    </article>
    </div>`;
}



async function openProductFromCard(id, name) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) { showToast('محصول نامعتبر است'); return; }
    Store.addRecentlyViewed(numId);
    const localHit = state.searchCatalog.find(x => x.id === numId);
    if (localHit) {
        if (name) addHistory(name);
        window.location.href = 'product.html?id=' + encodeURIComponent(numId);
        return;
    }
    const remote = await Store.getProductById(numId);
    if (!remote) { showToast('محصول یافت نشد'); return; }
    if (name) addHistory(name);
    window.location.href = 'product.html?id=' + encodeURIComponent(numId);
}
 
function getWishlist() { return Store.getWishlist(); }
function quickWishlist(id, btn) {
    let wl=getWishlist(); const icon=btn.querySelector('i');
    if (wl.includes(id)) {
        wl=wl.filter(x=>x!==id); btn.classList.remove('active'); icon.className='far fa-heart'; showToast('از لیست علاقه‌مندی حذف شد');
    } else {
        wl.push(id); btn.classList.add('active','pop'); icon.className='fas fa-heart'; setTimeout(()=>btn.classList.remove('pop'),300); showToast('به لیست علاقه‌مندی اضافه شد');
    }
    Store.setWishlist(wl);
}

/* ============================================
   SRP VIEW MODE (شبکه‌ای / لیستی)
   ============================================ */
function setSrpViewMode(mode) {
    const grid = document.getElementById('srpGrid');
    const gridBtn = document.getElementById('srpViewGridBtn');
    const listBtn = document.getElementById('srpViewListBtn');
    if (!grid) return;
    grid.classList.toggle('list-view', mode === 'list');
    if (gridBtn) { gridBtn.classList.toggle('active', mode === 'grid'); gridBtn.setAttribute('aria-pressed', mode === 'grid' ? 'true' : 'false'); }
    if (listBtn) { listBtn.classList.toggle('active', mode === 'list'); listBtn.setAttribute('aria-pressed', mode === 'list' ? 'true' : 'false'); }
}

/* ============================================
   QUICK ADD TO CART از کارت‌های نتایج جستجو (Firestore-backed)
   ============================================ */
const srpAddInProgress = new Set();
async function quickAddToCart(id, btnEl) {
    const pid = Number(id);
    if (srpAddInProgress.has(pid)) return;

    if (!state.currentUser) {
        showToast('برای افزودن به سبد ابتدا وارد شوید');
        setTimeout(() => window.location.href = 'login.html', 1200);
        return;
    }

    let product = state.searchCatalog.find(p => Number(p.id) === pid);
    if (!product) product = await Store.getProductById(pid);
    if (!product) { showToast('محصول یافت نشد'); return; }
    if (Number(product.stock) <= 0) { showToast('این کالا ناموجود است'); return; }

    srpAddInProgress.add(pid);
    const originalHtml = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال افزودن...';

    try {
        const colorName = (Array.isArray(product.colors) && product.colors.length) ? product.colors[0].name : 'مشکی';
        const userRef = window.fbDoc(window.fbDb, 'users', state.currentUser.uid);
        const userSnap = await window.fbGetDoc(userRef);
        let cart = (userSnap.exists() && Array.isArray(userSnap.data().cart)) ? [...userSnap.data().cart] : [];
        const existing = cart.find(x => Number(x.id) === pid && x.color === colorName);
        if (existing) {
            if (existing.qty >= product.stock) { showToast(`حداکثر ${product.stock} عدد موجود است`); return; }
            existing.qty += 1;
        } else {
            cart.push({ id: pid, qty: 1, color: colorName, name: product.name });
        }
        await window.fbUpdateDoc(userRef, { cart });
        state.currentUser.cart = cart;
        updateCartUI(cart);
        showToast('به سبد خرید اضافه شد');
    } catch (e) {
        console.error('خطا در افزودن به سبد خرید:', e);
        showToast('خطا در ارتباط با سرور');
    } finally {
        srpAddInProgress.delete(pid);
        btnEl.disabled = false;
        btnEl.innerHTML = originalHtml;
    }
}
 
/* ============================================
   PRODUCT NAVIGATION
   -------------------------------------------
   به‌جای اتکا به state لوکال که ممکن است کاملاً بارگذاری نشده
   باشد یا داده‌ی قدیمی داشته باشد، ابتدا تلاش می‌کنیم شناسه را
   در state موجود پیدا کنیم (برای پاسخ فوری)، اما وجود واقعی و
   امنِ محصول را با یک کوئری مستقیم و امن به Firestore
   (where('id','==',id)) — هماهنگ با روش product.html — تأیید
   می‌کنیم، به‌جای فرض قطعی صحت state محلی.
   ============================================ */
async function openProduct(id) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) {
        showToast('محصول نامعتبر است');
        return;
    }
    Store.addRecentlyViewed(numId);
    // بررسی سریع محلی برای تجربه‌ی کاربری روان (اختیاری، صرفاً UX)
    const localHit = state.searchCatalog.find(x => x.id === numId);
    if (localHit) {
        window.location.href = 'product.html?id=' + encodeURIComponent(numId);
        return;
    }
    // اگر در state لوکال نبود، قبل از هدایت، وجود واقعی آن را از سرور تأیید می‌کنیم
    const remote = await Store.getProductById(numId);
    if (!remote) { showToast('محصول یافت نشد'); return; }
    window.location.href = 'product.html?id=' + encodeURIComponent(numId);
}
 
/* ============================================
   CART BADGE SYNC (Firestore-backed)
   ============================================ */
function updateCartUI(cart) {
    const list = Array.isArray(cart) ? cart : [];
    const c=list.reduce((a,i)=>a+(i.qty||0),0);
    const hc=document.getElementById('headerCartCount'), nc=document.getElementById('mnCartCount');
    if (hc) hc.innerText=c.toLocaleString('fa-IR'); if (nc) nc.innerText=c.toLocaleString('fa-IR');
}
 
/* ============================================
   FIREBASE AUTH STATE
   ============================================ */
function updateAuthUI() {
    const authLink=document.getElementById('authLink'), label=document.getElementById('userLabel');
    if (label) label.classList.remove('skeleton','user-label-skeleton');
    if (state.currentUser) {
        if (authLink) authLink.href='profile.html';
        if (label) label.innerText=state.currentUser.name||'پنل کاربری';
    } else {
        if (authLink) authLink.href='login.html';
        if (label) label.innerText='ورود';
    }
}
 
function initFirebaseAuth() {
    if (!window.fbAuth || !window.fbOnAuthStateChanged) return;
    window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
        if (user) {
            let profile = await Store.getUserProfile(user.uid);
            if (!profile) {
                profile = {
                    uid: user.uid, email: user.email || '', name: user.displayName || '',
                    mobile:'', melli:'', address:'', post:'', wallet:0, points:0,
                    cart:[], wishlist:[], orders:[], createdAt: new Date().toISOString()
                };
            }
            state.currentUser = { uid: user.uid, ...profile };
            Store.setSession(user.uid);
            updateAuthUI();
            updateCartUI(state.currentUser.cart || []);
        } else {
            state.currentUser = null;
            Store.clearSession();
            updateAuthUI();
            updateCartUI([]);
        }
    });
    renderCoupons();
    initAmazingTimer();
}
 
/* ============================================
   AMAZING OFFERS TIMER — از پنل ادمین مدیریت می‌شود
   (Firestore -> settings/amazingTimer)
   ============================================ */

   function initAmazingTimer() {
    // انتخاب عناصر DOM مربوط به تایمر شگفت‌انگیز
    const hoursEl = document.getElementById('amazing-hours') || document.querySelector('.amazing-hours');
    const minutesEl = document.getElementById('amazing-minutes') || document.querySelector('.amazing-minutes');
    const secondsEl = document.getElementById('amazing-seconds') || document.querySelector('.amazing-seconds');

    // اگر عناصر تایمر در این صفحه وجود ندارند، تابع متوقف شود
    if (!hoursEl || !minutesEl || !secondsEl) return;

    let intervalId = null;

    function update() {
        const now = new Date().getTime();
        
        // محاسبه زمان پایان (از state یا پایان روز جاری)
        let targetTime = state.amazingTimerEndAt ? new Date(state.amazingTimerEndAt).getTime() : null;
        
        if (!targetTime || isNaN(targetTime)) {
            // اگر زمان مشخص نشده بود، تا پایان امشب تنظیم می‌شود
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            targetTime = endOfDay.getTime();
        }

        const distance = targetTime - now;

        // اتمام زمان تایمر
        if (distance <= 0) {
            if (intervalId) clearInterval(intervalId);
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            return;
        }

        // محاسبه ساعت، دقیقه و ثانیه
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        // بروزرسانی DOM با فرمت دو رقمی (مثلاً 05)
        hoursEl.textContent = String(hours).padStart(2, '0');
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    // فراخوانی اولیه جهت جلوگیری از تاخیر ۱ ثانیه‌ای نمایش
    update();

    // تنظیم اینتروال برای به‌روزرسانی هر ثانیه
    intervalId = setInterval(update, 1000);
}

 
/* ============================================
   UTILS & APP INIT
   ============================================ */
function showToast(msg) {
    const t=document.getElementById('toast');
    clearTimeout(toastTimer); t.innerText=msg; t.classList.add('show');
    toastTimer=setTimeout(()=>t.classList.remove('show'), 3000);
}
 
window.addEventListener('scroll', ()=>{
    const h=document.getElementById('mainHeader');
    if (window.scrollY>10) h.classList.add('scrolled'); else h.classList.remove('scrolled');
}, {passive:true});
 
function setMobileThemeBtn() {
    const btn=document.getElementById('mobileTheme'); if (!btn) return;
    btn.style.display=window.innerWidth<=768?'flex':'none';
}
 
document.addEventListener('click', e => {
    const mm=document.getElementById('megaMenu'), mt=document.getElementById('megaTrigger'), mn=document.querySelectorAll('.mn-item')[1];
    if (mm&&mt&&!mm.contains(e.target)&&!mt.contains(e.target)&&!(mn&&mn.contains(e.target))) closeMegaMenu();
    const dd=document.getElementById('searchDropdown'), sc=document.querySelector('.search-container');
    if (dd&&sc&&!sc.contains(e.target)) closeDropdown();
});
 
document.addEventListener('keydown', e=>{
    if (e.key==='Escape') {
        if (document.getElementById('srpOverlay').classList.contains('open')) closeSRP();
        else if (state.megaOpen) { closeMegaMenu(); const t=document.getElementById('megaTrigger'); if (t) t.focus(); }
        else closeDropdown();
    }
});
 
/* ============================================
   FOCUS TRAP برای مودال SRP (طبق الگوی استاندارد ARIA Dialog)
   -------------------------------------------
   وقتی مودال باز است، کلید Tab/Shift+Tab باید فقط بین عناصر
   قابل‌فوکوس داخل خود مودال بچرخد و کاربر نتواند با کیبورد وارد
   محتوای پشت آن (که از دید بصری پنهان نیست ولی معنایی مسدود است) شود.
   ============================================ */
function getFocusableInDialog(dialog) {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(dialog.querySelectorAll(selector)).filter(el => el.offsetParent !== null);
}
document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const overlay = document.getElementById('srpOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;
 
    const focusable = getFocusableInDialog(overlay);
    if (focusable.length === 0) return;
 
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
 
    if (e.shiftKey) {
        // Shift+Tab روی اولین عنصر → پرش به آخرین عنصر
        if (active === first || !overlay.contains(active)) {
            e.preventDefault();
            last.focus();
        }
    } else {
        // Tab روی آخرین عنصر → پرش به اولین عنصر
        if (active === last || !overlay.contains(active)) {
            e.preventDefault();
            first.focus();
        }
    }
});
 
/* APP INIT */
document.addEventListener('DOMContentLoaded', async ()=>{
    applyTheme(state.theme);
    setMobileThemeBtn();
    loadSlidesData();
    initHeroSwiper(); // اسلایدر هیرو با داده‌ی محلی بلافاصله مقداردهی می‌شود
    initSearch();
 
    // درخت دسته‌بندی را از Firestore (منبع واحد که admin.html هم از آن
    // می‌خواند/می‌نویسد) بارگذاری می‌کنیم؛ دیگر هیچ نسخه‌ی هاردکد محلی
    // در این صفحه نگه‌داری نمی‌شود.
    const tree = await Store.getCategoryTree();
    state.categoryData = tree || {};
    renderMegaMenu();
 
    // بارگذاری صفحه‌ی اول محصولات (صفحه‌بندی‌شده، نه کل کاتالوگ)
    renderSpotlight();
    renderCoupons();
 
    // کاتالوگ گسترده‌تر (اما همچنان محدود) برای جستجو/SRP/قسطی‌شگفت
    // به‌صورت جداگانه و بدون مسدود کردن رندر اولیه لود می‌شود
    loadSearchCatalog().then(() => {
        renderAmazingOffers();
        renderRecentlyViewed();
        renderPersonalizedRecommendations();
        checkBackInStock();
    });
 
    window.addEventListener('resize', setMobileThemeBtn);
});
 
// اتصال به Firebase Auth — چه قبل و چه بعد از DOMContentLoaded آماده شود
window.addEventListener('firebase-ready', initFirebaseAuth);
if (window.fbAuth) initFirebaseAuth();
 
 
 
/* ============================================
   COUPON CARDS — کالکشن Firestore به نام "coupons"
   ============================================ */
async function loadCoupons() {
    try {
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'coupons'), window.fbOrderBy('order', 'asc'));
        const snap = await window.fbGetDocs(q);
        const list = [];
        snap.forEach(d => list.push({ ...d.data(), _docId: d.id }));
        return list;
    } catch (e) {
        console.error('خطا در خواندن کدهای تخفیف از Firestore:', e);
        return [];
    }
}
 
function isCouponVisible(c, user) {
    if (!c.active) return false;
    const now = new Date();
    // FIX: admin.html فیلدهای startDate/endDate را ذخیره می‌کند (از
    // <input type="date">)، نه startAt/endAt. قبلاً این تابع startAt/endAt
    // را چک می‌کرد که هرگز روی هیچ سند کوپنی وجود نداشت — یعنی محدودیت
    // بازه‌ی تاریخ کوپن‌ها در نمایش صفحه‌ی اصلی همیشه نادیده گرفته می‌شد.
    if (c.startDate) {
        const start = new Date(c.startDate);
        if (now < start) return false;
    }
    if (c.endDate) {
        const end = new Date(c.endDate);
        end.setHours(23, 59, 59, 999); // پایان همان روزِ endDate
        if (now > end) return false;
    }
    if (c.usageLimit != null && (c.usedCount || 0) >= c.usageLimit) return false;
 
    const aud = c.audience || 'all';
    if (aud === 'all') return true;
    if (!user) return false;
    if (!user.createdAt) return true;
    const days = (now - new Date(user.createdAt)) / 86400000;
    if (aud === 'newUsers') return days <= (c.audienceDays || 30);
    if (aud === 'oldUsers') return days >= (c.audienceDays || 365);
    return true;
}
 
function createCouponCard(c, idx) {
    const isOrange = idx % 2 === 1;
    const valueBig = c.discountType === 'percent'
        ? `${Number(c.discountValue || 0).toLocaleString('fa-IR')}%`
        : `${Number(c.discountValue || 0).toLocaleString('en-US')}`;
    const subtitle = c.valueLabel || (c.discountType === 'percent' ? 'تخفیف ویژه' : 'تومان تخفیف');
    const leftLabel = c.title || 'GIFT VOUCHER';
    const minAmountTxt = c.minAmount
        ? `حداقل خرید ${Number(c.minAmount).toLocaleString('en-US')} تومان`
        : 'بدون حداقل خرید';
    const desc = `کد تخفیف : ${esc(c.code)}`;
    return `
        <div class="coupon-card-v2${isOrange ? ' is-orange' : ''}" onclick="copyCouponCode('${escAttr(c.code)}')" title="برای کپی کد کلیک کنید">
            <div class="ccv2-left"><span>${esc(leftLabel)}</span></div>
            <div class="ccv2-divider"></div>
            <div class="ccv2-right">
                <div class="ccv2-copy-hint"><i class="fas fa-copy"></i> کپی</div>
                <div class="ccv2-value">${valueBig}</div>
                <div class="ccv2-subtitle">${esc(subtitle)}</div>
                <div class="ccv2-line"></div>
                <div class="ccv2-desc">${desc}</div>
            </div>
        </div>`;
}
 
function copyCouponCode(code) {
    navigator.clipboard.writeText(code).then(() => showToast(`کد «${code}» کپی شد`)).catch(() => {});
}
 
async function renderCoupons() {
    const root = document.getElementById('couponSectionRoot');
    const row = document.getElementById('couponScrollRow');
    if (!root || !row) return;
    const all = await loadCoupons();
    const visible = all.filter(c => isCouponVisible(c, state.currentUser));
    if (!visible.length) { root.style.display = 'none'; return; }
    row.innerHTML = visible.map((c, i) => createCouponCard(c, i)).join('');
    root.style.display = 'block';
}