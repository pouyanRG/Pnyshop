// =============================================
// AI ASSISTANT PAGE LOGIC — Ai.html (Gemini Powered)
// =============================================
import * as wishlistService from './wishlist-service.js';

const FALLBACK_IMG = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkvallQ5ZGN8H0RHyH6fe91ycZ2NbnLPmx9x-2_NqnBQ&s=10';
const THEME_KEY = 'theme';
const LEGACY_SESSION_KEY = 'current_user';

const state = {
    theme: localStorage.getItem(THEME_KEY) || 'light',
    user: null,        // { uid, name, cart, wishlist, ... } یا null برای مهمان
    products: [],       // کاتالوگ محصولات Firestore
    chatStarted: false
};

// نگهداری تاریخچه پیام‌ها در کلاینت برای حافظه Gemini
const chatHistory = [];

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function fmtPrice(n) { return Math.round(n || 0).toLocaleString('en-US'); }
function finalPrice(p) { return Math.round(p.price - (p.price * (p.discount || 0) / 100)); }

/* =========================================================
   THEME MANAGEMENT
   ========================================================= */
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const icon = t === 'dark' ? 'fa-sun' : 'fa-moon';
    document.querySelectorAll('#navTheme i, #aiThemeToggleMobile i').forEach(i => { i.className = `fas ${icon}`; });
}
function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, state.theme);
    applyTheme(state.theme);
}

/* =========================================================
   MOBILE DRAWER TOGGLE LOGIC
   ========================================================= */
function openDrawer() {
    const sidebar = document.getElementById('aiSidebar');
    const backdrop = document.getElementById('aiDrawerBackdrop');
    sidebar?.classList.add('open');
    backdrop?.classList.add('active');
}

function closeDrawer() {
    const sidebar = document.getElementById('aiSidebar');
    const backdrop = document.getElementById('aiDrawerBackdrop');
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('active');
}

/* =========================================================
   AUTO-RESIZE TEXTAREA LOGIC
   ========================================================= */
function setupAutoResizeInput() {
    const input = document.getElementById('aiChatInput');
    if (!input) return;

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
}

/* =========================================================
   INIT & FIREBASE BINDING
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    bindStaticUI();
    setupAutoResizeInput();
});

let appInitialized = false;
window.addEventListener('firebase-ready', initApp);
if (window.fbAuth) initApp();

function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
        if (user) {
            localStorage.setItem(LEGACY_SESSION_KEY, user.uid);
            const profile = await getUserProfile(user.uid);
            state.user = { uid: user.uid, ...(profile || {}) };
        } else {
            localStorage.removeItem(LEGACY_SESSION_KEY);
            state.user = null;
        }
        updateUserUI();
        await loadProducts();
        renderSuggestions();
        revealApp();
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
        const q = window.fbQuery(window.fbCollection(window.fbDb, 'products'), window.fbOrderBy('id', 'desc'), window.fbLimit(200));
        const snap = await window.fbGetDocs(q);
        state.products = [];
        snap.forEach(d => state.products.push(d.data()));
    } catch (e) {
        console.error('خطا در خواندن محصولات از Firestore:', e);
        state.products = [];
    }
}

function revealApp() {
    const skel = document.getElementById('aiSkeleton');
    const app = document.getElementById('aiApp');
    if (skel) skel.classList.add('hidden');
    if (app) app.classList.remove('hidden');
}

function updateUserUI() {
    const nameEl = document.getElementById('aiUserName');
    const subEl = document.getElementById('aiUserSub');
    const link = document.getElementById('aiSidebarUser');
    if (state.user) {
        if (nameEl) nameEl.innerText = state.user.name || 'کاربر';
        if (subEl) subEl.innerText = state.user.email || 'مشاهده حساب کاربری';
        if (link) link.href = 'profile.html';
    } else {
        if (nameEl) nameEl.innerText = 'کاربر مهمان';
        if (subEl) subEl.innerText = 'ورود / ثبت‌نام';
        if (link) link.href = 'login.html';
    }
}

/* =========================================================
   STATIC UI BINDINGS
   ========================================================= */
function bindStaticUI() {
    document.getElementById('navTheme')?.addEventListener('click', toggleTheme);
    document.getElementById('aiThemeToggleMobile')?.addEventListener('click', toggleTheme);

    // Mobile Drawer Controls
    document.getElementById('aiMobileMenuBtn')?.addEventListener('click', openDrawer);
    document.getElementById('aiDrawerClose')?.addEventListener('click', closeDrawer);
    document.getElementById('aiDrawerBackdrop')?.addEventListener('click', closeDrawer);

    document.getElementById('aiMobileUserBtn')?.addEventListener('click', () => {
        window.location.href = state.user ? 'profile.html' : 'login.html';
    });

    document.getElementById('qcSearch')?.addEventListener('click', () => {
        const inp = document.getElementById('aiChatInput');
        if (inp) {
            inp.focus();
            inp.placeholder = 'چه محصولی مد نظرتان است؟...';
        }
    });

    document.querySelectorAll('[data-quick]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeDrawer();
            sendQuick(btn.dataset.quick);
        });
    });

    // New Chat Button
    document.getElementById('navNewChat')?.addEventListener('click', startNewChat);

    const sendBtn = document.getElementById('aiSendBtn');
    sendBtn?.addEventListener('click', handleSend);

    document.getElementById('aiSuggestNext')?.addEventListener('click', () => scrollSuggest(1));
    document.getElementById('aiSuggestPrev')?.addEventListener('click', () => scrollSuggest(-1));
}

function scrollSuggest(dir) {
    const row = document.getElementById('aiSuggestScroll');
    if (row) row.scrollBy({ left: dir * 220, behavior: 'smooth' });
}

function startNewChat() {
    chatHistory.length = 0;
    state.chatStarted = false;
    const log = document.getElementById('aiChatLog');
    const hero = document.getElementById('aiHero');
    if (log) {
        log.innerHTML = '';
        log.setAttribute('hidden', 'true');
    }
    if (hero) hero.style.display = 'flex';
    closeDrawer();
}

/* =========================================================
   SUGGESTIONS & WISHLIST
   ========================================================= */
function renderSuggestions() {
    const row = document.getElementById('aiSuggestScroll');
    if (!row) return;
    const list = state.products
        .filter(p => p.stock > 0)
        .sort((a, b) => (b.discount || 0) - (a.discount || 0) || (b.rating || 0) - (a.rating || 0))
        .slice(0, 8);

    if (!list.length) {
        row.innerHTML = `<div style="padding:20px;color:var(--ai-text-muted);font-size:12.5px;">فعلاً پیشنهادی موجود نیست.</div>`;
        return;
    }
    row.innerHTML = list.map(p => renderProductCard(p)).join('');
}

function getWishlist() {
    if (!state.user) return [];
    return wishlistService.normalizeList(state.user.wishlist);
}

function renderProductCard(p) {
    const fp = finalPrice(p);
    const isWished = wishlistService.hasId(getWishlist(), p.id);
    return `
        <div class="ai-prod-card" onclick="window.location.href='product.html?id=${p.id}'">
            <div class="ai-prod-img-wrap">
                <button type="button" class="ai-prod-wish${isWished ? ' active' : ''}" onclick="event.stopPropagation();window.aiToggleWish(${p.id})" aria-label="علاقه‌مندی">
                    <i class="${isWished ? 'fas' : 'far'} fa-heart"></i>
                </button>
                <img src="${esc(p.image || FALLBACK_IMG)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
            </div>
            <div class="ai-prod-body">
                <div class="ai-prod-name">${esc(p.name)}</div>
                <div class="ai-prod-price">${fmtPrice(fp)} <small>تومان</small></div>
                <button type="button" class="ai-prod-btn" onclick="event.stopPropagation();window.location.href='product.html?id=${p.id}'">مشاهده محصول</button>
            </div>
        </div>`;
}

async function toggleWish(id) {
    if (!state.user) {
        appendBotResponse({ html: '<p>برای افزودن به علاقه‌مندی‌ها لطفاً وارد حساب شوید.</p>' });
        return;
    }
    const product = state.products.find(p => p.id == id);
    const currentList = getWishlist();
    const { list: updatedList } = wishlistService.toggle(currentList, id, product);
    try {
        await wishlistService.persistToFirestore(state.user.uid, updatedList, window.fbUpdateDoc, window.fbDoc, window.fbDb);
        state.user.wishlist = updatedList;
        renderSuggestions();
    } catch (e) {
        console.error('خطا در بروزرسانی علاقه‌مندی‌ها:', e);
    }
}
window.aiToggleWish = toggleWish;

/* =========================================================
   CHAT UI RENDERERS
   ========================================================= */
function ensureChatVisible() {
    if (state.chatStarted) return;
    state.chatStarted = true;
    const hero = document.getElementById('aiHero');
    const log = document.getElementById('aiChatLog');
    if (hero) hero.style.display = 'none';
    if (log) log.removeAttribute('hidden');
}

function appendMessage(role, innerHtml) {
    ensureChatVisible();
    const log = document.getElementById('aiChatLog');
    if (!log) return;

    const row = document.createElement('div');
    row.className = `ai-msg-row ${role}`;
    
    const avatarHtml = role === 'bot'
        ? `<img src="img/Minimal Three-Colour Sparkle Cluster.png" alt="AI" class="ai-avatar-img">`
        : `<i class="fas fa-user"></i>`;

    const actionsHtml = role === 'bot'
        ? `<div class="ai-msg-actions">
            <button type="button" class="ai-action-btn" onclick="window.aiCopyMsg(this)" title="کپی پیام"><i class="far fa-copy"></i> کپی</button>
           </div>`
        : '';

    row.innerHTML = `
        <div class="ai-msg-avatar">${avatarHtml}</div>
        <div class="ai-msg-content">
            <div class="ai-msg-bubble">${innerHtml}</div>
            ${actionsHtml}
        </div>
    `;

    log.appendChild(row);
    scrollToBottom();
}

function scrollToBottom() {
    const scrollContainer = document.getElementById('aiMainScroll');
    if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
}

function appendUserText(text) { appendMessage('user', `<p>${esc(text)}</p>`); }

function appendBotResponse(resp) {
    let html = resp.html || '';
    appendMessage('bot', html);
}

function showTyping() {
    ensureChatVisible();
    const log = document.getElementById('aiChatLog');
    if (!log) return;
    const row = document.createElement('div');
    row.className = 'ai-msg-row bot';
    row.id = 'aiTypingRow';
    row.innerHTML = `
        <div class="ai-msg-avatar"><img src="img/Minimal Three-Colour Sparkle Cluster.png" alt="AI" class="ai-avatar-img"></div>
        <div class="ai-msg-content">
            <div class="ai-msg-bubble ai-typing"><span></span><span></span><span></span></div>
        </div>`;
    log.appendChild(row);
    scrollToBottom();
}

function hideTyping() { document.getElementById('aiTypingRow')?.remove(); }

window.aiCopyMsg = function(btn) {
    const bubble = btn.closest('.ai-msg-content')?.querySelector('.ai-msg-bubble');
    if (bubble) {
        navigator.clipboard.writeText(bubble.innerText);
        btn.innerHTML = `<i class="fas fa-check"></i> کپی شد`;
        setTimeout(() => { btn.innerHTML = `<i class="far fa-copy"></i> کپی`; }, 2000);
    }
};

/* =========================================================
   GEMINI API CONNECTOR
   ========================================================= */
async function sendToGeminiAPI(userMessage) {
    try {
        const catalogSummary = state.products.map(p => ({
            id: p.id,
            name: p.name,
            price: finalPrice(p),
            stock: p.stock
        }));

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: userMessage,
                history: chatHistory.slice(-8),
                userProfile: state.user,
                productsCatalog: catalogSummary
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`خطای سرور (Status ${response.status}):`, errorText);
            throw new Error(`Server returned status ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            chatHistory.push({ role: 'user', text: userMessage });
            chatHistory.push({ role: 'bot', text: data.reply });

            const formattedReply = esc(data.reply).replace(/\n/g, '<br>');
            return { html: `<p>${formattedReply}</p>` };
        } else {
            throw new Error(data.reply || 'خطای ناشناخته در پاسخ سرور');
        }
    } catch (err) {
        console.error('خطا در ارتباط با هوش مصنوعی:', err);
        return { html: `<p>مشکلی در ارتباط با هوش مصنوعی پیش آمد. لطفاً دوباره تلاش کنید.</p>` };
    }
}

async function handleSend() {
    const input = document.getElementById('aiChatInput');
    const text = input.value.trim();
    if (!text) return;

    appendUserText(text);
    input.value = '';
    input.style.height = 'auto'; // Reset auto-resize height

    showTyping();

    const resp = await sendToGeminiAPI(text);

    hideTyping();
    appendBotResponse(resp);
}

function sendQuick(text) {
    const input = document.getElementById('aiChatInput');
    if (input) input.value = text;
    handleSend();
}