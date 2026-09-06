import { skelFill, skelDone, skelError, skelRun, skelText, skelRevealText } from './skeleton.js';
const DB = {
    legacySession: 'current_user' // فقط پل موقتی برای صفحاتی که هنوز مهاجرت نشده‌اند
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
    srpBrands: new Set(),      // ← جدید
    srpColors: new Set(),      // ← جدید
    srpPriceMin: 0,            // ← جدید
    srpPriceMax: 0,            // ← جدید
    srpCatalogMaxPrice: 0,     // ← جدید
    megaOpen: false,
    currentUser: null,
    amazingTimerEndAt: null,
    amazingTimerStartAt: null,
    categoryData: {}
};

// --- Initialization ---
let checkoutInitialized = false;

window.addEventListener('firebase-ready', initCheckout);
if (window.fbAuth) initCheckout();

function initCheckout() {
    if (checkoutInitialized) return;
    checkoutInitialized = true;

    window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
        try {
            if (!user) {
                localStorage.removeItem(DB.legacySession);
                showToast('لطفاً ابتدا وارد حساب کاربری شوید', 'error');
                setTimeout(() => window.location.href = 'login.html', 1500);
                return;
            }

            localStorage.setItem(DB.legacySession, user.uid); // پل موقتی برای صفحات مهاجرت‌نشده

            const profile = await getUserProfile(user.uid);
            if (!profile) {
                showToast('خطا در احراز هویت.', 'error');
                window.location.href = 'login.html';
                return;
            }

            state.user = { uid: user.uid, ...profile };
            state.cart = Array.isArray(state.user.cart) ? state.user.cart : [];

            await loadProducts();

            if (profile.emailVerifiedCustom !== true) {
                showToast('لطفاً ابتدا ایمیل خود را تأیید کنید', 'error');
                setTimeout(() => window.location.href = 'login.html', 1500);
                return;
            }

            if (state.cart.length === 0) {
                showToast('سبد خرید شما خالی است!', 'error');
                setTimeout(() => window.location.href = 'index.html', 1200);
                return;
            }

            populateUserInfo();
            renderSummary();

            document.getElementById('shipping-method').addEventListener('change', calculateTotals);
        } catch (error) {
            console.error("Init Error:", error);
            showToast('خطایی در بارگذاری داده‌ها رخ داد', 'error');
        }
    });
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

function populateUserInfo() {
    document.getElementById('ship-name').value = state.user.name || '';
    document.getElementById('ship-phone').value = state.user.mobile || state.user.email || '';
    if(state.user.address) document.getElementById('ship-address').value = state.user.address;
}

function selectPayment(method, element) {
    state.paymentMethod = method;
    document.getElementById('selected-payment-gateway').value = method;
    document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
}

function renderSummary() {
    const container = document.getElementById('summary-items');
    container.innerHTML = '';
    let tempSubtotal = 0;
    let tempDiscount = 0;

    state.cart.forEach(item => {
        const product = state.products.find(p => p.id == item.id);
        if (!product) return;

        const originalPrice = product.price;
        const discountPercent = product.discount || 0;
        const priceAfterDiscount = originalPrice - (originalPrice * (discountPercent / 100));
        const itemTotal = priceAfterDiscount * item.qty;

        tempSubtotal += itemTotal;
        tempDiscount += ((originalPrice - priceAfterDiscount) * item.qty);

        container.innerHTML += `
            <div class="summary-item">
                <div class="item-info">
                    <img src="${product.image}" class="item-img-mini" onerror="this.src='https://via.placeholder.com/40?text=M'">
                    <div class="item-details">
                        <h4>${product.name}</h4>
                        <p>رنگ: ${item.color || 'مشکی'} | تعداد: ${item.qty}</p>
                    </div>
                </div>
                <div style="font-weight: 700;">${itemTotal.toLocaleString('en-US')}</div>
            </div>
        `;
    });

    state.subtotal = tempSubtotal;
    state.discount = tempDiscount;
    calculateTotals();
}

function calculateTotals() {
    const shippingSelect = document.getElementById('shipping-method').value;
    let shipping = 0;

    if (shippingSelect === 'free' || state.subtotal >= 1000000) {
        shipping = 0;
    } else if (shippingSelect === 'post') {
        shipping = 35000;
    } else if (shippingSelect === 'tipax') {
        shipping = 45000;
    }

    state.shippingCost = shipping;
    state.finalTotal = Math.max(0, state.subtotal + shipping - state.couponDiscountAmount);

    document.getElementById('subtotal').innerText = state.subtotal.toLocaleString('en-US') + ' تومان';
    document.getElementById('shipping-cost').innerText = shipping === 0 ? 'رایگان' : shipping.toLocaleString('en-US') + ' تومان';
    document.getElementById('discount-val').innerText = '-' + state.discount.toLocaleString('en-US') + ' تومان';

    const couponRow = document.getElementById('couponSavedRow');
    if (state.couponDiscountAmount > 0) {
        couponRow.style.display = 'flex';
        document.getElementById('coupon-saved-val').innerText = '-' + state.couponDiscountAmount.toLocaleString('en-US') + ' تومان';
    } else {
        couponRow.style.display = 'none';
    }

    document.getElementById('final-total').innerText = state.finalTotal.toLocaleString('en-US') + ' تومان';
}

/* =====================================================
   COUPON VALIDATION & APPLICATION
   ===================================================== */
function getAccountCreatedDate(user) {
    if (!user || !user.createdAt) return null;
    if (typeof user.createdAt === 'string') return new Date(user.createdAt);
    if (typeof user.createdAt.toDate === 'function') return user.createdAt.toDate();
    if (typeof user.createdAt.seconds === 'number') return new Date(user.createdAt.seconds * 1000);
    return null;
}

function setCouponUI(mode, message) {
    const box = document.getElementById('couponBox');
    const msgEl = document.getElementById('couponMessage');
    box.classList.remove('is-error', 'is-success');
    msgEl.classList.remove('error-text', 'success-text');
    if (mode === 'error') {
        box.classList.add('is-error');
        msgEl.classList.add('error-text');
        msgEl.innerText = message || '';
    } else if (mode === 'success') {
        box.classList.add('is-success');
        msgEl.classList.add('success-text');
        msgEl.innerText = message || '';
    } else {
        msgEl.innerText = '';
    }
}

async function findCouponByCode(rawCode) {
    const code = rawCode.trim().toUpperCase();
    if (!code) return null;
    const q = window.fbQuery(window.fbCollection(window.fbDb, 'coupons'), window.fbWhere('code', '==', code));
    const snap = await window.fbGetDocs(q);
    if (snap.empty) return null;
    let result = null;
    snap.forEach(d => { result = { ...d.data(), _docId: d.id }; });
    return result;
}

function validateCoupon(coupon) {
    if (!coupon.active) return { ok: false, msg: 'این کد تخفیف دیگر فعال نیست.' };

    const now = new Date();
    if (coupon.startDate) {
        const start = new Date(coupon.startDate + 'T00:00:00');
        if (now < start) return { ok: false, msg: 'زمان استفاده از این کد هنوز شروع نشده است.' };
    }
    if (coupon.endDate) {
        const end = new Date(coupon.endDate + 'T23:59:59');
        if (now > end) return { ok: false, msg: 'تاریخ اعتبار این کد تخفیف به پایان رسیده است.' };
    }

    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
        return { ok: false, msg: 'ظرفیت استفاده از این کد تخفیف تکمیل شده است.' };
    }

    if (coupon.minAmount && state.subtotal < coupon.minAmount) {
        return { ok: false, msg: `حداقل مبلغ سبد خرید برای این کد ${Number(coupon.minAmount).toLocaleString('en-US')} تومان است.` };
    }

    if (coupon.scope === 'category' && coupon.scopeCategory) {
        const hasCategory = state.cart.some(item => {
            const p = state.products.find(pr => pr.id == item.id);
            return p && p.category === coupon.scopeCategory;
        });
        if (!hasCategory) return { ok: false, msg: `این کد فقط برای دسته‌بندی «${coupon.scopeCategory}» قابل استفاده است.` };
    }

    if (coupon.audience && coupon.audience !== 'all') {
        const createdAt = getAccountCreatedDate(state.user);
        if (!createdAt) return { ok: false, msg: 'این کد فقط برای گروه خاصی از کاربران قابل استفاده است.' };
        const days = (now - createdAt) / 86400000;
        const threshold = coupon.audienceDays || (coupon.audience === 'newUsers' ? 30 : 365);
        if (coupon.audience === 'newUsers' && days > threshold) {
            return { ok: false, msg: 'این کد فقط برای کاربران تازه‌عضو معتبر است.' };
        }
        if (coupon.audience === 'oldUsers' && days < threshold) {
            return { ok: false, msg: 'این کد فقط برای کاربران قدیمی معتبر است.' };
        }
    }

    return { ok: true };
}

function computeCouponDiscount(coupon) {
    let amount = 0;
    if (coupon.discountType === 'percent') {
        amount = state.subtotal * (coupon.discountValue / 100);
        if (coupon.maxDiscount) amount = Math.min(amount, coupon.maxDiscount);
    } else {
        amount = coupon.discountValue;
    }
    return Math.min(amount, state.subtotal);
}

async function handleCouponButtonClick() {
    if (state.couponCode) { removeCoupon(); return; }

    const input = document.getElementById('couponInput');
    const btn = document.getElementById('couponBtn');
    const code = input.value.trim();
    if (!code) { setCouponUI('error', 'یک کد تخفیف وارد کنید.'); return; }

    btn.disabled = true;
    btn.innerText = 'در حال بررسی...';
    setCouponUI('idle', '');

    try {
        const coupon = await findCouponByCode(code);
        if (!coupon) {
            setCouponUI('error', 'کد تخفیف وارد شده معتبر نیست.');
            return;
        }
        const result = validateCoupon(coupon);
        if (!result.ok) {
            setCouponUI('error', result.msg);
            return;
        }

        const discountAmount = computeCouponDiscount(coupon);
        state.couponCode = coupon.code;
        state.couponDocId = coupon._docId;
        state.couponDiscountAmount = discountAmount;

        input.disabled = true;
        btn.disabled = false;
        btn.innerText = 'حذف کد';
        btn.classList.add('remove-mode');
        setCouponUI('success', `کد «${coupon.code}» با موفقیت اعمال شد.`);
        calculateTotals();
    } catch (e) {
        console.error('خطا در بررسی کد تخفیف:', e);
        setCouponUI('error', 'خطا در ارتباط با سرور. دوباره تلاش کنید.');
    } finally {
        btn.disabled = false;
        if (!state.couponCode) btn.innerText = 'اعمال';
    }
}

function removeCoupon() {
    state.couponCode = null;
    state.couponDocId = null;
    state.couponDiscountAmount = 0;

    const input = document.getElementById('couponInput');
    const btn = document.getElementById('couponBtn');
    input.disabled = false;
    input.value = '';
    btn.innerText = 'اعمال';
    btn.classList.remove('remove-mode');
    setCouponUI('idle', '');
    calculateTotals();
}
// --- ADVANCED PAYMENT SIMULATION LOGIC ---

function generateUniqueTransactionId(gateway) {
    // Generate a unique ID based on timestamp, random number, and gateway prefix
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomPart = Math.floor(Math.random() * 900000) + 100000;
    const prefix = gateway === 'zarinpal' ? 'ZP' : (gateway === 'melat' ? 'MLT' : 'PPG');

    // Create a simple hash-like string for uniqueness
    return `${prefix}_${timestamp}_${randomPart}`;
}

function simulateBankConnection(txnId, gateway, amount) {
    return new Promise((resolve, reject) => {
        const loadingText = document.getElementById('loadingText');
        const subText = document.getElementById('subText');
        const codeDisplay = document.getElementById('txnCode');

        codeDisplay.innerText = `TXN_ID: ${txnId}`;

        // Simulate network delay steps
        const steps = [
            { time: 1000, text: 'ارتباط با سرور بانک...', sub: 'در حال برقراری پروتکل امن...' },
            { time: 2500, text: 'تایید مبلغ تراکنش...', sub: `مبلغ: ${amount.toLocaleString('en-US')} تومان` },
            { time: 4000, text: 'در حال انتقال به درگاه...', sub: 'انتظار کنید...' }
        ];

        let stepIndex = 0;

        const interval = setInterval(() => {
            if (stepIndex < steps.length) {
                loadingText.innerText = steps[stepIndex].text;
                subText.innerText = steps[stepIndex].sub;
                stepIndex++;
            } else {
                clearInterval(interval);

                // Simulate success/failure randomly (90% success rate)
                const isSuccess = Math.random() > 0.1;

                if (isSuccess) {
                    resolve({ status: 'SUCCESS', txnId, gateway, amount });
                } else {
                    reject({ status: 'FAILED', txnId, gateway, amount, reason: 'خطای شبکه یا موجودی ناکافی' });
                }
            }
        }, 1500); // Each step takes 1.5 seconds
    });
}

async function processOrder() {
    if (!state.user) {
        showToast('اطلاعات کاربری هنوز بارگذاری نشده است، کمی صبر کنید', 'error');
        return;
    }

    // 1. Validation
    const address = document.getElementById('ship-address').value.trim();
    const postal = document.getElementById('ship-postal').value;

    if (address.length < 10) {
        showToast('لطفاً آدرس کامل و دقیقی وارد کنید', 'error');
        document.getElementById('ship-address').focus();
        return;
    }

    if (postal && !/^\d{10}$/.test(postal)) {
        showToast('کد پستی باید دقیقاً ۱۰ رقم باشد', 'error');
        document.getElementById('ship-postal').focus();
        return;
    }

    const payBtn = document.getElementById('payBtn');
    payBtn.disabled = true;

    // 2. Prepare Order Data
    const orderData = {
        userId: state.user.uid,
        items: JSON.parse(JSON.stringify(state.cart)),
        totalAmount: state.finalTotal,
        shippingMethod: document.getElementById('shipping-method').value,
        shippingCost: state.shippingCost,
        address: address,
        postalCode: postal,
        couponCode: state.couponCode || null,
        couponDiscountAmount: state.couponDiscountAmount || 0,
        status: 'pending_payment',
        createdAt: new Date().toISOString()
    };

    // 3. Start Payment Process
    showLoading(true, 'در حال برقراری ارتباط...', 'لطفاً صبر کنید');

    // Generate Unique Transaction ID
    state.currentTxnId = generateUniqueTransactionId(state.paymentMethod);

    try {
        // Call the simulated bank connection
        const result = await simulateBankConnection(state.currentTxnId, state.paymentMethod, state.finalTotal);

        // If successful
        await handlePaymentSuccess(result, orderData);

    } catch (error) {
        // If failed
        await handlePaymentFailure(error, orderData);
    } finally {
        payBtn.disabled = false;
    }
}

async function handlePaymentSuccess(paymentResult, orderData) {
    // 1. بروزرسانی وضعیت سفارش
    orderData.status = 'paid';
    orderData.paymentGateway = paymentResult.gateway;
    orderData.transactionId = paymentResult.txnId;
    orderData.paidAt = new Date().toISOString();

    try {
        // 2. ذخیره سفارش در کالکشن "orders" روی Firestore
        //    توجه: طبق firestore.rules، سفارش ابتدا فقط با status
        //    'pending_payment' قابل ساخت است؛ سپس بلافاصله با یک
        //    updateDoc جداگانه به 'paid' تغییر می‌کند (چون rules
        //    اجازه‌ی ساخت مستقیم سفارش با status='paid' را نمی‌دهد).
        const pendingData = { ...orderData, status: 'pending_payment' };
        delete pendingData.paymentGateway;
        delete pendingData.transactionId;
        delete pendingData.paidAt;

        const orderRef = await window.fbAddDoc(window.fbCollection(window.fbDb, 'orders'), pendingData);
        await window.fbUpdateDoc(orderRef, {
            status: 'paid',
            paymentGateway: orderData.paymentGateway,
            transactionId: orderData.transactionId,
            paidAt: orderData.paidAt
        });

        // 3. خالی کردن سبد خرید کاربر در Firestore
        await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'users', state.user.uid), { cart: [] });
        state.user.cart = [];
        state.cart = [];
        if (state.couponCode && state.couponDocId) {
            try {
                await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'coupons', state.couponDocId), {
                    usedCount: window.fbIncrement(1)
                });
            } catch (e) {
                console.error('خطا در بروزرسانی تعداد استفاده از کد تخفیف:', e);
                // این خطا نباید جلوی تکمیل موفق سفارش را بگیرد، فقط لاگ می‌شود
            }
        }
    } catch (e) {
        console.error('خطا در ثبت سفارش در Firestore:', e);
        hideLoading();
        showToast('پرداخت انجام شد ولی ثبت سفارش با خطا مواجه شد. با پشتیبانی تماس بگیرید.', 'error');
        return;
    }

    hideLoading();
    showToast(`پرداخت با موفقیت انجام شد.\nشماره پیگیری: ${paymentResult.txnId}`, 'success');

    // بازگشت به صفحه اصلی پس از نمایش پیام
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2500);
}

async function handlePaymentFailure(failResult, orderData) {
    hideLoading();

    // Keep order as pending or cancel? Let's keep it pending but mark as failed
    orderData.status = 'failed_payment';
    orderData.transactionId = failResult.txnId;
    orderData.failureReason = failResult.reason;

    try {
        // طبق firestore.rules، ساخت مستقیم سفارش با status='failed_payment'
        // مجاز نیست؛ ابتدا با pending_payment ساخته و سپس آپدیت می‌شود.
        const pendingData = { ...orderData, status: 'pending_payment' };
        delete pendingData.transactionId;
        delete pendingData.failureReason;

        const orderRef = await window.fbAddDoc(window.fbCollection(window.fbDb, 'orders'), pendingData);
        await window.fbUpdateDoc(orderRef, {
            status: 'failed_payment',
            transactionId: orderData.transactionId,
            failureReason: orderData.failureReason
        });
    } catch (e) {
        console.error('خطا در ثبت سفارش ناموفق در Firestore:', e);
    }

    showToast(`پرداخت ناموفق بود.\nدلیل: ${failResult.reason}\nشماره پیگیری: ${failResult.txnId}`, 'error');
}

function showLoading(show, mainText, subText) {
    const overlay = document.getElementById('loadingOverlay');
    const main = document.getElementById('loadingText');
    const sub = document.getElementById('subText');

    if (show) {
        main.innerText = mainText;
        sub.innerText = subText;
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const icon = toast.querySelector('i');

    toast.className = `toast ${type}`;
    toastMsg.innerText = msg;

    if (type === 'success') {
        icon.className = 'fas fa-check-circle';
        toast.style.background = '#00b894';
    } else {
        icon.className = 'fas fa-exclamation-circle';
        toast.style.background = '#ef394e';
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000); // Longer duration for error messages with transaction ID
}

