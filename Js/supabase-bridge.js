import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configResponse = await fetch('/api/public-config', { cache: 'no-store' });
if (!configResponse.ok) {
    throw new Error('Supabase public configuration could not be loaded');
}

const { url, publishableKey } = await configResponse.json();
export const supabaseClient = createClient(url, publishableKey, {
    auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
    }
});
const authState = { currentUser: null };

const tables = {
    users: 'profiles',
    admins: 'user_roles',
    auditLogs: 'audit_logs',
    settings: 'store_settings'
};

const fieldMaps = {
    profiles: {
        uid: 'id',
        post: 'postal_code',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    products: {
        image: 'image_url',
        reviews: 'review_count',
        hot: 'is_hot',
        specs: 'specifications',
        active: 'is_active',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    coupons: {
        icon: 'icon_url',
        discountType: 'discount_type',
        discountValue: 'discount_value',
        minAmount: 'minimum_amount',
        maxDiscount: 'maximum_discount',
        usageLimit: 'usage_limit',
        usedCount: 'used_count',
        order: 'sort_order',
        startDate: 'starts_at',
        endDate: 'ends_at',
        audienceDays: 'audience_days',
        scopeCategory: 'scope_category',
        active: 'is_active',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    orders: {
        userId: 'user_id',
        totalAmount: 'total_amount',
        shippingMethod: 'shipping_method',
        shippingCost: 'shipping_cost',
        address: 'shipping_address',
        postalCode: 'postal_code',
        couponCode: 'coupon_code',
        couponDiscountAmount: 'coupon_discount_amount',
        paymentGateway: 'payment_gateway',
        transactionId: 'transaction_id',
        paidAt: 'paid_at',
        deliveredAt: 'delivered_at',
        failureReason: 'failure_reason',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    audit_logs: {
        adminUid: 'admin_id',
        adminEmail: 'admin_email',
        entityType: 'entity_type',
        createdAt: 'created_at'
    }
};

function tableFor(name) {
    return tables[name] || name;
}

function fieldFor(table, field) {
    return fieldMaps[table]?.[field] || field;
}

function toDatabaseRow(table, value = {}) {
    const mapped = {};
    for (const [key, item] of Object.entries(value)) {
        if (table === 'profiles' && ['email', 'emailVerified', 'emailVerifiedCustom', 'date', 'orders'].includes(key)) continue;
        if (table === 'products' && ['breadcrumb', 'categoryPath'].includes(key)) continue;
        if (table === 'coupons' && ['valueLabel'].includes(key)) continue;
        if (table === 'orders' && key === 'items') continue;
        if (key === 'id' && table === 'products') continue;
        mapped[fieldFor(table, key)] = item;
    }
    return mapped;
}

function fromDatabaseRow(table, row) {
    if (!row) return null;
    const result = { ...row };
    for (const [legacy, column] of Object.entries(fieldMaps[table] || {})) {
        if (column in row) result[legacy] = row[column];
    }

    if (table === 'profiles') {
        result.uid = row.id;
        result.email = row.email || '';
        result.emailVerifiedCustom = Boolean(row.email_verified_at);
    } else if (table === 'products') {
        result.breadcrumb = row.category;
        result.categoryPath = row.category ? [row.category] : [];
    } else if (table === 'orders') {
        result.items = (row.order_items || []).map(item => ({
            ...item,
            productId: item.product_id,
            productName: item.product_name,
            selectedOptions: item.selected_options,
            qty: item.quantity,
            price: item.unit_price,
            color: item.selected_options?.color || ''
        }));
    } else if (table === 'store_settings') {
        return row.value;
    }

    return result;
}

function snapshot(table, row, id) {
    const value = fromDatabaseRow(table, row);
    return {
        id: id ?? row?.id ?? row?.user_id ?? row?.key,
        exists: () => value !== null,
        data: () => value
    };
}

function fail(error) {
    if (error) throw error;
}

function refTable(ref) {
    return tableFor(ref.name);
}

export function dbDoc(_client, name, id) {
    return { kind: 'document', name, id };
}

export function dbCollection(_client, name) {
    return { kind: 'collection', name };
}

export function dbOrderBy(field, direction = 'asc') {
    return { kind: 'order', field, direction };
}

export function dbWhere(field, operator, value) {
    return { kind: 'filter', field, operator, value };
}

export function dbLimit(count) {
    return { kind: 'limit', count };
}

export function dbStartAfter(cursor) {
    return { kind: 'cursor', cursor };
}

export function dbQuery(reference, ...constraints) {
    return { kind: 'query', reference, constraints };
}

async function fetchRow(table, id) {
    let query = supabaseClient.from(table).select(table === 'orders' ? '*, order_items(*)' : '*');
    if (table === 'store_settings') query = query.eq('key', id);
    else if (table === 'user_roles') query = query.eq('user_id', id).eq('role', 'admin');
    else query = query.eq('id', id);
    return query.maybeSingle();
}

export async function dbGetDoc(ref) {
    const table = refTable(ref);
    const { data, error } = await fetchRow(table, ref.id);
    fail(error);
    return snapshot(table, data, ref.id);
}

export async function dbGetDocs(ref) {
    const queryRef = ref.kind === 'query' ? ref : { reference: ref, constraints: [] };
    const table = refTable(queryRef.reference);
    let query = supabaseClient.from(table).select(table === 'orders' ? '*, order_items(*)' : '*');
    let pageLimit = null;

    for (const constraint of queryRef.constraints) {
        if (constraint.kind === 'filter') {
            const column = fieldFor(table, constraint.field);
            const operators = {
                '==': 'eq',
                '!=': 'neq',
                '>': 'gt',
                '>=': 'gte',
                '<': 'lt',
                '<=': 'lte'
            };
            const method = operators[constraint.operator];
            if (!method) throw new Error(`Unsupported database filter: ${constraint.operator}`);
            query = query[method](column, constraint.value);
        } else if (constraint.kind === 'order') {
            const column = fieldFor(table, constraint.field);
            query = query.order(column, { ascending: constraint.direction !== 'desc' });
        } else if (constraint.kind === 'limit') {
            pageLimit = constraint.count;
        } else if (constraint.kind === 'cursor') {
            const order = queryRef.constraints.find(item => item.kind === 'order');
            if (order && constraint.cursor?.data) {
                const cursorData = constraint.cursor.data();
                const column = fieldFor(table, order.field);
                const method = order.direction === 'desc' ? 'lt' : 'gt';
                query = query[method](column, cursorData[column]);
            }
        }
    }

    if (pageLimit !== null) query = query.limit(pageLimit);
    const { data, error } = await query;
    fail(error);
    const docs = (data || []).map(row => snapshot(table, row));
    return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach(callback) {
            docs.forEach(callback);
        }
    };
}

export async function dbSetDoc(ref, value) {
    const table = refTable(ref);
    if (table === 'store_settings') {
        const { error } = await supabaseClient.from(table).upsert({
            key: ref.id,
            value,
            updated_at: new Date().toISOString()
        });
        fail(error);
        return;
    }

    const row = toDatabaseRow(table, value);
    if (table === 'profiles') row.id = ref.id;
    const { error } = await supabaseClient.from(table).upsert(row);
    fail(error);
}

export async function dbAddDoc(ref, value) {
    const table = refTable(ref);
    if (table === 'orders') {
        const { data, error } = await supabaseClient.rpc('create_checkout_order', {
            p_idempotency_key: value.idempotencyKey,
            p_shipping_method: value.shippingMethod,
            p_shipping_address: value.address,
            p_postal_code: value.postalCode || '',
            p_coupon_code: value.couponCode || null,
            p_items: value.items
        });
        fail(error);
        return { kind: 'document', name: ref.name, id: data };
    }

    const { data, error } = await supabaseClient
        .from(table)
        .insert(toDatabaseRow(table, value))
        .select('id')
        .single();
    fail(error);
    return { kind: 'document', name: ref.name, id: data.id };
}

export async function dbUpdateDoc(ref, value) {
    const table = refTable(ref);
    const row = toDatabaseRow(table, value);
    const key = table === 'store_settings' ? 'key' : table === 'user_roles' ? 'user_id' : 'id';
    const keyValue = table === 'store_settings' ? ref.id : ref.id;
    let query = supabaseClient.from(table).update(row).eq(key, keyValue);
    if (table === 'user_roles') query = query.eq('role', 'admin');
    const { data, error } = await query.select(key).maybeSingle();
    fail(error);
    if (!data) throw new Error('The requested record was not found or cannot be updated');
}

export async function dbDeleteDoc(ref) {
    const table = refTable(ref);
    if (table === 'orders') {
        return dbUpdateDoc(ref, {
            status: 'failed_payment',
            failureReason: 'Cancelled by customer',
            updatedAt: new Date().toISOString()
        });
    }
    const key = table === 'store_settings' ? 'key' : 'id';
    const { data, error } = await supabaseClient.from(table).delete().eq(key, ref.id).select(key).maybeSingle();
    fail(error);
    if (!data) throw new Error('The requested record was not found or cannot be deleted');
}

export function dbWriteBatch() {
    const operations = [];
    return {
        update(ref, value) {
            operations.push({ action: 'update', ref, value });
        },
        delete(ref) {
            operations.push({ action: 'delete', ref });
        },
        async commit() {
            const products = operations.filter(item => refTable(item.ref) === 'products');
            if (products.length !== operations.length) {
                throw new Error('Bulk database operations are supported only for products');
            }

            for (const item of products) {
                if (item.action === 'update') {
                    await dbUpdateDoc(item.ref, item.value);
                } else {
                    await dbDeleteDoc(item.ref);
                }
            }
        }
    };
}

export function dbOnAuthStateChanged(_auth, callback) {
    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
        const user = session?.user || null;
        authState.currentUser = user;
        callback(user ? {
            ...user,
            uid: user.id,
            displayName: user.user_metadata?.name || user.user_metadata?.full_name || ''
        } : null);
    });
    return data.subscription;
}

export async function dbSignOut() {
    const { error } = await supabaseClient.auth.signOut();
    fail(error);
}

export async function dbSignInWithEmailAndPassword(_auth, email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    fail(error);
    return data;
}

window.supabaseClient = supabaseClient;
window.dbAuth = authState;
window.dbDoc = dbDoc;
window.dbCollection = dbCollection;
window.dbOrderBy = dbOrderBy;
window.dbWhere = dbWhere;
window.dbLimit = dbLimit;
window.dbStartAfter = dbStartAfter;
window.dbQuery = dbQuery;
window.dbGetDoc = dbGetDoc;
window.dbGetDocs = dbGetDocs;
window.dbSetDoc = dbSetDoc;
window.dbAddDoc = dbAddDoc;
window.dbUpdateDoc = dbUpdateDoc;
window.dbDeleteDoc = dbDeleteDoc;
window.dbWriteBatch = dbWriteBatch;
window.dbOnAuthStateChanged = dbOnAuthStateChanged;
window.dbSignOut = dbSignOut;
window.dbSignInWithEmailAndPassword = dbSignInWithEmailAndPassword;
window.dispatchEvent(new Event('supabase-ready'));
