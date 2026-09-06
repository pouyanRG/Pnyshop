// =============================================
// FIREBASE BRIDGE — اختصاصی admin.html
// -----------------------------------------------
// جدا از Js/firebase-bridge.js نگه داشته شده چون امضای متفاوتی نیاز
// دارد: signInWithEmailAndPassword/signOut برای ورود ادمین، و
// writeBatch برای عملیات گروهی (bulk category-change / bulk-delete).
// admin.js (منطق اصلی پنل) از window.fb* همین فایل استفاده می‌کند.
// =============================================
import { auth, db } from './firebase-config.js';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, limit, startAfter, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

window.fbAuth = auth;
window.fbDb = db;
window.fbOnAuthStateChanged = onAuthStateChanged;
window.fbSignInWithEmailAndPassword = signInWithEmailAndPassword;
window.fbSignOut = signOut;
window.fbDoc = doc;
window.fbGetDoc = getDoc;
window.fbSetDoc = setDoc;
window.fbCollection = collection;
window.fbGetDocs = getDocs;
window.fbAddDoc = addDoc;
window.fbUpdateDoc = updateDoc;
window.fbDeleteDoc = deleteDoc;
window.fbQuery = query;
window.fbOrderBy = orderBy;
window.fbLimit = limit;
window.fbStartAfter = startAfter;
// FIX: قبلاً عملیات گروهی (bulk category-change/bulk-delete) با یک حلقه‌ی
// for..of و await های پشت‌سرهم انجام می‌شد؛ یعنی نه اتمیک بود (در صورت قطع
// شبکه وسط کار، بخشی از کالاها تغییر می‌کردند و بخشی نه) و نه سریع (هر
// نوشتن منتظر پاسخ نوشتن قبلی می‌ماند). writeBatch این دو مشکل را حل می‌کند.
window.fbWriteBatch = writeBatch;
window.dispatchEvent(new Event('firebase-ready'));
