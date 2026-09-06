// =============================================
// FIREBASE CONFIGURATION & INITIALIZATION
// این فایل نقطه‌ی مرکزی اتصال به Firebase است.
// همه‌ی صفحات (login.html, DigiKala.html, checkout.html, ...) این فایل را import می‌کنند.
//
// وقتی در آینده بخواهیم تنظیمات Firebase تغییر کند،
// فقط همین یک فایل ویرایش می‌شود، نه تک‌تک صفحات.
// =============================================

// وارد کردن توابع مورد نیاز از Firebase SDK (نسخه‌ی Modular v12، مطابق نسخه‌ای که کنسول ارائه داد)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

// تنظیمات پروژه‌ی Firebase (pnyshops)
// این مقادیر محرمانه نیستند؛ امنیت واقعی توسط Firestore Security Rules تأمین می‌شود.
const firebaseConfig = {
  apiKey: "AIzaSyB4W1K7UJnWLfr0gNYYOHg-dlcdkd4szeI",
  authDomain: "pnyshops.firebaseapp.com",
  projectId: "pnyshops",
  storageBucket: "pnyshops.firebasestorage.app",
  messagingSenderId: "395111932741",
  appId: "1:395111932741:web:2569f721fcd2e4af1d942c",
  measurementId: "G-KQG42FRWWQ"
};

// مقداردهی اولیه‌ی اپ Firebase
const app = initializeApp(firebaseConfig);

// ساخت instance های Authentication و Firestore
// این دو، چیزهایی هستند که در بقیه‌ی فایل‌ها import می‌کنیم:
//   import { auth, db } from "./Js/firebase-config.js";
const auth = getAuth(app);
const db = getFirestore(app);
// instance مربوط به Firebase Storage (برای آپلود تصاویر محصولات/اسلایدها به‌جای ذخیره base64 در Firestore)
const storage = getStorage(app);

// خروجی گرفتن تا فایل‌های دیگر بتوانند از این‌ها استفاده کنند
export { app, auth, db, storage };
