// ===== localStorage Keys (فقط برای بخش‌هایی که هنوز مهاجرت نشده‌اند) =====
        // ⚠️ محصولات دیگر اینجا نیستند — از این پس فقط در Firestore (کالکشن "products") ذخیره می‌شوند.
        // اسلایدها، سفارشات و کاربران فعلاً همچنان از localStorage می‌آیند تا در فازهای بعدی مهاجرت شوند.
        const SLIDES_KEY = 'shop_slides';
        const AMAZING_TIMER_KEY = 'amazing_timer_settings';

        // ===== سفارشات و کاربران — فاز ۱ مهاجرت: از این پس فقط Firestore =====
        // کالکشن‌های "orders" و "users" منبع واحد داده هستند (نه localStorage).
        let cachedOrders = []; // آخرین نسخه‌ی سفارشات خوانده‌شده از Firestore، همراه _docId
        const usersCache = new Map(); // کش سبک uid -> داده‌ی سند users/{uid} برای جلوگیری از خواندن تکراری

        async function getUserCached(uid) {
            if (!uid) return null;
            if (usersCache.has(uid)) return usersCache.get(uid);
            try {
                const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'users', uid));
                const data = snap.exists() ? snap.data() : null;
                usersCache.set(uid, data);
                return data;
            } catch (e) {
                console.error('خطا در خواندن اطلاعات کاربر از Firestore:', e);
                return null;
            }
        }

        // =========================================================
        // STANDARDIZED LOADING / EMPTY / ERROR STATE HELPER
        // برای هر تب یک <div id="...StatusBox"> پیام یکسان و شفاف
        // (شامل کد خطای واقعی Firestore برای دیباگ سریع‌تر) نمایش می‌دهد.
        // =========================================================
        function renderStatusBox(boxId, mode, opts = {}) {
            const box = document.getElementById(boxId);
            if (!box) return;
            if (mode === 'hidden') { box.style.display = 'none'; box.innerHTML = ''; return; }
            box.style.display = 'block';
            if (mode === 'loading') {
                box.style.cssText = 'display:block;background:#f1f5f9;color:var(--text-light);border-radius:10px;padding:14px 18px;font-size:13px;font-weight:700;';
                box.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${opts.text || 'در حال بارگذاری از سرور...'}`;
            } else if (mode === 'empty') {
                box.style.cssText = 'display:block;background:#f8fafc;color:var(--text-light);border-radius:10px;padding:18px;text-align:center;font-size:13px;font-weight:700;border:1.5px dashed var(--border-color);';
                box.innerHTML = `<i class="fas fa-inbox" style="font-size:20px;display:block;margin-bottom:6px;opacity:0.5;"></i> ${opts.text || 'داده‌ای برای نمایش وجود ندارد.'}`;
            } else if (mode === 'error') {
                const code = (opts.error && opts.error.code) ? opts.error.code : 'unknown-error';
                box.style.cssText = 'display:block;background:#fdecea;color:var(--danger);border-radius:10px;padding:14px 18px;font-size:13px;font-weight:700;';
                box.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${opts.text || 'خطا در ارتباط با سرور.'}
                    <div style="margin-top:6px;font-family:monospace;font-size:11px;font-weight:400;color:#b91c1c;">کد خطا: ${code}</div>`;
            }
        }

        // =========================================================
        // AUDIT LOG — کالکشن "auditLogs" در Firestore
        // هر تغییر مهم (ساخت/ویرایش/حذف محصول، کوپن، تغییر وضعیت سفارش)
        // با شناسه‌ی مدیر، زمان، و شرح کوتاه ثبت می‌شود.
        // =========================================================
        async function writeAuditLog(action, entityType, description) {
            try {
                await window.fbAddDoc(window.fbCollection(window.fbDb, 'auditLogs'), {
                    action,            // 'create' | 'update' | 'delete'
                    entityType,        // 'product' | 'coupon' | 'order' | 'slide' | 'spotlight'
                    description,
                    adminEmail: (window.fbAuth && window.fbAuth.currentUser) ? window.fbAuth.currentUser.email : 'admin',
                    adminUid: adminUid || null,
                    createdAt: new Date().toISOString()
                });
            } catch (e) {
                // ثبت لاگ هرگز نباید مانع عملیات اصلی شود؛ فقط در کنسول ثبت می‌شود
                console.error('خطا در ثبت گزارش فعالیت:', e);
            }
        }

        const AUDIT_ICON_MAP = {
            create: { icon: 'fa-plus', cls: 'act-create' },
            update: { icon: 'fa-pen', cls: '' },
            delete: { icon: 'fa-trash', cls: 'act-delete' }
        };
        const AUDIT_ENTITY_LABEL = {
            product: 'محصول', coupon: 'کد تخفیف', order: 'سفارش', slide: 'اسلاید', spotlight: 'ویترین ویژه'
        };

        async function loadAuditLog() {
            const badge = document.getElementById('auditLoadingBadge');
            const list = document.getElementById('auditLogList');
            if (badge) badge.style.display = 'inline';
            renderStatusBox('auditStatusBox', 'loading', { text: 'در حال دریافت گزارش فعالیت‌ها...' });
            try {
                const q = window.fbQuery(window.fbCollection(window.fbDb, 'auditLogs'), window.fbOrderBy('createdAt', 'desc'), window.fbLimit(80));
                const snap = await window.fbGetDocs(q);
                const logs = [];
                snap.forEach(d => logs.push(d.data()));
                if (logs.length === 0) {
                    renderStatusBox('auditStatusBox', 'empty', { text: 'هنوز هیچ فعالیتی ثبت نشده است.' });
                    list.innerHTML = '';
                } else {
                    renderStatusBox('auditStatusBox', 'hidden');
                    list.innerHTML = logs.map(l => {
                        const meta = AUDIT_ICON_MAP[l.action] || AUDIT_ICON_MAP.update;
                        const dt = l.createdAt ? new Date(l.createdAt) : null;
                        const dateTxt = dt ? `${dt.toLocaleDateString('fa-IR')} - ${dt.toLocaleTimeString('fa-IR')}` : '--';
                        return `<div class="audit-item">
                            <div class="audit-icon ${meta.cls}"><i class="fas ${meta.icon}"></i></div>
                            <div>
                                <div class="audit-text">${esc(l.description) || esc(AUDIT_ENTITY_LABEL[l.entityType] || l.entityType)}</div>
                                <div class="audit-meta"><i class="fas fa-user-shield"></i> ${esc(l.adminEmail) || 'admin'} &nbsp;•&nbsp; ${dateTxt}</div>
                            </div>
                        </div>`;
                    }).join('');
                }
            } catch (e) {
                console.error('خطا در خواندن گزارش فعالیت‌ها:', e);
                renderStatusBox('auditStatusBox', 'error', { text: 'خطا در دریافت گزارش فعالیت‌ها.', error: e });
                list.innerHTML = '';
            } finally {
                if (badge) badge.style.display = 'none';
            }
        }

        // =========================================================
        // DASHBOARD CHARTS (Chart.js) — روند فروش ۱۴ روز اخیر + وضعیت سفارشات
        // یک کوئری سبک و جداگانه (سقف ۵۰۰ سفارش اخیر) صرفاً برای این
        // نمودارها گرفته می‌شود؛ این مستقل از pagination جدول سفارشات است.
        // =========================================================
        let revenueChartInstance = null;
        let statusChartInstance = null;

        async function fetchOrdersForDashboard() {
            try {
                const q = window.fbQuery(window.fbCollection(window.fbDb, 'orders'), window.fbOrderBy('createdAt', 'desc'), window.fbLimit(500));
                const snap = await window.fbGetDocs(q);
                const list = [];
                snap.forEach(d => list.push(d.data()));
                return list;
            } catch (e) {
                console.error('خطا در دریافت داده‌ی نمودارها:', e);
                return [];
            }
        }

        async function renderDashboardCharts() {
            const badge = document.getElementById('chartsLoadingBadge');
            if (badge) badge.style.display = 'inline';
            const orders = await fetchOrdersForDashboard();
            if (badge) badge.style.display = 'none';

            // ---- نمودار روند فروش ۱۴ روز اخیر (فقط سفارشات پرداخت‌شده/تحویل‌شده) ----
            const days = [];
            const revenueByDay = {};
            const countByDay = {};
            for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toLocaleDateString('en-CA'); // YYYY-MM-DD ثابت برای کلید
                days.push(key);
                revenueByDay[key] = 0;
                countByDay[key] = 0;
            }
            orders.forEach(o => {
                if (!o.createdAt || o.status === 'failed_payment' || o.status === 'pending_payment') return;
                const key = new Date(o.createdAt).toLocaleDateString('en-CA');
                if (revenueByDay[key] !== undefined) {
                    revenueByDay[key] += (parseInt(o.totalAmount) || 0);
                    countByDay[key] += 1;
                }
            });
            const dayLabels = days.map(k => new Date(k).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }));
            const revenueData = days.map(k => revenueByDay[k]);
            const countData = days.map(k => countByDay[k]);

            const revenueCanvas = document.getElementById('revenueChart');
            if (revenueCanvas && window.Chart) {
                if (revenueChartInstance) revenueChartInstance.destroy();
                revenueChartInstance = new Chart(revenueCanvas, {
                    type: 'bar',
                    data: {
                        labels: dayLabels,
                        datasets: [
                            {
                                type: 'line', label: 'تعداد سفارش', data: countData, yAxisID: 'y1',
                                borderColor: '#0984e3', backgroundColor: '#0984e3', tension: 0.35, pointRadius: 3
                            },
                            {
                                type: 'bar', label: 'فروش (تومان)', data: revenueData, yAxisID: 'y',
                                backgroundColor: 'rgba(99,102,241,0.55)', borderRadius: 6, maxBarThickness: 26
                            }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { title: { display: true, text: 'روند فروش و سفارشات (۱۴ روز اخیر)', font: { family: 'Vazirmatn', size: 13 } }, legend: { labels: { font: { family: 'Vazirmatn' } } } },
                        scales: {
                            y: { position: 'left', ticks: { font: { family: 'Vazirmatn' }, callback: v => v.toLocaleString('fa-IR') } },
                            y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { family: 'Vazirmatn' }, precision: 0 } },
                            x: { ticks: { font: { family: 'Vazirmatn' } } }
                        }
                    }
                });
            }

            // ---- نمودار دایره‌ای توزیع وضعیت سفارشات ----
            const statusCounts = { pending_payment: 0, paid: 0, processing: 0, shipped: 0, delivered: 0, failed_payment: 0 };
            orders.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });
            const statusLabelsFa = { pending_payment: 'در انتظار پرداخت', paid: 'پرداخت‌شده', processing: 'پردازش انبار', shipped: 'ارسال‌شده', delivered: 'تحویل‌شده', failed_payment: 'ناموفق' };
            const statusColors = { pending_payment: '#fdcb6e', paid: '#0984e3', processing: '#f59e0b', shipped: '#00b894', delivered: '#6c5ce7', failed_payment: '#d63031' };

            const statusCanvas = document.getElementById('statusChart');
            if (statusCanvas && window.Chart) {
                if (statusChartInstance) statusChartInstance.destroy();
                const keys = Object.keys(statusCounts).filter(k => statusCounts[k] > 0);
                statusChartInstance = new Chart(statusCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: keys.map(k => statusLabelsFa[k]),
                        datasets: [{ data: keys.map(k => statusCounts[k]), backgroundColor: keys.map(k => statusColors[k]) }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { title: { display: true, text: 'توزیع وضعیت سفارشات', font: { family: 'Vazirmatn', size: 13 } }, legend: { position: 'bottom', labels: { font: { family: 'Vazirmatn' } } } }
                    }
                });
            }
        }

        // =========================================================
        // ORDERS — Pagination واقعی Firestore (limit + startAfter)
        // =========================================================
        const ORDERS_PAGE_SIZE = 15;
        let ordersPageCursors = [null]; // cursors[0] = null (صفحه‌ی اول)؛ cursors[i] = آخرین سند صفحه‌ی i-1
        let ordersCurrentPageIndex = 0;
        let ordersHasNextPage = false;

        function resetOrdersPagination() {
            ordersPageCursors = [null];
            ordersCurrentPageIndex = 0;
            ordersHasNextPage = false;
        }

        async function loadOrdersFromFirestore(direction = 'first') {
            const badge = document.getElementById('ordersLoadingBadge');
            if (badge) badge.style.display = 'inline';
            renderStatusBox('ordersStatusBox', 'loading', { text: 'در حال دریافت سفارشات از سرور...' });

            if (direction === 'first') resetOrdersPagination();
            else if (direction === 'next') ordersCurrentPageIndex++;
            else if (direction === 'prev') ordersCurrentPageIndex = Math.max(0, ordersCurrentPageIndex - 1);

            try {
                const cursor = ordersPageCursors[ordersCurrentPageIndex];
                const clauses = [window.fbCollection(window.fbDb, 'orders'), window.fbOrderBy('createdAt', 'desc')];
                let q;
                if (cursor) {
                    q = window.fbQuery(window.fbCollection(window.fbDb, 'orders'), window.fbOrderBy('createdAt', 'desc'), window.fbStartAfter(cursor), window.fbLimit(ORDERS_PAGE_SIZE + 1));
                } else {
                    q = window.fbQuery(window.fbCollection(window.fbDb, 'orders'), window.fbOrderBy('createdAt', 'desc'), window.fbLimit(ORDERS_PAGE_SIZE + 1));
                }
                const snap = await window.fbGetDocs(q);
                const docsArr = [];
                snap.forEach(docSnap => docsArr.push(docSnap));

                ordersHasNextPage = docsArr.length > ORDERS_PAGE_SIZE;
                const pageDocs = docsArr.slice(0, ORDERS_PAGE_SIZE);
                cachedOrders = pageDocs.map(docSnap => ({ ...docSnap.data(), _docId: docSnap.id }));

                if (pageDocs.length > 0) {
                    ordersPageCursors[ordersCurrentPageIndex + 1] = pageDocs[pageDocs.length - 1];
                }

                renderStatusBox('ordersStatusBox', cachedOrders.length === 0 ? 'empty' : 'hidden', { text: 'سفارشی برای نمایش در این صفحه وجود ندارد.' });
                updateOrdersPaginationUI();
            } catch (e) {
                console.error('خطا در خواندن سفارشات از Firestore — کد:', e && e.code, e);
                renderStatusBox('ordersStatusBox', 'error', { text: 'خطا در دریافت سفارشات از سرور.', error: e });
                cachedOrders = [];
            } finally {
                if (badge) badge.style.display = 'none';
            }
        }

        function updateOrdersPaginationUI() {
            const prevBtn = document.getElementById('ordersPrevBtn');
            const nextBtn = document.getElementById('ordersNextBtn');
            const label = document.getElementById('ordersPageLabel');
            if (prevBtn) prevBtn.disabled = ordersCurrentPageIndex === 0;
            if (nextBtn) nextBtn.disabled = !ordersHasNextPage;
            if (label) label.innerText = `صفحه ${(ordersCurrentPageIndex + 1).toLocaleString('fa-IR')}`;
        }

        async function goToOrdersPage(direction) {
            if (direction === 'next' && !ordersHasNextPage) return;
            if (direction === 'prev' && ordersCurrentPageIndex === 0) return;
            await loadOrdersFromFirestore(direction);
            renderOrders(true); // true = فقط رندر مجدد بدون بارگذاری دوباره از سرور
        }

        // =========================================================
        // SECURITY: HTML ESCAPING (قبلاً در admin.html اصلاً وجود نداشت!)
        // -------------------------------------------------------
        // نام/برند/توضیح محصول، عنوان کوپن، عنوان اسلاید/ویترین ویژه و
        // شرح رویداد در Audit Log همگی از ورودی ادمین می‌آیند و مستقیماً
        // با innerHTML رندر می‌شدند — یعنی اگر نام یک محصول حاوی
        // "<img src=x onerror=...>" باشد، هنگام نمایش در جدول محصولات،
        // مودال سفارش، جدول کوپن‌ها یا لاگ فعالیت‌ها اجرا می‌شد (Stored
        // XSS). از این پس هر مقدار داینامیک پیش از innerHTML باید از
        // esc() عبور کند. escAttr() برای زمانی است که مقدار داخل یک
        // آرگومان تک‌کوتیشن onclick قرار می‌گیرد.
        // =========================================================
        function esc(str) {
            return String(str ?? '').replace(/[&<>"']/g, ch => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[ch]));
        }
        function escAttr(str) {
            return esc(str).replace(/'/g, '&#39;');
        }

        // ===== تصویر جایگزین ثابت وقتی هیچ عکس اصلی‌ای وارد نشده باشد =====
        const NO_IMAGE_URL = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkvallQ5ZGN8H0RHyH6fe91ycZ2NbnLPmx9x-2_NqnBQ&s=10';

        // ===== ۱۰ رنگ پرطرفدار برای انتخاب سریع =====
        const PRESET_COLORS = [
            { name: 'مشکی', code: '#000000' },
            { name: 'سفید', code: '#ffffff' },
            { name: 'قرمز', code: '#e74c3c' },
            { name: 'آبی', code: '#2563eb' },
            { name: 'سبز', code: '#16a34a' },
            { name: 'زرد', code: '#facc15' },
            { name: 'صورتی', code: '#ec4899' },
            { name: 'بنفش', code: '#9333ea' },
            { name: 'نارنجی', code: '#f97316' },
            { name: 'طوسی', code: '#6b7280' }
        ];

        // ===== State =====
        let selectedBreadcrumb = "";
        let currentCategoryPath = [];
        let currentColors = [];
        let currentSpecs = {};
        let isEditingMode = false;
        let currentViewOrderId = null;
        let adminUid = null;
        let cachedProducts = []; // آخرین نسخه‌ی محصولات خوانده‌شده از Firestore، شامل _docId داخلی برای CRUD
        const catSelects = []; // 5 عدد select سلسله‌مراتب دسته‌بندی

        // ===== Category Data (۱۰ دسته اصلی، تا ۵ سطح سلسله‌مراتبی) =====
        // ⚠️ فاز ۱ مهاجرت: این آبجکت دیگر «منبع حقیقت» نیست، فقط seed اولیه است.
        // منبع واقعی از این پس سند settings/categoryTree در Firestore است تا
        // admin.html و بقیه‌ی صفحات (در آینده) از یک داده‌ی واحد بخوانند.
        const DEFAULT_CATEGORY_DATA = {
            "کالای دیجیتال": {
                "موبایل": {
                    "اپل": {
                        "آیفون": ["آیفون ۱۵ پرو", "آیفون ۱۴", "آیفون ۱۳"]
                    },
                    "سامسونگ": {
                        "گلکسی S": ["گلکسی S24 اولترا", "گلکسی S23"]
                    },
                    "شیائومی": ["شیائومی 13T", "ردمی نوت 12"],
                    "گوگل": ["پیکسل 8", "پیکسل 7"],
                    "ناتینگ": ["Nothing Phone 2"]
                },
                "لپ‌تاپ": ["ایسوس", "لنوو", "اپل مک‌بوک", "قطعات کامپیوتر"],
                "هدفون و ساعت هوشمند": ["اپل واچ", "ایرپاد", "ساعت سامسونگ", "اسپیکر"],
                "لوازم جانبی": ["قاب", "گلس", "شارژر"]
            },
            "مد و پوشاک": {
                "مردانه": ["شلوار مردانه", "کفش مردانه", "پافر مردانه", "کلاه"],
                "زنانه": ["شلوار زنانه", "کفش زنانه", "پافر زنانه", "کاپشن زنانه"],
                "بچگانه": ["نوزادی", "پوشاک پسرانه", "پوشاک دخترانه"]
            },
            "خانه و آشپزخانه": {
                "لوازم برقی": ["یخچال", "تلویزیون", "ماشین لباسشویی", "ماشین ظرفشویی"],
                "دکوراسیون": ["فرش", "مبلمان", "لوستر", "مجسمه"],
                "پذیرایی": ["سرویس غذاخوری", "قاشق و چنگال"]
            },
            "آرایشی و بهداشتی": {
                "آرایشی": ["لوازم آرایش چشم", "آرایش لب", "لاک ناخن"],
                "بهداشتی": ["مراقبت پوست", "شامپو و مو", "ضد آفتاب"],
                "عطر و ادکلن": ["مردانه", "زنانه", "اسپری"]
            },
            "ورزش و سفر": {
                "پوشاک ورزشی": ["کفش ورزشی", "شلوار ورزشی", "لباس ورزشی"],
                "لوازم سفر": ["چمدان", "کوله پشتی"],
                "تجهیزات باشگاهی": ["دمبل", "تردمیل"]
            },
            "کودک و اسباب‌بازی": {
                "اسباب‌بازی": ["ماشین اسباب‌بازی", "عروسک", "لگو"],
                "لوازم نوزاد": ["کالسکه", "شیشه شیر", "پوشک"]
            },
            "کتاب و لوازم تحریر": {
                "کتاب": ["رمان", "کتاب کودک", "کتاب آموزشی"],
                "لوازم تحریر": ["خودکار", "دفتر", "مداد رنگی"]
            },
            "خودرو و موتورسیکلت": {
                "لوازم یدکی خودرو": ["روغن موتور", "لاستیک", "باتری خودرو"],
                "لوازم جانبی خودرو": ["ضبط خودرو", "سیستم صوتی", "آینه بغل"]
            },
            "ابزار و تجهیزات": {
                "ابزار برقی": ["دریل", "فرز", "اره برقی"],
                "ابزار دستی": ["آچار", "پیچ‌گوشتی", "متر"]
            },
            "سوپرمارکت": {
                "خوار و بار": ["برنج", "روغن", "حبوبات"],
                "نوشیدنی": ["آب معدنی", "نوشابه", "آبمیوه"],
                "لبنیات": ["شیر", "پنیر", "ماست"]
            }
        };

        // مقدار فعلی درخت دسته‌بندی که واقعاً در فرم/کد استفاده می‌شود.
        // در initAdminAppOnce() از Firestore بازخوانی و جایگزین می‌شود.
        let CATEGORY_DATA = DEFAULT_CATEGORY_DATA;

        // =========================================================
        // CATEGORY TREE — منبع واحد در Firestore (settings/categoryTree)
        // =========================================================
        async function loadCategoryTree() {
            try {
                const ref = window.fbDoc(window.fbDb, 'settings', 'categoryTree');
                const snap = await window.fbGetDoc(ref);
                if (snap.exists() && snap.data() && snap.data().tree) {
                    CATEGORY_DATA = snap.data().tree;
                } else {
                    // اولین اجرا: درخت پیش‌فرض به‌عنوان seed در Firestore ذخیره می‌شود
                    // تا از این پس همین صفحه هم فقط از آن بخواند.
                    await window.fbSetDoc(ref, { tree: DEFAULT_CATEGORY_DATA, updatedAt: new Date().toISOString() });
                    CATEGORY_DATA = DEFAULT_CATEGORY_DATA;
                }
            } catch (e) {
                console.error('خطا در خواندن درخت دسته‌بندی از Firestore:', e);
                showToast('خطا در دریافت دسته‌بندی از سرور؛ از نسخه‌ی پیش‌فرض استفاده می‌شود ⚠️');
                CATEGORY_DATA = DEFAULT_CATEGORY_DATA;
            }
        }

        // =========================================================
        // AUTH GATE LOGIC
        // =========================================================
        function showAuthChecking(show) {
            document.getElementById('authCheckingScreen').style.display = show ? 'flex' : 'none';
        }
        function showAuthGate(show, errorMsg) {
            const overlay = document.getElementById('authGateOverlay');
            overlay.style.display = show ? 'flex' : 'none';
            const errBox = document.getElementById('authGateError');
            if (errorMsg) {
                errBox.innerText = errorMsg;
                errBox.classList.add('show');
            } else {
                errBox.classList.remove('show');
            }
        }
        function showAdminApp(show, email) {
            const root = document.getElementById('adminAppRoot');
            if (show) {
                root.classList.add('ready');
                document.getElementById('adminEmailLabel').innerText = email || '--';
                initAdminAppOnce();
            } else {
                root.classList.remove('ready');
            }
        }

        let adminAppInitialized = false;
        async function initAdminAppOnce() {
            if (adminAppInitialized) return;
            adminAppInitialized = true;
            checkConfigWarnings();
            await loadCategoryTree();
            initCategories();
            initGalleryLinks();
            populateBulkCategorySelect();
            loadProductsFromFirestore();
            renderSlides();
            renderSpotlightAdminList();
            populateCouponScopeCategories();
            renderCurrentTimerSettings();
            loadOrdersFromFirestore().then(() => {
                document.getElementById('stat-orders').innerText = cachedOrders.length;
            });
            renderDashboardCharts();
            document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
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

        async function saveSpotlightCards(cards) {
            try {
                await window.fbSetDoc(window.fbDoc(window.fbDb, 'settings', 'spotlightCards'), { cards, updatedAt: new Date().toISOString() });
                return true;
            } catch (e) {
                console.error('خطا در ذخیره ویترین ویژه در Firestore:', e);
                showToast('خطا در ذخیره ویترین ویژه ❌');
                return false;
            }
        }

        async function addSpotlightCard() {
            const title = document.getElementById('sp-title').value.trim();
            const price = document.getElementById('sp-price').value.trim();
            const link = document.getElementById('sp-link').value.trim();
            let imageUrl = '';

            if (!document.getElementById('spotlight-file-container').classList.contains('hidden')) {
                const fileInput = document.getElementById('sp-image-file');
                if (fileInput.files[0]) imageUrl = await uploadImageToImgbb(fileInput.files[0]);
                else { showToast('فایل عکس انتخاب نشده است ❌'); return; }
            } else {
                const linkInput = document.getElementById('sp-image-link');
                if (linkInput.value) imageUrl = linkInput.value;
                else { showToast('لینک عکس وارد نشده است ❌'); return; }
            }
            if (!title) { showToast('عنوان را وارد کنید ⚠️'); return; }

            let cards = await loadSpotlightCards();
            if (cards.length >= 4) { showToast('حداکثر ۴ کارت مجاز است؛ یکی را حذف کنید ⚠️'); return; }
            cards.push({ image: imageUrl, title, price, link });

            if (await saveSpotlightCards(cards)) {
                document.getElementById('sp-title').value = '';
                document.getElementById('sp-price').value = '';
                document.getElementById('sp-link').value = '';
                document.getElementById('sp-image-file').value = '';
                document.getElementById('sp-image-link').value = '';
                showToast('به ویترین ویژه اضافه شد ✅');
                renderSpotlightAdminList();
            }
        }

        async function renderSpotlightAdminList() {
            const container = document.getElementById('spotlightAdminList');
            const cards = await loadSpotlightCards();
            if (cards.length === 0) {
                container.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:30px;">هنوز کارتی اضافه نشده است.</p>';
                return;
            }
            container.innerHTML = cards.map((c, index) => `
                <div class="slide-item">
                    <img src="${esc(c.image)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='${NO_IMAGE_URL}'" alt="${esc(c.title) || ''}">
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
                        <div><strong style="font-size:14px;">${esc(c.title) || 'بدون عنوان'}</strong><br><small style="opacity:0.75;font-size:11px;">${esc(c.price) || ''}</small></div>
                        <button onclick="deleteSpotlightCard(${index})" style="background:var(--danger);color:white;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;"><i class="fas fa-trash"></i> حذف</button>
                    </div>
                </div>`).join('');
        }

        // =========================================================
// COUPONS — Firestore CRUD (کالکشن "coupons")
// =========================================================
let cachedCoupons = [];
let isCouponEditingMode = false;

function onCouponScopeChange() {
    const scope = document.getElementById('cp-scope').value;
    document.getElementById('cp-scope-cat-wrap').style.display = scope === 'category' ? 'block' : 'none';
}

document.getElementById('cp-audience').addEventListener('change', function () {
    document.getElementById('cp-audience-days-wrap').style.display = this.value === 'all' ? 'none' : 'block';
});

function populateCouponScopeCategories() {
    const sel = document.getElementById('cp-scope-category');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">انتخاب کنید</option>' + Object.keys(CATEGORY_DATA).map(c => `<option value="${c}">${c}</option>`).join('');
    if (Object.keys(CATEGORY_DATA).includes(current)) sel.value = current;
}

async function loadCouponsFromFirestore() {
    renderStatusBox('couponsStatusBox', 'loading', { text: 'در حال دریافت کدهای تخفیف از سرور...' });
    try {
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'coupons'), window.fbOrderBy('order', 'asc'));
        const snap = await window.fbGetDocs(q);
        cachedCoupons = [];
        snap.forEach(d => cachedCoupons.push({ ...d.data(), _docId: d.id }));
        renderStatusBox('couponsStatusBox', cachedCoupons.length === 0 ? 'empty' : 'hidden', { text: 'هنوز کد تخفیفی ثبت نشده است.' });
    } catch (e) {
        console.error('خطا در خواندن کدهای تخفیف از Firestore:', e);
        renderStatusBox('couponsStatusBox', 'error', { text: 'خطا در دریافت کدهای تخفیف.', error: e });
        cachedCoupons = [];
    }
    renderCouponsTable();
}

function renderCouponsTable() {
    const tbody = document.getElementById('couponsTableBody');
    if (cachedCoupons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-light);">هنوز کد تخفیفی ثبت نشده است.</td></tr>';
        return;
    }
    const audienceLabels = { all: 'همه کاربران', newUsers: 'کاربران تازه‌عضو', oldUsers: 'کاربران قدیمی' };
    tbody.innerHTML = cachedCoupons.map(c => {
        const valTxt = c.discountType === 'percent' ? `${c.discountValue}٪` : `${Number(c.discountValue).toLocaleString('fa-IR')} تومان`;
        const minTxt = c.minAmount > 0 ? `حداقل ${Number(c.minAmount).toLocaleString('fa-IR')} ت` : 'بدون حداقل';
        const scopeTxt = c.scope === 'category' ? `دسته: ${esc(c.scopeCategory) || '—'}` : 'همه کالاها';
        const dateTxt = (c.startDate || c.endDate) ? `${esc(c.startDate) || '—'} تا ${esc(c.endDate) || '—'}` : 'بدون محدودیت زمانی';
        const statusBadge = c.active ? '<span class="status-badge status-shipped">فعال</span>' : '<span class="status-badge status-inactive">غیرفعال</span>';
        return `<tr>
            <td>${c.order ?? 0}</td>
            <td style="font-weight:800;">${esc(c.code)}</td>
            <td style="font-size:12px;">${valTxt}<br><small style="color:var(--text-light);">${minTxt}</small></td>
            <td style="font-size:12px;">${esc(audienceLabels[c.audience] || c.audience)}<br><small style="color:var(--text-light);">${scopeTxt}</small></td>
            <td style="font-size:11px;">${dateTxt}</td>
            <td>${statusBadge}</td>
            <td>
                <button onclick="editCoupon('${c._docId}')" class="action-btn edit-btn" title="ویرایش"><i class="fas fa-pen"></i></button>
                <button onclick="deleteCoupon('${c._docId}')" class="action-btn delete-btn" title="حذف"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>`;
    }).join('');
}

document.getElementById('couponForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const code = document.getElementById('cp-code').value.trim().toUpperCase();
    if (!code) { showToast('کد تخفیف را وارد کنید ⚠️'); return; }

    const scope = document.getElementById('cp-scope').value;
    if (scope === 'category' && !document.getElementById('cp-scope-category').value) {
        showToast('لطفاً دسته‌بندی مجاز را انتخاب کنید ⚠️'); return;
    }

    const submitBtn = document.getElementById('couponSubmitBtn');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;

    try {
        const editingDocId = document.getElementById('cp-docid').value;
        const existing = isCouponEditingMode ? cachedCoupons.find(c => c._docId === editingDocId) : null;

        let iconUrl = '';
        if (!document.getElementById('coupon-file-container').classList.contains('hidden')) {
            const fileInput = document.getElementById('cp-icon-file');
            if (fileInput.files[0]) {
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال آپلود آیکون...';
                iconUrl = await uploadImageToImgbb(fileInput.files[0]);
            } else {
                iconUrl = (existing && existing.icon) ? existing.icon : NO_IMAGE_URL;
            }
        } else {
            const linkVal = document.getElementById('cp-icon-link').value;
            iconUrl = linkVal || (existing && existing.icon ? existing.icon : NO_IMAGE_URL);
        }

        const audience = document.getElementById('cp-audience').value;

        const couponData = {
            code,
            title: document.getElementById('cp-title').value.trim(),
            icon: iconUrl,
            discountType: document.getElementById('cp-discount-type').value,
            discountValue: parseFloat(document.getElementById('cp-discount-value').value) || 0,
            valueLabel: document.getElementById('cp-value-label').value.trim(),
            minAmount: parseFloat(document.getElementById('cp-min-amount').value) || 0,
            maxDiscount: document.getElementById('cp-max-discount').value ? parseFloat(document.getElementById('cp-max-discount').value) : null,
            usageLimit: document.getElementById('cp-usage-limit').value ? parseInt(document.getElementById('cp-usage-limit').value) : null,
            usedCount: existing ? (existing.usedCount || 0) : 0,
            order: parseInt(document.getElementById('cp-order').value) || 0,
            startDate: document.getElementById('cp-start-date').value || null,
            endDate: document.getElementById('cp-end-date').value || null,
            audience,
            audienceDays: audience !== 'all' ? (parseInt(document.getElementById('cp-audience-days').value) || (audience === 'newUsers' ? 30 : 365)) : null,
            scope,
            scopeCategory: scope === 'category' ? document.getElementById('cp-scope-category').value : null,
            active: document.getElementById('cp-active').checked,
            updatedAt: new Date().toISOString()
        };

        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ذخیره...';

        if (isCouponEditingMode && editingDocId) {
            await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'coupons', editingDocId), couponData);
            showToast('کد تخفیف بروزرسانی شد ✨');
            writeAuditLog('update', 'coupon', `کد تخفیف «${code}» ویرایش شد`);
        } else {
            couponData.createdAt = new Date().toISOString();
            await window.fbAddDoc(window.fbCollection(window.fbDb, 'coupons'), couponData);
            showToast('کد تخفیف ثبت شد ✨');
            writeAuditLog('create', 'coupon', `کد تخفیف «${code}» ایجاد شد`);
        }

        resetCouponForm();
        await loadCouponsFromFirestore();
    } catch (err) {
        console.error('خطا در ذخیره کد تخفیف در Firestore:', err);
        showToast('خطا در ارتباط با سرور ❌');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
    }
});

    function editCoupon(docId) {
        const c = cachedCoupons.find(x => x._docId === docId);
        if (!c) return;

        document.getElementById('cp-docid').value = c._docId;
        document.getElementById('cp-code').value = c.code || '';
        document.getElementById('cp-title').value = c.title || '';
        document.getElementById('cp-discount-type').value = c.discountType || 'percent';
        document.getElementById('cp-discount-value').value = c.discountValue || 0;
        document.getElementById('cp-value-label').value = c.valueLabel || '';
        document.getElementById('cp-min-amount').value = c.minAmount || 0;
        document.getElementById('cp-max-discount').value = c.maxDiscount ?? '';
        document.getElementById('cp-usage-limit').value = c.usageLimit ?? '';
        document.getElementById('cp-order').value = c.order || 0;
        document.getElementById('cp-start-date').value = c.startDate || '';
        document.getElementById('cp-end-date').value = c.endDate || '';
        document.getElementById('cp-audience').value = c.audience || 'all';
        document.getElementById('cp-audience-days').value = c.audienceDays || '';
        document.getElementById('cp-audience-days-wrap').style.display = (c.audience && c.audience !== 'all') ? 'block' : 'none';
        document.getElementById('cp-scope').value = c.scope || 'all';
        populateCouponScopeCategories();
        document.getElementById('cp-scope-category').value = c.scopeCategory || '';
        onCouponScopeChange();
        document.getElementById('cp-active').checked = c.active !== false;

        document.getElementById('coupon-file-container').classList.add('hidden');
        document.getElementById('coupon-link-container').classList.remove('hidden');
        const btns = document.querySelector('#coupon-link-container').closest('.form-group').querySelectorAll('.type-btn');
        if (btns.length >= 2) { btns[0].classList.remove('active'); btns[1].classList.add('active'); }
        document.getElementById('cp-icon-link').value = c.icon || '';

        isCouponEditingMode = true;
        document.getElementById('couponFormTitle').innerText = 'ویرایش کد تخفیف';
        document.getElementById('couponSubmitBtn').innerHTML = '<i class="fas fa-sync"></i> بروزرسانی کد تخفیف';
        document.getElementById('couponCancelEditBtn').style.display = 'block';

        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('حالت ویرایش فعال شد 📝');
    }

    function resetCouponForm() {
        document.getElementById('couponForm').reset();
        document.getElementById('cp-docid').value = '';
        isCouponEditingMode = false;
        document.getElementById('couponFormTitle').innerText = 'تعریف / ویرایش کد تخفیف';
        document.getElementById('couponSubmitBtn').innerHTML = '<i class="fas fa-cloud-upload-alt"></i> ذخیره کد تخفیف';
        document.getElementById('couponCancelEditBtn').style.display = 'none';
        document.getElementById('cp-audience-days-wrap').style.display = 'none';
        document.getElementById('cp-scope-cat-wrap').style.display = 'none';
        document.getElementById('cp-active').checked = true;
        document.getElementById('coupon-file-container').classList.remove('hidden');
        document.getElementById('coupon-link-container').classList.add('hidden');
    }

    async function deleteCoupon(docId) {
        const target = cachedCoupons.find(c => c._docId === docId);
        if (!confirm(`آیا از حذف کد تخفیف «${target ? target.code : docId}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.`)) return;
        try {
            await window.fbDeleteDoc(window.fbDoc(window.fbDb, 'coupons', docId));
            showToast('کد تخفیف حذف شد 🗑️');
            writeAuditLog('delete', 'coupon', `کد تخفیف «${target ? target.code : docId}» حذف شد`);
            await loadCouponsFromFirestore();
        } catch (err) {
            console.error('خطا در حذف کد تخفیف:', err);
            showToast('خطا در حذف کد تخفیف ❌');
        }
    }

        async function deleteSpotlightCard(index) {
            if (!confirm('حذف این کارت؟')) return;
            let cards = await loadSpotlightCards();
            cards.splice(index, 1);
            if (await saveSpotlightCards(cards)) { showToast('کارت حذف شد'); renderSpotlightAdminList(); }
        }

        async function checkIsAdmin(uid) {
            try {
                const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'admins', uid));
                return snap.exists();
            } catch (e) {
                console.error('خطا در بررسی دسترسی ادمین:', e);
                return false;
            }
        }

        function initAuthGate() {
            if (!window.fbAuth || !window.fbOnAuthStateChanged) return;

            window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
                showAuthChecking(true);
                if (!user) {
                    adminUid = null;
                    showAuthChecking(false);
                    showAdminApp(false);
                    showAuthGate(true);
                    return;
                }

                const isAdmin = await checkIsAdmin(user.uid);
                showAuthChecking(false);

                if (isAdmin) {
                    adminUid = user.uid;
                    showAuthGate(false);
                    showAdminApp(true, user.email);
                } else {
                    // کاربر لاگین کرده ولی سند admins/{uid} وجود ندارد → دسترسی رد می‌شود
                    adminUid = null;
                    await window.fbSignOut(window.fbAuth);
                    showAdminApp(false);
                    showAuthGate(true, 'این حساب کاربری دسترسی مدیریت ندارد. با مدیر سیستم تماس بگیرید.');
                }
            });
        }

        document.getElementById('authGateForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = document.getElementById('admin-email').value.trim();
            const password = document.getElementById('admin-password').value;
            const btn = document.getElementById('authGateSubmitBtn');

            showAuthGate(true, null);
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ورود...';

            try {
                await window.fbSignInWithEmailAndPassword(window.fbAuth, email, password);
                // ادامه‌ی فرآیند توسط onAuthStateChanged انجام می‌شود
            } catch (err) {
                let msg = 'ورود ناموفق بود. ایمیل یا رمز عبور را بررسی کنید.';
                if (err && err.code === 'auth/invalid-credential') msg = 'ایمیل یا رمز عبور اشتباه است.';
                else if (err && err.code === 'auth/too-many-requests') msg = 'تعداد تلاش‌های ناموفق زیاد است. کمی صبر کنید.';
                showAuthGate(true, msg);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ورود به پنل';
            }
        });

        async function adminLogout() {
            if (!confirm('از پنل مدیریت خارج شوید؟')) return;
            try {
                await window.fbSignOut(window.fbAuth);
            } catch (e) {
                console.error(e);
            }
        }

        // =========================================================
        // RESPONSIVE SIDEBAR (drawer) — موبایل/تبلت
        // =========================================================
        function toggleSidebar(show) {
            const sb = document.getElementById('adminSidebar');
            const ov = document.getElementById('sidebarOverlay');
            if (!sb || !ov) return;
            sb.classList.toggle('open', show);
            ov.classList.toggle('show', show);
        }

        // =========================================================
        // TABS
        // =========================================================
        function showTab(tabName, el) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-menu li').forEach(l => l.classList.remove('active'));
            document.getElementById('tab-' + tabName).classList.add('active');
            el.classList.add('active');
            document.getElementById('tab-title').innerText = el.innerText.trim();
            if (tabName === 'orders') renderOrders();
            else if (tabName === 'reports') renderReports();
            else if (tabName === 'slider') renderCurrentTimerSettings();
            else if (tabName === 'coupons') { populateCouponScopeCategories(); loadCouponsFromFirestore(); }
            else if (tabName === 'audit') loadAuditLog();
            // در موبایل، پس از انتخاب یک تب، کشوی سایدبار خودکار بسته می‌شود
            if (window.innerWidth <= 900) toggleSidebar(false);
        }

        // =========================================================
        // CATEGORY CASCADE (۵ سطح، عمق متغیر بر اساس داده)
        // =========================================================
        function initCategories() {
            for (let i = 1; i <= 5; i++) {
                catSelects.push(document.getElementById('cat-l' + i));
            }
            const l1 = catSelects[0];
            l1.innerHTML = '<option value="">دسته اصلی را انتخاب کنید</option>';
            Object.keys(CATEGORY_DATA).forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.innerText = k;
                l1.appendChild(opt);
            });
            for (let i = 1; i < 5; i++) {
                catSelects[i].innerHTML = '<option value="">ابتدا سطح قبلی را انتخاب کنید...</option>';
                catSelects[i].disabled = true;
            }
        }

        function onCascadeChange(levelIdx) {
            for (let i = levelIdx + 1; i < 5; i++) {
                catSelects[i].innerHTML = '<option value="">ابتدا سطح قبلی را انتخاب کنید...</option>';
                catSelects[i].disabled = true;
            }
            let node = CATEGORY_DATA;
            let valid = true;
            for (let i = 0; i <= levelIdx; i++) {
                const val = catSelects[i].value;
                if (!val) { valid = false; break; }
                node = node[val];
                if (node === undefined) { valid = false; break; }
            }
            if (valid && node && typeof node === 'object') {
                const nextSel = catSelects[levelIdx + 1];
                if (nextSel) {
                    const keys = Array.isArray(node) ? node : Object.keys(node);
                    nextSel.innerHTML = '<option value="">انتخاب کنید...</option>';
                    keys.forEach(k => {
                        const opt = document.createElement('option');
                        opt.value = k;
                        opt.innerText = k;
                        nextSel.appendChild(opt);
                    });
                    nextSel.disabled = false;
                }
            }
            generateBreadcrumb();
        }

        function restoreCategoryPath(path) {
            if (!path || !Array.isArray(path) || path.length === 0) return;
            for (let i = 1; i < 5; i++) {
                catSelects[i].innerHTML = '<option value="">ابتدا سطح قبلی را انتخاب کنید...</option>';
                catSelects[i].disabled = true;
            }
            catSelects[0].value = '';
            for (let i = 0; i < path.length && i < 5; i++) {
                if (!catSelects[i]) break;
                catSelects[i].value = path[i];
                onCascadeChange(i);
            }
            generateBreadcrumb();
        }

        function generateBreadcrumb() {
            const path = [];
            for (let i = 0; i < 5; i++) {
                const v = catSelects[i] ? catSelects[i].value : '';
                if (v) path.push(v); else break;
            }
            selectedBreadcrumb = path.join(' > ');
            currentCategoryPath = path;
            document.getElementById('breadcrumb-display').innerHTML =
                path.length > 0
                    ? `<i class="fas fa-link"></i> مسیر نهایی: <strong>${selectedBreadcrumb}</strong>`
                    : `<i class="fas fa-link"></i> مسیر نهایی: هنوز انتخاب نشده`;
        }

        // =========================================================
        // SPECS
        // =========================================================
        function addSpec() {
            const key = document.getElementById('spec-key').value.trim();
            const value = document.getElementById('spec-value').value.trim();
            if (!key || !value) { showToast('هم نام و هم مقدار مشخصه الزامی است'); return; }
            currentSpecs[key] = value;
            renderSpecsList();
            document.getElementById('spec-key').value = '';
            document.getElementById('spec-value').value = '';
        }

        function removeSpec(key) {
            delete currentSpecs[key];
            renderSpecsList();
        }

        function renderSpecsList() {
            const container = document.getElementById('specsList');
            let html = '';
            for (const [key, value] of Object.entries(currentSpecs)) {
                html += `<div class="spec-item">
                    <span><strong>${key}:</strong> ${value}</span>
                    <button type="button" onclick="removeSpec('${key.replace(/'/g,"\\'")}')"><i class="fas fa-times"></i></button>
                </div>`;
            }
            container.innerHTML = html;
        }

        // =========================================================
        // GALLERY LINKS
        // =========================================================
        function initGalleryLinks() {
            const wrapper = document.getElementById('gallery-links-wrapper');
            wrapper.innerHTML = '';
            for (let i = 1; i <= 7; i++) {
                wrapper.innerHTML += `<input type="url" class="g-link-input" placeholder="لینک عکس ${i} (اختیاری)" style="margin-bottom:8px;">`;
            }
        }

        // =========================================================
        // IMAGE SOURCE TOGGLE
        // =========================================================
        function toggleInputSource(section, type) {
            const prefix = section;
            const fileCont = document.getElementById(`${prefix}-file-container`);
            const linkCont = document.getElementById(`${prefix}-link-container`);
            const btns = fileCont.parentElement.querySelectorAll('.image-input-type-selector .type-btn');
            btns.forEach(b => b.classList.remove('active'));
            if (type === 'file') {
                fileCont.classList.remove('hidden');
                linkCont.classList.add('hidden');
                btns[0].classList.add('active');
            } else {
                fileCont.classList.add('hidden');
                linkCont.classList.remove('hidden');
                btns[1].classList.add('active');
            }
        }

        function toggleGallerySource(type) {
            const fileCont = document.getElementById('gallery-file-container');
            const linkCont = document.getElementById('gallery-link-container');
            const btns = document.querySelectorAll('.gallery-type');
            btns.forEach(b => b.classList.remove('active'));
            if (type === 'file') {
                fileCont.classList.remove('hidden');
                linkCont.classList.add('hidden');
                btns[0].classList.add('active');
            } else {
                fileCont.classList.add('hidden');
                linkCont.classList.remove('hidden');
                btns[1].classList.add('active');
            }
        }

        // FIX امنیتی (فاز ۰ observability plan): کلید ImgBB دیگر هرگز داخل
        // کد کلاینت نیست — قبلاً اینجا plaintext افشا شده بود (قابل مشاهده
        // در View Source توسط هرکسی). آپلود از این پس از طریق یک Vercel
        // Serverless Function امن (api/upload-image.js) انجام می‌شود که
        // کلید را فقط از process.env می‌خواند.
        //
        // چون کلاینت دیگر از وضعیت کلید روی سرور خبر ندارد، بنر هشدار در
        // لحظه‌ی ورود دیگر قطعی نمایش داده نمی‌شود؛ فقط اگر اولین تلاش
        // آپلود واقعی با خطای «پیکربندی‌نشده» مواجه شود ظاهر می‌شود.
        function checkConfigWarnings() {
            const banner = document.getElementById('configWarningBanner');
            if (!banner) return;
            banner.style.display = 'none';
            banner.innerHTML = '';
        }

        function showImgbbConfigBanner() {
            const banner = document.getElementById('configWarningBanner');
            if (!banner) return;
            banner.style.display = 'block';
            banner.innerHTML = `
                <div style="background:#fff8e1;border:1.5px solid #fdcb6e;color:#946200;border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;font-weight:700;display:flex;gap:12px;align-items:flex-start;">
                    <i class="fas fa-triangle-exclamation" style="font-size:18px;margin-top:2px;"></i>
                    <div>
                        آپلود تصویر (فایل) در حال حاضر غیرفعال است چون متغیر محیطی
                        <code>IMGBB_API_KEY</code> در تنظیمات Vercel این پروژه تعریف نشده.
                        یک کلید رایگان از <a href="https://api.imgbb.com/" target="_blank" rel="noopener" style="color:#946200;text-decoration:underline;">api.imgbb.com</a>
                        بگیرید و آن را به‌عنوان Environment Variable در پنل Vercel اضافه کنید.
                        تا آن زمان می‌توانید از گزینه‌ی «لینک مستقیم» برای تصاویر استفاده کنید.
                    </div>
                </div>`;
        }

        // فشرده‌سازی و تغییر اندازه‌ی فایل عکس در سمت مرورگر، خروجی: Blob
        async function resizeImageToBlob(file, maxWidth = 900, quality = 0.8) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width, height = img.height;
                        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                        canvas.width = width;
                        canvas.height = height;
                        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                        canvas.toBlob((blob) => {
                            if (blob) resolve(blob); else reject(new Error('تبدیل تصویر ناموفق بود'));
                        }, 'image/jpeg', quality);
                    };
                    img.onerror = () => reject(new Error('فایل تصویر معتبر نیست'));
                    img.src = e.target.result;
                };
                reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'));
                reader.readAsDataURL(file);
            });
        }

        // تبدیل Blob به رشته‌ی base64 خام (بدون پیشوند data:...) — همان چیزی که ImgBB انتظار دارد
        async function blobToRawBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = () => reject(new Error('تبدیل تصویر به base64 ناموفق بود'));
                reader.readAsDataURL(blob);
            });
        }
                // FIX امنیتی (فاز ۰): آپلود دیگر مستقیماً به api.imgbb.com و با کلید
        // افشاشده در کلاینت انجام نمی‌شود؛ درخواست به Serverless Function
        // امن خودمان (/api/upload-image) می‌رود — دقیقاً هم‌الگو با chat.js
        // که همین کار را برای GEMINI_API_KEY انجام می‌دهد.
        async function uploadImageToImgbb(file) {
            const blob = await resizeImageToBlob(file);
            const base64 = await blobToRawBase64(blob);

            const res = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 })
            });

            let json;
            try {
                json = await res.json();
            } catch (e) {
                throw new Error('پاسخ نامعتبر از سرور آپلود تصویر دریافت شد.');
            }

            if (!res.ok || !json.success) {
                console.error('پاسخ خطای آپلود تصویر:', json);
                if (json && json.code === 'MISSING_CONFIG') {
                    showImgbbConfigBanner();
                }
                throw new Error(json && json.message ? json.message : 'آپلود تصویر ناموفق بود');
            }

            // url = لینک مستقیم و دائمی تصویر برای استفاده در <img src="">
            return json.url;
        }
   
        // =========================================================
        // COLORS
        // =========================================================
        function renderColorList(colors) {
            const container = document.getElementById('colorListContainer');
            container.innerHTML = '';
            colors.forEach((color, index) => {
                const tag = document.createElement('div');
                tag.className = 'color-tag';
                tag.innerHTML = `
                    <div class="color-dot" style="background-color: ${color.code};"></div>
                    <span>${color.name}</span>
                    <i class="fas fa-times remove-color" onclick="removeColor(${index})"></i>
                `;
                container.appendChild(tag);
            });
        }

        function addColor() {
            const nameInput = document.getElementById('newColorName');
            const codeInput = document.getElementById('newColorCode');
            const name = nameInput.value.trim();
            const code = codeInput.value;
            if (!name) { showToast('لطفاً نام رنگ را وارد کنید'); return; }
            if (currentColors.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                showToast('این رنگ قبلاً اضافه شده است!'); return;
            }
            currentColors.push({ name, code });
            renderColorList(currentColors);
            nameInput.value = '';
        }

        function addPresetColor(idx) {
            const preset = PRESET_COLORS[idx];
            if (!preset) return;
            if (currentColors.some(c => c.name.toLowerCase() === preset.name.toLowerCase())) {
                showToast('این رنگ قبلاً اضافه شده است!'); return;
            }
            currentColors.push({ name: preset.name, code: preset.code });
            renderColorList(currentColors);
            showToast(`رنگ «${preset.name}» اضافه شد`);
        }

        function removeColor(index) {
            currentColors.splice(index, 1);
            renderColorList(currentColors);
        }

        // =========================================================
        // AMAZING OFFERS TIMER (تبدیل شمسی به میلادی + ذخیره تنظیمات)
        // =========================================================
        function jalaliToGregorian(jy, jm, jd) {
            jy = parseInt(jy) + 1595;
            let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + parseInt(jd) + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
            let gy = 400 * Math.floor(days / 146097);
            days %= 146097;
            if (days > 36524) {
                gy += 100 * Math.floor(--days / 36524);
                days %= 36524;
                if (days >= 365) days++;
            }
            gy += 4 * Math.floor(days / 1461);
            days %= 1461;
            if (days > 365) {
                gy += Math.floor((days - 1) / 365);
                days = (days - 1) % 365;
            }
            let gd = days + 1;
            const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            let gm;
            for (gm = 0; gm < 13; gm++) {
                const v = sal_a[gm];
                if (gd <= v) break;
                gd -= v;
            }
            return { gy: gy, gm: gm, gd: gd };
        }

        // ===== اعتبارسنجی روز/ماه تقویم شمسی (بدون نیاز به کتابخانه‌ی خارجی) =====
        function isJalaliLeapYear(jy) {
            // الگوریتم متداول تعیین سال کبیسه در تقویم جلالی (چرخه‌ی ۳۳ ساله)
            const remainders = [1, 5, 9, 13, 17, 22, 26, 30];
            return remainders.includes(((jy % 33) + 33) % 33);
        }

        function daysInJalaliMonth(jy, jm) {
            const m = parseInt(jm);
            if (!m || m < 1 || m > 12) return 31;
            if (m <= 6) return 31;
            if (m <= 11) return 30;
            return isJalaliLeapYear(parseInt(jy) || 0) ? 30 : 29;
        }

        // با تغییر سال/ماه/روز، حداکثر روز مجاز همان ماه محاسبه و روز نامعتبر اصلاح می‌شود
        function onTimerDateFieldChange() {
            const hint = document.getElementById('timer-date-hint');
            const parts = [];
            ['start', 'end'].forEach(prefix => {
                const yEl = document.getElementById(`timer-${prefix}-y`);
                const mEl = document.getElementById(`timer-${prefix}-m`);
                const dEl = document.getElementById(`timer-${prefix}-d`);
                if (!yEl || !mEl || !dEl) return;
                const maxDay = daysInJalaliMonth(yEl.value, mEl.value);
                dEl.max = maxDay;
                if (dEl.value && parseInt(dEl.value) > maxDay) dEl.value = maxDay;
                if (dEl.value && parseInt(dEl.value) < 1) dEl.value = 1;
                if (mEl.value) parts.push(`${prefix === 'start' ? 'شروع' : 'پایان'}: حداکثر تا روز ${maxDay.toLocaleString('fa-IR')}`);
            });
            if (hint) hint.innerText = parts.join(' — ');
        }

        async function saveAmazingTimerSettings() {
            const sy = parseInt(document.getElementById('timer-start-y').value);
            const sm = parseInt(document.getElementById('timer-start-m').value);
            const sd = parseInt(document.getElementById('timer-start-d').value);
            const ey = parseInt(document.getElementById('timer-end-y').value);
            const em = parseInt(document.getElementById('timer-end-m').value);
            const ed = parseInt(document.getElementById('timer-end-d').value);

            if (!sy || !sm || !sd || !ey || !em || !ed) {
                showToast('لطفاً همه فیلدهای تاریخ شروع و پایان را کامل کنید ⚠️');
                return;
            }
            if (sm < 1 || sm > 12 || em < 1 || em > 12) {
                showToast('ماه باید بین ۱ تا ۱۲ باشد ⚠️');
                return;
            }
            if (sd < 1 || sd > daysInJalaliMonth(sy, sm)) {
                showToast(`روز شروع برای این ماه معتبر نیست (حداکثر ${daysInJalaliMonth(sy, sm).toLocaleString('fa-IR')} روز) ⚠️`);
                return;
            }
            if (ed < 1 || ed > daysInJalaliMonth(ey, em)) {
                showToast(`روز پایان برای این ماه معتبر نیست (حداکثر ${daysInJalaliMonth(ey, em).toLocaleString('fa-IR')} روز) ⚠️`);
                return;
            }

            const gStart = jalaliToGregorian(sy, sm, sd);
            const gEnd = jalaliToGregorian(ey, em, ed);

            const startDate = new Date(gStart.gy, gStart.gm - 1, gStart.gd, 0, 0, 0, 0);
            const endDate = new Date(gEnd.gy, gEnd.gm - 1, gEnd.gd, 0, 0, 0, 0);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                showToast('تاریخ وارد شده معتبر نیست ❌');
                return;
            }
            if (endDate.getTime() <= startDate.getTime()) {
                showToast('تاریخ پایان باید بعد از تاریخ شروع باشد ⚠️');
                return;
            }

            const settings = {
                startAt: startDate.toISOString(),
                endAt: endDate.toISOString(),
                startJalali: { y: sy, m: sm, d: sd },
                endJalali: { y: ey, m: em, d: ed },
                updatedAt: new Date().toISOString()
            };

            try {
                await window.fbSetDoc(window.fbDoc(window.fbDb, 'settings', 'amazingTimer'), settings);
                showToast('تنظیمات تایمر شگفت‌انگیز با موفقیت روی سرور ذخیره شد ✅');
                renderCurrentTimerSettings();
            } catch (e) {
                console.error('خطا در ذخیره تایمر در Firestore:', e);
                showToast('خطا در ذخیره تنظیمات تایمر روی سرور ❌');
            }
        }

        async function renderCurrentTimerSettings() {
            const box = document.getElementById('currentTimerDisplay');
            if (!box) return;
            box.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال خواندن تنظیمات تایمر از سرور...';
            try {
                const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'settings', 'amazingTimer'));
                if (!snap.exists()) {
                    box.innerHTML = '<i class="fas fa-info-circle"></i> هنوز تایمری تنظیم نشده است.';
                    return;
                }
                const s = snap.data();
                box.innerHTML = `<i class="fas fa-check-circle" style="color:var(--admin-success);"></i>
                    شروع: <strong>${s.startJalali.y}/${s.startJalali.m}/${s.startJalali.d}</strong>
                    &nbsp;—&nbsp; پایان: <strong>${s.endJalali.y}/${s.endJalali.m}/${s.endJalali.d}</strong>`;
                document.getElementById('timer-start-y').value = s.startJalali.y;
                document.getElementById('timer-start-m').value = s.startJalali.m;
                document.getElementById('timer-start-d').value = s.startJalali.d;
                document.getElementById('timer-end-y').value = s.endJalali.y;
                document.getElementById('timer-end-m').value = s.endJalali.m;
                document.getElementById('timer-end-d').value = s.endJalali.d;
            } catch (e) {
                console.error('خطا در خواندن تنظیمات تایمر:', e);
                box.innerHTML = 'خطا در خواندن تنظیمات ذخیره‌شده از سرور.';
            }
        }

        // =========================================================
        // PRODUCTS — FIRESTORE CRUD
        // (کالکشن "products"؛ هر سند یک فیلد عددی id هم دارد
        //  که برای سازگاری با سبد خرید/سفارشات موجود در بقیه‌ی
        //  صفحات همچنان به‌کار می‌رود. docId جدا نگه داشته می‌شود.)
        // =========================================================
        let productsLoadFailed = false;
        async function loadProductsFromFirestore() {
            const badge = document.getElementById('productsLoadingBadge');
            badge.style.display = 'inline';
            renderStatusBox('productsStatusBox', 'loading', { text: 'در حال دریافت محصولات از Firestore...' });
            productsLoadFailed = false;
            try {
                const q = window.fbQuery(window.fbCollection(window.fbDb, 'products'), window.fbOrderBy('id', 'desc'));
                const snap = await window.fbGetDocs(q);
                cachedProducts = [];
                snap.forEach(docSnap => {
                    cachedProducts.push({ ...docSnap.data(), _docId: docSnap.id });
                });
                renderStatusBox('productsStatusBox', 'hidden');
            } catch (e) {
                console.error('خطا در خواندن محصولات از Firestore — کد:', e && e.code, e);
                renderStatusBox('productsStatusBox', 'error', { text: 'خطا در بارگذاری محصولات از سرور.', error: e });
                cachedProducts = [];
                productsLoadFailed = true;
            }
            badge.style.display = 'none';
            renderProducts();
        }

        document.getElementById('productForm').addEventListener('submit', async function (e) {
            e.preventDefault();

            if (!catSelects[0] || !catSelects[0].value) {
                showToast('لطفاً دسته‌بندی را انتخاب کنید ⚠️'); return;
            }
            if (currentColors.length === 0) {
                showToast('لطفاً حداقل یک رنگ برای محصول انتخاب کنید 🎨'); return;
            }

            // در حالت ویرایش، سند فعلی از روی docId واقعی Firestore پیدا می‌شود
            // (نه فیلد عددی id که فقط Date.now() است و تضمینی برای یکتا بودنش نیست)
            const editingDocId = document.getElementById('p-docid').value;
            const existingProduct = isEditingMode ? cachedProducts.find(p => p._docId === editingDocId) : null;

            let mainImage = '';
            let galleryImages = [];

            const submitBtn = document.getElementById('submitBtn');
            const originalBtnHtml = submitBtn.innerHTML;
            submitBtn.disabled = true;

            try {
                // Main image — اگر عکسی وارد نشده باشد، در حالت ویرایش عکس قبلی حفظ می‌شود
                // و فقط در حالت افزودن محصول جدید از تصویر ثابت «یافت نشد» استفاده می‌شود
                if (!document.getElementById('product-file-container').classList.contains('hidden')) {
                    const fileInput = document.getElementById('p-image-file');
                    if (fileInput.files[0]) {
                        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال آپلود تصویر اصلی...';
                        mainImage = await uploadImageToImgbb(fileInput.files[0]);
                    } else if (isEditingMode) {
                        mainImage = (existingProduct && existingProduct.image) ? existingProduct.image : NO_IMAGE_URL;
                    } else {
                        mainImage = NO_IMAGE_URL;
                    }
                } else {
                    const linkInput = document.getElementById('p-image-link');
                    mainImage = linkInput.value ? linkInput.value : (isEditingMode && existingProduct ? existingProduct.image : NO_IMAGE_URL);
                }

                // Gallery images — فقط به ازای هر لینک/فایل پرشده یک عکس جدید اضافه می‌شود؛
                // اگر هیچ ورودی جدیدی داده نشده باشد، گالری قبلی محصول حفظ می‌شود (نه پاک شدن!)
                let gallerySourceHasInput = false;
                if (!document.getElementById('gallery-file-container').classList.contains('hidden')) {
                    const gFiles = document.getElementById('p-gallery-files').files;
                    if (gFiles.length > 0) {
                        gallerySourceHasInput = true;
                        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال آپلود گالری تصاویر...';
                        for (let i = 0; i < Math.min(gFiles.length, 7); i++) {
                            galleryImages.push(await uploadImageToImgbb(gFiles[i]));
                        }
                    }
                } else {
                    const gLinks = document.querySelectorAll('.g-link-input');
                    gLinks.forEach(input => { if (input.value) { gallerySourceHasInput = true; galleryImages.push(input.value); } });
                }
                if (!gallerySourceHasInput && isEditingMode) {
                    galleryImages = (existingProduct && Array.isArray(existingProduct.gallery)) ? existingProduct.gallery : [];
                }

                const productData = {
                    id: isEditingMode ? parseInt(document.getElementById('p-id').value) : Date.now(),
                    name: document.getElementById('p-name').value,
                    category: catSelects[0].value,
                    breadcrumb: selectedBreadcrumb,
                    categoryPath: currentCategoryPath.slice(),
                    price: parseFloat(document.getElementById('p-price').value),
                    discount: parseFloat(document.getElementById('p-discount').value) || 0,
                    brand: document.getElementById('p-brand').value,
                    stock: parseInt(document.getElementById('p-stock').value),
                    image: mainImage,
                    gallery: galleryImages,
                    description: document.getElementById('p-desc').value,
                    colors: currentColors,
                    rating: parseFloat(document.getElementById('p-rating').value) || 0,
                    reviews: parseInt(document.getElementById('p-reviews').value) || 0,
                    hot: document.getElementById('p-hot').checked,
                    specs: currentSpecs,
                    updatedAt: new Date().toISOString()
                };

                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ذخیره در سرور...';

                if (isEditingMode) {
                    if (editingDocId) {
                        await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'products', editingDocId), productData);
                        showToast('محصول بروزرسانی شد ✨');
                        writeAuditLog('update', 'product', `محصول «${productData.name}» ویرایش شد`);
                    } else {
                        showToast('محصول موردنظر برای ویرایش یافت نشد ❌');
                    }
                } else {
                    productData.createdAt = new Date().toISOString();
                    await window.fbAddDoc(window.fbCollection(window.fbDb, 'products'), productData);
                    showToast('محصول ثبت شد ✨');
                    writeAuditLog('create', 'product', `محصول «${productData.name}» ایجاد شد`);
                }
                resetForm();
                await loadProductsFromFirestore();
            } catch (err) {
                console.error('خطا در ذخیره محصول در Firestore:', err);
                showToast('❌ ' + (err && err.message ? err.message : 'خطا در ارتباط با سرور. دوباره تلاش کنید'));
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        });

        function resetForm() {
            document.getElementById('productForm').reset();
            isEditingMode = false;
            currentColors = [];
            currentSpecs = {};
            selectedBreadcrumb = '';
            currentCategoryPath = [];
            document.getElementById('submitBtn').innerHTML = '<i class="fas fa-cloud-upload-alt"></i> ذخیره محصول';
            document.getElementById('submitBtn').style.background = 'var(--admin-primary)';
            document.getElementById('p-id').value = '';
            document.getElementById('p-docid').value = '';
            document.getElementById('p-rating').value = 0;
            document.getElementById('p-reviews').value = 0;
            document.getElementById('p-hot').checked = false;
            if (catSelects[0]) catSelects[0].value = '';
            for (let i = 1; i < 5; i++) {
                if (catSelects[i]) {
                    catSelects[i].innerHTML = '<option value="">ابتدا سطح قبلی را انتخاب کنید...</option>';
                    catSelects[i].disabled = true;
                }
            }
            document.getElementById('breadcrumb-display').innerHTML = '<i class="fas fa-link"></i> مسیر نهایی: هنوز انتخاب نشده';
            // Reset image inputs to file mode
            document.getElementById('product-file-container').classList.remove('hidden');
            document.getElementById('product-link-container').classList.add('hidden');
            initGalleryLinks();
            renderColorList([]);
            renderSpecsList();
            wizardGoTo(1);
        }

        // =========================================================
        // PRODUCT FORM WIZARD — navigation, per-step validation, review
        // =========================================================
        let currentWizardStep = 1;
        const WIZARD_TOTAL_STEPS = 5;

        function wizardGoTo(step) {
            currentWizardStep = step;
            document.querySelectorAll('.wizard-pane').forEach(p => p.classList.toggle('active', parseInt(p.dataset.pane) === step));
            document.querySelectorAll('.wizard-step-dot-wrap').forEach(dot => {
                const n = parseInt(dot.dataset.step);
                dot.classList.toggle('active', n === step);
                dot.classList.toggle('done', n < step);
            });
            for (let i = 1; i < WIZARD_TOTAL_STEPS; i++) {
                const line = document.getElementById('wline-' + i);
                if (line) line.classList.toggle('done', i < step);
            }
            if (step === WIZARD_TOTAL_STEPS) renderWizardReview();
            document.querySelector('.admin-main').scrollTo({ top: 0, behavior: 'smooth' });
        }

        function validateWizardStep(step) {
            if (step === 1) {
                const name = document.getElementById('p-name').value.trim();
                const price = document.getElementById('p-price').value;
                const stock = document.getElementById('p-stock').value;
                if (!name) { showToast('لطفاً نام کالا را وارد کنید ⚠️'); return false; }
                if (price === '' || parseFloat(price) < 0) { showToast('لطفاً قیمت معتبر وارد کنید ⚠️'); return false; }
                if (stock === '' || parseInt(stock) < 0) { showToast('لطفاً موجودی انبار را وارد کنید ⚠️'); return false; }
                return true;
            }
            if (step === 2) {
                if (!catSelects[0] || !catSelects[0].value) { showToast('لطفاً حداقل دسته اصلی را انتخاب کنید ⚠️'); return false; }
                return true;
            }
            if (step === 4) {
                if (currentColors.length === 0) { showToast('لطفاً حداقل یک رنگ برای محصول انتخاب کنید 🎨'); return false; }
                return true;
            }
            return true;
        }

        function wizardNext(fromStep) {
            if (!validateWizardStep(fromStep)) return;
            wizardGoTo(fromStep + 1);
        }

        function renderWizardReview() {
            const box = document.getElementById('wizardReviewBox');
            if (!box) return;
            const name = document.getElementById('p-name').value || '—';
            const price = document.getElementById('p-price').value;
            const stock = document.getElementById('p-stock').value;
            const discount = document.getElementById('p-discount').value || 0;
            const brand = document.getElementById('p-brand').value || '—';
            const hot = document.getElementById('p-hot').checked ? 'بله 🔥' : 'خیر';
            const catPath = selectedBreadcrumb || (catSelects[0] ? catSelects[0].value : '') || '—';
            const colorsTxt = currentColors.length ? currentColors.map(c => c.name).join('، ') : 'هیچ رنگی انتخاب نشده ⚠️';
            const specsCount = Object.keys(currentSpecs).length;
            let imgPreview = '';
            if (!document.getElementById('product-file-container').classList.contains('hidden')) {
                const f = document.getElementById('p-image-file').files[0];
                imgPreview = f ? f.name : (isEditingMode ? 'تصویر فعلی حفظ می‌شود' : 'تصویر پیش‌فرض استفاده می‌شود');
            } else {
                imgPreview = document.getElementById('p-image-link').value || (isEditingMode ? 'تصویر فعلی حفظ می‌شود' : 'تصویر پیش‌فرض استفاده می‌شود');
            }

            const rows = [
                ['نام کالا', name],
                ['قیمت', price ? Number(price).toLocaleString('fa-IR') + ' تومان' : '—'],
                ['موجودی', stock ? Number(stock).toLocaleString('fa-IR') : '—'],
                ['تخفیف', discount + '٪'],
                ['برند', brand],
                ['فروش ویژه', hot],
                ['مسیر دسته‌بندی', catPath],
                ['تصویر اصلی', imgPreview],
                ['رنگ‌ها', colorsTxt],
                ['تعداد مشخصات فنی', specsCount.toLocaleString('fa-IR')]
            ];
            box.innerHTML = rows.map(([label, value]) => `
                <div class="wizard-review-item">
                    <div class="rlabel">${label}</div>
                    <div class="rvalue">${value}</div>
                </div>`).join('');
        }

        // ===== جستجو/فیلتر/pagination لیست موجودی انبار =====
        let productsCurrentPage = 1;
        const PRODUCTS_PER_PAGE = 10;

        function onProductsFilterChange() {
            productsCurrentPage = 1;
            renderProducts();
        }

        function populateProductCategoryFilter() {
            const sel = document.getElementById('prod-cat-filter');
            if (!sel) return;
            const current = sel.value;
            const cats = [...new Set(cachedProducts.map(p => p.category).filter(Boolean))];
            sel.innerHTML = '<option value="">همه دسته‌بندی‌ها</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
            if (cats.includes(current)) sel.value = current;
        }

        function getFilteredProducts() {
            const term = (document.getElementById('prod-search-input')?.value || '').trim().toLowerCase();
            const cat = document.getElementById('prod-cat-filter')?.value || '';
            return cachedProducts.filter(p => {
                if (cat && p.category !== cat) return false;
                if (!term) return true;
                return (p.name || '').toLowerCase().includes(term) || (p.brand || '').toLowerCase().includes(term);
            });
        }

        function renderProductsPagination(totalPages) {
            const box = document.getElementById('prod-pagination');
            if (!box) return;
            if (totalPages <= 1) { box.innerHTML = ''; return; }
            let html = `<button type="button" class="action-btn edit-btn" ${productsCurrentPage === 1 ? 'disabled' : ''} onclick="goToProductsPage(${productsCurrentPage - 1})"><i class="fas fa-chevron-right"></i></button>`;
            for (let i = 1; i <= totalPages; i++) {
                html += `<button type="button" class="action-btn ${i === productsCurrentPage ? 'view-btn' : 'edit-btn'}" style="min-width:34px;" onclick="goToProductsPage(${i})">${i.toLocaleString('fa-IR')}</button>`;
            }
            html += `<button type="button" class="action-btn edit-btn" ${productsCurrentPage === totalPages ? 'disabled' : ''} onclick="goToProductsPage(${productsCurrentPage + 1})"><i class="fas fa-chevron-left"></i></button>`;
            box.innerHTML = html;
        }

        function goToProductsPage(p) {
            productsCurrentPage = p;
            renderProducts();
        }

        function renderProducts() {
            const products = cachedProducts;
            const tbody = document.getElementById('productTableBody');
            document.getElementById('stat-total').innerText = products.length;

            populateProductCategoryFilter();
            const filtered = getFilteredProducts();
            const countLabel = document.getElementById('prod-filter-count');

            if (products.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-light);">هنوز محصولی در دیتابیس ثبت نشده است.</td></tr>';
                document.getElementById('prod-pagination').innerHTML = '';
                if (countLabel) countLabel.innerText = '';
                updateBulkBar();
                return;
            }

            if (countLabel) countLabel.innerText = `${filtered.length.toLocaleString('fa-IR')} از ${products.length.toLocaleString('fa-IR')} کالا`;

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-light);">کالایی مطابق جستجو/فیلتر یافت نشد.</td></tr>';
                document.getElementById('prod-pagination').innerHTML = '';
                return;
            }

            const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
            if (productsCurrentPage > totalPages) productsCurrentPage = totalPages;
            const startIdx = (productsCurrentPage - 1) * PRODUCTS_PER_PAGE;
            const pageItems = filtered.slice(startIdx, startIdx + PRODUCTS_PER_PAGE);

            tbody.innerHTML = pageItems.map(p => {
                const finalPrice = p.price - (p.price * (p.discount || 0) / 100);
                const stockStatus = p.stock > 0
                    ? `<span style="color:var(--admin-success);font-weight:700;">✅ موجود (${p.stock})</span>`
                    : `<span style="color:var(--danger);font-weight:700;">❌ ناموجود</span>`;

                const colorPreview = p.colors && p.colors.length > 0
                    ? `<div style="display:flex;gap:4px;margin-top:6px;">${p.colors.slice(0, 4).map(c => `<span title="${esc(c.name)}" style="width:14px;height:14px;border-radius:50%;background:${esc(c.code)};border:1.5px solid #ddd;display:inline-block;"></span>`).join('')}</div>`
                    : '';

                const hotBadge = p.hot
                    ? '<span style="background:linear-gradient(135deg,#ff6b6b,#ff4757);color:white;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:900;margin-right:6px;">🔥 HOT</span>'
                    : '';

                const isChecked = selectedProductDocIds.has(p._docId) ? 'checked' : '';
                // SECURITY: تمام مقادیر متنی که از خودِ سند محصول می‌آیند (name/brand/
                // breadcrumb/category/image) پیش از قرار گرفتن در innerHTML باید esc شوند
                const safeName = esc(p.name);
                const safeImg = esc(p.image);

                return `<tr class="product-row">
                    <td data-label="انتخاب"><input type="checkbox" class="row-select-cb" data-docid="${p._docId}" ${isChecked} onchange="toggleSelectProduct(this)" aria-label="انتخاب ${safeName}"></td>
                    <td data-label="نمای کالا">
                        <img src="${safeImg}" class="prod-img" onerror="this.src='${NO_IMAGE_URL}'" alt="${safeName}">
                        ${colorPreview}
                    </td>
                    <td data-label="مشخصات">
                        <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${safeName}</div>
                        <small style="color:var(--text-light);">برند: ${esc(p.brand) || 'متفرقه'}</small>
                        <div style="margin-top:4px;font-size:11px;color:#f59e0b;">${(p.rating || 0).toFixed(1)} ⭐ (${p.reviews || 0} نظر)</div>
                    </td>
                    <td data-label="دسته و مسیر">
                        <div style="font-size:11px;color:var(--admin-accent);background:#e1f5fe;padding:4px 8px;border-radius:4px;display:inline-block;margin-bottom:4px;">
                            ${esc(p.breadcrumb || p.category)}
                        </div>
                        <div>${hotBadge}</div>
                    </td>
                    <td data-label="قیمت و موجودی">
                        <div style="color:var(--admin-success);font-weight:800;font-size:13px;">${Math.round(finalPrice).toLocaleString('en-US')} تومان</div>
                        ${p.discount > 0 ? `<small style="text-decoration:line-through;color:var(--danger);font-size:11px;">${p.discount}٪ تخفیف</small>` : ''}
                        <div style="margin-top:4px;font-size:12px;">${stockStatus}</div>
                        <div class="quick-edit-row">
                            <input type="number" class="quick-edit-input qe-price" value="${p.price}" title="ویرایش سریع قیمت" aria-label="ویرایش سریع قیمت ${safeName}">
                            <input type="number" class="quick-edit-input qe-stock" value="${p.stock}" style="width:60px;" title="ویرایش سریع موجودی" aria-label="ویرایش سریع موجودی ${safeName}">
                            <input type="number" class="quick-edit-input qe-discount" value="${p.discount || 0}" style="width:55px;" title="ویرایش سریع تخفیف٪" aria-label="ویرایش سریع تخفیف ${safeName}">
                            <button type="button" class="quick-edit-save-btn" onclick="saveQuickEdit('${p._docId}', this)" title="ذخیره سریع" aria-label="ذخیره سریع تغییرات ${safeName}"><i class="fas fa-check"></i></button>
                        </div>
                    </td>
                    <td data-label="مدیریت">
                        <button onclick="editProduct('${p._docId}')" class="action-btn edit-btn" title="ویرایش کامل محصول" aria-label="ویرایش کامل محصول ${safeName}">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button onclick="deleteProduct('${p._docId}')" class="action-btn delete-btn" title="حذف محصول" aria-label="حذف محصول ${safeName}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
            }).join('');

            renderProductsPagination(totalPages);
            updateBulkBar();
        }

        function editProduct(docId) {
            const product = cachedProducts.find(p => p._docId === docId);
            if (!product) return;

            document.getElementById('p-id').value = product.id;
            document.getElementById('p-docid').value = product._docId;
            document.getElementById('p-name').value = product.name;
            document.getElementById('p-price').value = product.price;
            document.getElementById('p-stock').value = product.stock;
            document.getElementById('p-discount').value = product.discount || 0;
            document.getElementById('p-brand').value = product.brand || '';
            document.getElementById('p-desc').value = product.description || '';
            document.getElementById('p-rating').value = product.rating || 0;
            document.getElementById('p-reviews').value = product.reviews || 0;
            document.getElementById('p-hot').checked = product.hot || false;

            const path = (product.categoryPath && Array.isArray(product.categoryPath) && product.categoryPath.length)
                ? product.categoryPath
                : (product.breadcrumb ? product.breadcrumb.split(' > ') : (product.category ? [product.category] : []));
            restoreCategoryPath(path);

            // کپی واقعی (نه رفرنس) می‌گیریم؛ وگرنه اضافه/حذف رنگ یا مشخصه در فرم
            // مستقیماً آبجکت داخل cachedProducts را هم تغییر می‌دهد و باعث
            // ناهماهنگی داده تا قبل از ذخیره‌ی واقعی در Firestore می‌شود.
            currentColors = product.colors ? product.colors.map(c => ({ ...c })) : [];
            renderColorList(currentColors);

            currentSpecs = product.specs ? { ...product.specs } : {};
            renderSpecsList();

            // Switch to link input for image
            document.getElementById('product-file-container').classList.add('hidden');
            document.getElementById('product-link-container').classList.remove('hidden');
            const imgTypeBtns = document.querySelector('#product-link-container').closest('.form-group').querySelectorAll('.type-btn');
            if (imgTypeBtns.length >= 2) {
                imgTypeBtns[0].classList.remove('active');
                imgTypeBtns[1].classList.add('active');
            }
            document.getElementById('p-image-link').value = product.image || '';

            document.getElementById('submitBtn').innerHTML = '<i class="fas fa-sync"></i> بروزرسانی محصول';
            document.getElementById('submitBtn').style.background = 'var(--admin-accent)';
            isEditingMode = true;
            wizardGoTo(1);

            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('حالت ویرایش فعال شد 📝');
        }

        async function deleteProduct(docId) {
            if (!docId) { showToast('محصول یافت نشد ❌'); return; }
            const target = cachedProducts.find(p => p._docId === docId);
            if (!confirm(`آیا از حذف کالای «${target ? target.name : docId}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.`)) return;

            try {
                await window.fbDeleteDoc(window.fbDoc(window.fbDb, 'products', docId));
                showToast('کالا حذف شد 🗑️');
                writeAuditLog('delete', 'product', `محصول «${target ? target.name : docId}» حذف شد`);
                await loadProductsFromFirestore();
            } catch (err) {
                console.error('خطا در حذف محصول از Firestore:', err);
                showToast('خطا در حذف محصول از سرور ❌');
            }
        }

        // =========================================================
        // BULK ACTIONS — انتخاب چندتایی و حذف/تغییر دسته‌بندی گروهی
        // =========================================================
        let selectedProductDocIds = new Set();

        function toggleSelectAllProducts(checkbox) {
            const rowBoxes = document.querySelectorAll('.row-select-cb');
            rowBoxes.forEach(cb => {
                cb.checked = checkbox.checked;
                if (checkbox.checked) selectedProductDocIds.add(cb.dataset.docid);
                else selectedProductDocIds.delete(cb.dataset.docid);
            });
            updateBulkBar();
        }

        function toggleSelectProduct(cb) {
            if (cb.checked) selectedProductDocIds.add(cb.dataset.docid);
            else selectedProductDocIds.delete(cb.dataset.docid);
            const all = document.querySelectorAll('.row-select-cb');
            const allChecked = all.length > 0 && Array.from(all).every(x => x.checked);
            const selectAllCb = document.getElementById('selectAllProductsCb');
            if (selectAllCb) selectAllCb.checked = allChecked;
            updateBulkBar();
        }

        function updateBulkBar() {
            const bar = document.getElementById('bulkActionsBar');
            const countEl = document.getElementById('bulkSelectedCount');
            if (!bar) return;
            const n = selectedProductDocIds.size;
            bar.classList.toggle('show', n > 0);
            if (countEl) countEl.innerText = `${n.toLocaleString('fa-IR')} کالا انتخاب شده`;
        }

        function populateBulkCategorySelect() {
            const sel = document.getElementById('bulkCategorySelect');
            if (!sel) return;
            const cats = Object.keys(CATEGORY_DATA);
            sel.innerHTML = '<option value="">— انتخاب دسته‌بندی جدید —</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // FIX (اتمیک‌سازی + کارایی): Firestore هر batch را حداکثر تا ۵۰۰ نوشتن
        // می‌پذیرد؛ این تابع کمکی آرایه را به تکه‌های حداکثر ۵۰۰تایی می‌شکند تا
        // حتی اگر تعداد کالاهای انتخاب‌شده خیلی زیاد باشد هم کار کند.
        function chunkArray(arr, size) {
            const out = [];
            for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
            return out;
        }

        async function applyBulkCategoryChange() {
            const sel = document.getElementById('bulkCategorySelect');
            const newCat = sel ? sel.value : '';
            if (!newCat) { showToast('یک دسته‌بندی انتخاب کنید ⚠️'); return; }
            if (selectedProductDocIds.size === 0) return;
            if (!confirm(`دسته‌بندی ${selectedProductDocIds.size.toLocaleString('fa-IR')} کالای انتخاب‌شده به «${newCat}» تغییر کند؟`)) return;

            // FIX: قبلاً این عملیات با یک حلقه‌ی for..of و await های پشت‌سرهم
            // (نه اتمیک، نه سریع) انجام می‌شد. حالا با writeBatch در گروه‌های
            // ۵۰۰تایی انجام می‌شود: یا کل یک batch با موفقیت commit می‌شود، یا
            // هیچ‌کدام از نوشتن‌های همان batch اعمال نمی‌شوند (اتمیک) و هم‌زمان
            // چند برابر سریع‌تر از حلقه‌ی ترتیبی است.
            const docIds = Array.from(selectedProductDocIds);
            const chunks = chunkArray(docIds, 500);
            let okCount = 0;
            for (const chunk of chunks) {
                try {
                    const batch = window.fbWriteBatch(window.fbDb);
                    chunk.forEach(docId => {
                        batch.update(window.fbDoc(window.fbDb, 'products', docId), { category: newCat, breadcrumb: newCat, categoryPath: [newCat] });
                    });
                    await batch.commit();
                    okCount += chunk.length;
                } catch (e) {
                    console.error('خطا در تغییر گروهی دسته‌بندی (batch):', e);
                }
            }
            writeAuditLog('update', 'product', `دسته‌بندی ${okCount.toLocaleString('fa-IR')} کالا به‌صورت گروهی به «${newCat}» تغییر کرد`);
            showToast(`دسته‌بندی ${okCount.toLocaleString('fa-IR')} کالا بروزرسانی شد ✅`);
            selectedProductDocIds.clear();
            await loadProductsFromFirestore();
        }

        async function applyBulkDelete() {
            if (selectedProductDocIds.size === 0) return;
            const n = selectedProductDocIds.size;
            if (!confirm(`آیا از حذف ${n.toLocaleString('fa-IR')} کالای انتخاب‌شده اطمینان دارید؟ این عملیات قابل بازگشت نیست.`)) return;

            // FIX: همان اصلاح اتمیک‌سازی/کارایی با writeBatch برای حذف گروهی
            const docIds = Array.from(selectedProductDocIds);
            const chunks = chunkArray(docIds, 500);
            let okCount = 0;
            for (const chunk of chunks) {
                try {
                    const batch = window.fbWriteBatch(window.fbDb);
                    chunk.forEach(docId => {
                        batch.delete(window.fbDoc(window.fbDb, 'products', docId));
                    });
                    await batch.commit();
                    okCount += chunk.length;
                } catch (e) {
                    console.error('خطا در حذف گروهی (batch):', e);
                }
            }
            writeAuditLog('delete', 'product', `${okCount.toLocaleString('fa-IR')} کالا به‌صورت گروهی حذف شد`);
            showToast(`${okCount.toLocaleString('fa-IR')} کالا حذف شد 🗑️`);
            selectedProductDocIds.clear();
            await loadProductsFromFirestore();
        }

        // =========================================================
        // INLINE QUICK-EDIT — تغییر سریع قیمت/موجودی/تخفیف بدون باز کردن ویزارد
        // =========================================================
        async function saveQuickEdit(docId, btnEl) {
            const row = btnEl.closest('.quick-edit-row');
            const price = parseFloat(row.querySelector('.qe-price').value);
            const stock = parseInt(row.querySelector('.qe-stock').value);
            const discount = parseFloat(row.querySelector('.qe-discount').value) || 0;
            if (isNaN(price) || price < 0) { showToast('قیمت معتبر نیست ⚠️'); return; }
            if (isNaN(stock) || stock < 0) { showToast('موجودی معتبر نیست ⚠️'); return; }

            const original = btnEl.innerHTML;
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'products', docId), { price, stock, discount, updatedAt: new Date().toISOString() });
                const target = cachedProducts.find(p => p._docId === docId);
                writeAuditLog('update', 'product', `قیمت/موجودی «${target ? target.name : docId}» به‌صورت سریع ویرایش شد`);
                showToast('تغییرات سریع ذخیره شد ✅');
                await loadProductsFromFirestore();
            } catch (e) {
                console.error('خطا در ویرایش سریع محصول:', e);
                showToast('خطا در ذخیره تغییرات ❌');
                btnEl.disabled = false;
                btnEl.innerHTML = original;
            }
        }

        // =========================================================
        // ORDERS — از فاز ۱ به بعد کاملاً از Firestore (کالکشن‌های
        // "orders" و "users") خوانده و نوشته می‌شوند، نه localStorage.
        // =========================================================
        function calculatePoints(totalAmount) {
            const amount = parseInt(totalAmount);
            if (amount >= 1000000000) return 100000;
            if (amount >= 400000000) return 50000;
            if (amount >= 300000000) return 40000;
            if (amount >= 200000000) return 30000;
            if (amount >= 100000000) return 20000;
            if (amount >= 80000000) return 10000;
            if (amount >= 60000000) return 9500;
            if (amount >= 40000000) return 9000;
            if (amount >= 20000000) return 8000;
            if (amount >= 10000000) return 7000;
            if (amount >= 5000000) return 5000;
            if (amount >= 1000000) return 150;
            return 50;
        }

        async function renderOrders(skipReload = false) {
            const tbody = document.getElementById('ordersTableBody');

            if (!skipReload) {
                tbody.innerHTML = '';
                await loadOrdersFromFirestore('first');
            }
            document.getElementById('stat-orders').innerText = cachedOrders.length;

            // توجه: فیلتر «پردازش‌نشده» روی همان صفحه‌ی جاری (نه کل کالکشن) اعمال می‌شود؛
            // این یعنی ممکن است در برخی صفحات تعداد ردیف‌های نمایشی کمتر از اندازه‌ی صفحه باشد.
            const pendingOrders = cachedOrders.filter(o => o.status !== 'delivered');

            if (pendingOrders.length === 0) {
                tbody.innerHTML = '';
                renderStatusBox('ordersStatusBox', 'empty', { text: 'سفارشی برای پردازش در این صفحه وجود ندارد.' });
                return;
            }
            renderStatusBox('ordersStatusBox', 'hidden');

            const rows = await Promise.all(pendingOrders.map(async order => {
                const user = await getUserCached(order.userId);
                // SECURITY: user.name توسط خودِ مشتری در login.html وارد می‌شود و
                // بدون ساینتایز روی سرور ذخیره می‌گردد؛ یعنی یک مشتری می‌تواند نام
                // خود را "<img src=x onerror=...>" بگذارد. چون این مقدار در پنل
                // ادمین (جدول سفارشات/گزارشات/مودال جزئیات) رندر می‌شود، این
                // خطرناک‌ترین نوع XSS ذخیره‌شده در این پروژه بود (هر مشتری،
                // نه فقط ادمین، می‌توانست payload بسازد). از این پس همیشه esc().
                const userName = esc(user ? (user.name || order.userId) : order.userId);

                let statusClass = 'status-paid', statusText = 'پرداخت شده';
                if (order.status === 'processing') { statusClass = 'status-processing'; statusText = 'پردازش انبار'; }
                else if (order.status === 'shipped') { statusClass = 'status-shipped'; statusText = 'ارسال شده'; }
                else if (order.status === 'delivered') { statusClass = 'status-delivered'; statusText = 'تحویل داده شده'; }

                const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('fa-IR') : (order.datePersian || '--');
                const orderLabel = esc(order.orderId || order._docId.slice(0, 6).toUpperCase());

                return `<tr>
                    <td style="font-weight:700;color:var(--admin-primary);">#${orderLabel}</td>
                    <td>
                        <div style="font-weight:700;font-size:13px;">${userName}</div>
                        <small style="color:var(--text-light);">${esc(order.userId)}</small>
                    </td>
                    <td style="font-size:12px;">${dateStr}</td>
                    <td style="color:var(--admin-primary);font-weight:800;">${parseInt(order.totalAmount || 0).toLocaleString('en-US')} تومان</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button onclick="openOrderModal('${order._docId}')" class="action-btn view-btn">
                            <i class="fas fa-eye"></i> مشاهده
                        </button>
                    </td>
                </tr>`;
            }));

            tbody.innerHTML = rows.join('');
        }

        async function openOrderModal(docId) {
            const order = cachedOrders.find(o => o._docId === docId);
            if (!order) { showToast('سفارش یافت نشد ❌'); return; }

            currentViewOrderId = docId;

            document.getElementById('modal-order-id').innerText = '#' + (order.orderId || docId.slice(0, 6).toUpperCase());

            const dateObj = new Date(order.createdAt);
            document.getElementById('modal-order-date').innerText =
                isNaN(dateObj) ? (order.datePersian || '--') : `${dateObj.toLocaleDateString('fa-IR')} - ${dateObj.toLocaleTimeString('fa-IR')}`;

            document.getElementById('modal-user-name').innerText = 'در حال بارگذاری...';
            document.getElementById('modal-user-mobile').innerText = '';
            document.getElementById('modal-address').innerText = order.address || '--';
            document.getElementById('modal-postal-code').innerText = 'کد پستی: ' + (order.postalCode || '---');

            const productsListDiv = document.getElementById('modal-products-list');
            productsListDiv.innerHTML = '';
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const productData = cachedProducts.find(p => p.id == item.id);
                    const imgUrl = esc(productData ? productData.image : NO_IMAGE_URL);
                    const itemName = esc(productData ? productData.name : (item.name || 'محصول'));
                    const itemColor = esc(item.color || 'مشکی');
                    productsListDiv.innerHTML += `
                        <div class="order-product-item">
                            <img src="${imgUrl}" alt="${itemName}" onerror="this.src='${NO_IMAGE_URL}'">
                            <div style="flex:1;">
                                <div style="font-weight:700;font-size:13px;">${itemName}</div>
                                <div style="font-size:12px;color:var(--text-light);">تعداد: ${Number(item.qty) || 0} | رنگ: ${itemColor}</div>
                            </div>
                            <div style="font-weight:700;font-size:13px;color:var(--admin-primary);">${((item.price || 0) * item.qty).toLocaleString('en-US')} تومان</div>
                        </div>`;
                });
            }

            document.getElementById('modal-total-amount').innerText = parseInt(order.totalAmount || 0).toLocaleString('en-US') + ' تومان';
            document.getElementById('modal-status-select').value = order.status;
            document.getElementById('orderModal').classList.add('open');

            // اطلاعات کاربر به‌صورت جداگانه و async بارگذاری می‌شود تا باز شدن مودال معطل نماند
            const user = await getUserCached(order.userId);
            if (currentViewOrderId !== docId) return; // کاربر مودال دیگری باز کرده
            document.getElementById('modal-user-name').innerText = user ? (user.name || order.userId) : order.userId;
            document.getElementById('modal-user-mobile').innerText = 'تلفن: ' + (user && user.mobile ? user.mobile : order.userId);
        }

        function closeOrderModal() {
            document.getElementById('orderModal').classList.remove('open');
            currentViewOrderId = null;
        }

        async function updateOrderStatus(newStatus) {
            if (!currentViewOrderId) return;
            const order = cachedOrders.find(o => o._docId === currentViewOrderId);
            if (!order) { showToast('سفارش یافت نشد ❌'); return; }

            const oldStatus = order.status;
            if (oldStatus === newStatus) return;

            // تغییر وضعیت به «تحویل داده شده» امتیاز واقعی به کیف پول کاربر اضافه می‌کند؛
            // این عملیات باید با یک تأیید صریح انجام شود، نه فقط انتخاب از select.
            if (newStatus === 'delivered' && oldStatus !== 'delivered') {
                const pts = calculatePoints(order.totalAmount);
                const ok = confirm(`با ثبت این سفارش به‌عنوان «تحویل داده شده»، ${pts.toLocaleString('fa-IR')} امتیاز به کیف پول مشتری اضافه می‌شود. ادامه می‌دهید؟`);
                if (!ok) {
                    document.getElementById('modal-status-select').value = oldStatus;
                    return;
                }
            }

            const updatePayload = { status: newStatus };
            if (newStatus === 'delivered' && oldStatus !== 'delivered') {
                updatePayload.deliveredAt = new Date().toISOString();
            }

            try {
                await window.fbUpdateDoc(window.fbDoc(window.fbDb, 'orders', currentViewOrderId), updatePayload);
            } catch (e) {
                console.error('خطا در بروزرسانی وضعیت سفارش در Firestore:', e);
                showToast('خطا در ذخیره وضعیت سفارش روی سرور ❌');
                document.getElementById('modal-status-select').value = oldStatus;
                return;
            }
            Object.assign(order, updatePayload);

            const orderLabel = order.orderId || currentViewOrderId.slice(0, 6).toUpperCase();
            const statusLabelsFa = { pending_payment: 'در انتظار پرداخت', paid: 'پرداخت‌شده', processing: 'پردازش انبار', shipped: 'ارسال‌شده', delivered: 'تحویل‌شده', failed_payment: 'ناموفق' };

            if (newStatus === 'delivered' && oldStatus !== 'delivered') {
                const pointsToAdd = calculatePoints(order.totalAmount);
                try {
                    const userRef = window.fbDoc(window.fbDb, 'users', order.userId);
                    const userSnap = await window.fbGetDoc(userRef);
                    const currentPoints = (userSnap.exists() && userSnap.data().points) ? userSnap.data().points : 0;
                    await window.fbUpdateDoc(userRef, { points: currentPoints + pointsToAdd });
                    usersCache.delete(order.userId); // کش این کاربر باطل می‌شود تا دفعه بعد امتیاز تازه خوانده شود
                    showToast(`سفارش تأیید شد. ${pointsToAdd} امتیاز به کاربر اضافه شد ✨`);
                    writeAuditLog('update', 'order', `سفارش #${orderLabel} به «تحویل داده شده» تغییر کرد و ${pointsToAdd.toLocaleString('fa-IR')} امتیاز اعطا شد`);
                } catch (e) {
                    console.error('خطا در بروزرسانی امتیاز کاربر در Firestore:', e);
                    showToast('وضعیت سفارش تغییر کرد ولی امتیاز کاربر ثبت نشد ⚠️');
                    writeAuditLog('update', 'order', `سفارش #${orderLabel} به «تحویل داده شده» تغییر کرد (ثبت امتیاز ناموفق)`);
                }
            } else {
                showToast('وضعیت سفارش تغییر کرد.');
                writeAuditLog('update', 'order', `وضعیت سفارش #${orderLabel} از «${statusLabelsFa[oldStatus] || oldStatus}» به «${statusLabelsFa[newStatus] || newStatus}» تغییر کرد`);
            }

            await renderOrders();
            renderReports();
            renderDashboardCharts();
        }

        // Close modal on overlay click
        document.getElementById('orderModal').addEventListener('click', function (e) {
            if (e.target === this) closeOrderModal();
        });

        // =========================================================
        // REPORTS
        // =========================================================
        async function renderReports() {
            const tbody = document.getElementById('deliveredOrdersTableBody');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-light);"><i class="fas fa-spinner fa-spin"></i> در حال محاسبه گزارشات از سرور...</td></tr>';

            await loadOrdersFromFirestore();
            const deliveredOrders = cachedOrders.filter(o => o.status === 'delivered');

            let totalSales = 0;
            deliveredOrders.forEach(o => totalSales += (parseInt(o.totalAmount) || 0));
            const count = deliveredOrders.length;
            const average = count > 0 ? Math.ceil(totalSales / count) : 0;

            document.getElementById('report-total-sales').innerText = totalSales.toLocaleString('en-US') + ' تومان';
            document.getElementById('report-delivered-count').innerText = count;
            document.getElementById('report-average-order').innerText = average.toLocaleString('en-US') + ' تومان';

            if (deliveredOrders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-light);">هنوز سفارشی تحویل داده نشده است.</td></tr>';
                return;
            }

            const rows = await Promise.all([...deliveredOrders].reverse().map(async order => {
                const user = await getUserCached(order.userId);
                const userName = esc(user ? (user.name || order.userId) : order.userId); // SECURITY: نگاه کنید به توضیح esc() در renderOrders
                const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('fa-IR') : '--';
                const orderLabel = esc(order.orderId || order._docId.slice(0, 6).toUpperCase());
                return `<tr>
                    <td style="font-weight:700;color:var(--admin-primary);">#${orderLabel}</td>
                    <td>${userName}</td>
                    <td style="font-size:12px;">${deliveredAt}</td>
                    <td style="font-weight:700;">${parseInt(order.totalAmount || 0).toLocaleString('en-US')} تومان</td>
                </tr>`;
            }));

            tbody.innerHTML = rows.join('');
        }

        // =========================================================
        // SLIDER — از این پس در Firestore (settings/slides)، هماهنگ با
        // spotlightCards؛ دیگر با تغییر مرورگر/دستگاه ادمین گم نمی‌شود
        // و می‌تواند مستقیماً توسط index.html هم خوانده شود.
        // =========================================================
        async function loadSlidesFromFirestore() {
            try {
                const snap = await window.fbGetDoc(window.fbDoc(window.fbDb, 'settings', 'slides'));
                return (snap.exists() && Array.isArray(snap.data().slides)) ? snap.data().slides : [];
            } catch (e) {
                console.error('خطا در خواندن اسلایدها از Firestore:', e);
                showToast('خطا در دریافت اسلایدها از سرور ❌');
                return [];
            }
        }

        async function saveSlidesToFirestore(slides) {
            try {
                await window.fbSetDoc(window.fbDoc(window.fbDb, 'settings', 'slides'), { slides, updatedAt: new Date().toISOString() });
                return true;
            } catch (e) {
                console.error('خطا در ذخیره اسلایدها در Firestore:', e);
                showToast('خطا در ذخیره اسلایدها روی سرور ❌');
                return false;
            }
        }

        async function addSingleSlide() {
            let imageUrl = '';
            const fileInput = document.getElementById('s-image-file');
            const linkInput = document.getElementById('s-image-link');
            const title = document.getElementById('s-title').value;
            const link = document.getElementById('s-link').value;

            try {
                if (!document.getElementById('slider-file-container').classList.contains('hidden')) {
                    if (fileInput.files[0]) imageUrl = await uploadImageToImgbb(fileInput.files[0]);
                    else { showToast('فایل عکس انتخاب نشده است ❌'); return; }
                } else {
                    if (linkInput.value) imageUrl = linkInput.value;
                    else { showToast('لینک عکس وارد نشده است ❌'); return; }
                }
            } catch (e) {
                showToast('❌ ' + (e && e.message ? e.message : 'آپلود تصویر ناموفق بود'));
                return;
            }

            const newSlide = { image: imageUrl, link: link, title: title };
            const slides = await loadSlidesFromFirestore();
            slides.push(newSlide);
            const saved = await saveSlidesToFirestore(slides);
            if (!saved) return;

            fileInput.value = '';
            linkInput.value = '';
            document.getElementById('s-title').value = '';
            document.getElementById('s-link').value = '';

            writeAuditLog('create', 'slide', `اسلاید جدید «${title || 'بدون عنوان'}» اضافه شد`);
            await renderSlides();
            showToast('اسلاید جدید اضافه شد ✅');
        }

        async function renderSlides() {
            const slides = await loadSlidesFromFirestore();
            const container = document.getElementById('adminSliderList');
            document.getElementById('stat-slides').innerText = slides.length;

            if (slides.length === 0) {
                container.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:30px;">هنوز اسلایدی اضافه نشده است.</p>';
                return;
            }

            container.innerHTML = slides.map((s, index) => `
                <div class="slide-item">
                    <img src="${esc(s.image)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='${NO_IMAGE_URL}'" alt="${esc(s.title) || ''}">
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <strong style="font-size:14px;">${esc(s.title) || 'بدون عنوان'}</strong><br>
                            <small style="opacity:0.75;font-size:11px;">${esc(s.link) || 'بدون لینک'}</small>
                        </div>
                        <button onclick="deleteSlide(${index})" style="background:var(--danger);color:white;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;" aria-label="حذف اسلاید ${esc(s.title) || index + 1}">
                            <i class="fas fa-trash"></i> حذف
                        </button>
                    </div>
                </div>`).join('');
        }

        async function deleteSlide(index) {
            if (!confirm('آیا از حذف این اسلاید اطمینان دارید؟')) return;
            const slides = await loadSlidesFromFirestore();
            const removed = slides[index];
            slides.splice(index, 1);
            const saved = await saveSlidesToFirestore(slides);
            if (!saved) return;
            writeAuditLog('delete', 'slide', `اسلاید «${removed && removed.title ? removed.title : 'بدون عنوان'}» حذف شد`);
            await renderSlides();
            showToast('اسلاید حذف شد');
        }

        // =========================================================
        // TOAST
        // =========================================================
        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        // =========================================================
        // APP BOOTSTRAP
        // =========================================================
        window.addEventListener('firebase-ready', initAuthGate);
        if (window.fbAuth) initAuthGate();
