/**
 * Unified wishlist service — Firestore-backed with localStorage guest fallback.
 * Items: { id, priceAtAdd?, addedAt? } (legacy: plain number ids)
 */
const LEGACY_KEY = 'shop_wishlist';

export function normalizeItem(item) {
    if (item == null) return null;
    if (typeof item === 'number' || typeof item === 'string') {
        const id = Number(item);
        if (!Number.isFinite(id) || id <= 0) return null;
        return { id, priceAtAdd: null, addedAt: null };
    }
    if (typeof item === 'object' && item.id != null) {
        const id = Number(item.id);
        if (!Number.isFinite(id) || id <= 0) return null;
        return {
            id,
            priceAtAdd: item.priceAtAdd != null ? Number(item.priceAtAdd) : null,
            addedAt: item.addedAt || null
        };
    }
    return null;
}

export function normalizeList(arr) {
    if (!Array.isArray(arr)) return [];
    const map = new Map();
    arr.forEach(item => {
        const n = normalizeItem(item);
        if (n) map.set(n.id, n);
    });
    return Array.from(map.values());
}

export function getIds(list) {
    return normalizeList(list).map(x => x.id);
}

export function hasId(list, id) {
    return getIds(list).includes(Number(id));
}

export function getFinalPrice(product) {
    if (!product) return 0;
    return Math.round(product.price - (product.price * (product.discount || 0) / 100));
}

export function toggle(list, productId, product) {
    const normalized = normalizeList(list);
    const pid = Number(productId);
    const idx = normalized.findIndex(x => x.id === pid);
    if (idx >= 0) {
        normalized.splice(idx, 1);
        return { list: normalized, added: false };
    }
    const priceAtAdd = product ? getFinalPrice(product) : null;
    normalized.push({
        id: pid,
        priceAtAdd,
        addedAt: new Date().toISOString()
    });
    return { list: normalized, added: true };
}

export function mergeLocalAndRemote(localRaw, remoteRaw) {
    const local = normalizeList(localRaw);
    const remote = normalizeList(remoteRaw);
    const map = new Map();
    remote.forEach(x => map.set(x.id, x));
    local.forEach(x => {
        if (!map.has(x.id)) {
            map.set(x.id, x);
        } else {
            const existing = map.get(x.id);
            if (x.priceAtAdd != null && existing.priceAtAdd == null) {
                map.set(x.id, { ...existing, priceAtAdd: x.priceAtAdd, addedAt: x.addedAt });
            }
        }
    });
    return Array.from(map.values());
}

export function getLegacyLocal() {
    try {
        const raw = JSON.parse(localStorage.getItem(LEGACY_KEY));
        if (!Array.isArray(raw)) return [];
        return normalizeList(raw);
    } catch {
        return [];
    }
}

export function saveLegacyLocal(list) {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(normalizeList(list)));
}

export function clearLegacyLocal() {
    localStorage.removeItem(LEGACY_KEY);
}

export function computePriceDrops(wishlist, catalog) {
    const items = normalizeList(wishlist);
    const byId = new Map(catalog.map(p => [Number(p.id), p]));
    const drops = [];
    items.forEach(w => {
        const p = byId.get(w.id);
        if (!p || w.priceAtAdd == null) return;
        const current = getFinalPrice(p);
        if (current < w.priceAtAdd) {
            drops.push({
                product: p,
                saved: w.priceAtAdd - current,
                oldPrice: w.priceAtAdd,
                newPrice: current
            });
        }
    });
    return drops.sort((a, b) => b.saved - a.saved);
}

export function computeBackInStock(wishlist, catalog, previouslyOutOfStockIds) {
    const ids = new Set(getIds(wishlist));
    const outSet = previouslyOutOfStockIds instanceof Set
        ? previouslyOutOfStockIds
        : new Set(Array.isArray(previouslyOutOfStockIds) ? previouslyOutOfStockIds : []);
    return catalog.filter(p => {
        if (!ids.has(Number(p.id)) || p.stock <= 0) return false;
        return outSet.has(Number(p.id)) || true;
    });
}

export async function persistToFirestore(uid, list, updateDoc, doc, db) {
    const normalized = normalizeList(list);
    await updateDoc(doc(db, 'users', uid), { wishlist: normalized });
    return normalized;
}

export async function syncWishlistOnLogin(uid, remoteRaw, updateDoc, doc, db) {
    const local = getLegacyLocal();
    const remote = normalizeList(remoteRaw);
    const merged = mergeLocalAndRemote(local, remote);
    if (merged.length !== remote.length || local.length > 0) {
        await persistToFirestore(uid, merged, updateDoc, doc, db);
        if (local.length) clearLegacyLocal();
    }
    return merged;
}
