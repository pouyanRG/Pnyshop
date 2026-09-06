// =============================================
// FIREBASE BRIDGE (مشترک)
// -----------------------------------------------
// این فایل جایگزین بلوک‌های <script type="module"> تکراری‌ای می‌شود که
// قبلاً داخل هر یک از این صفحات به‌صورت جداگانه کپی شده بودند:
//   index.html, sabad.html, profile.html, checkout.html, product.html
// همه‌ی آن بریج‌ها عملاً همین مجموعه توابع را از firebase-config.js و
// Firebase SDK می‌گرفتند و روی window.fb* می‌گذاشتند تا اسکریپت اصلیِ
// غیر-ماژولِ هر صفحه (بدون تبدیل کامل به ماژول) بتواند از آن‌ها استفاده کند.
//
// ⚠️ نکته: login.html و admin.html به این فایل وصل نمی‌شوند چون
// امضای متفاوتی نیاز دارند (signInWithEmailAndPassword، GoogleAuthProvider،
// writeBatch و ...)؛ آن‌ها بریج اختصاصی خودشان را دارند
// (Js/login.js به‌صورت کامل، و Js/admin-bridge.js).
// =============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, getDocs, addDoc,
    query, orderBy, where, limit, startAfter, increment
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

window.fbAuth = auth;
window.fbDb = db;
window.fbOnAuthStateChanged = onAuthStateChanged;
window.fbSignOut = signOut;
window.fbDoc = doc;
window.fbGetDoc = getDoc;
window.fbSetDoc = setDoc;
window.fbUpdateDoc = updateDoc;
window.fbDeleteDoc = deleteDoc;
window.fbCollection = collection;
window.fbGetDocs = getDocs;
window.fbAddDoc = addDoc;
window.fbQuery = query;
window.fbOrderBy = orderBy;
window.fbWhere = where;
window.fbLimit = limit;
window.fbStartAfter = startAfter;
window.fbIncrement = increment;
window.dispatchEvent(new Event('firebase-ready'));
