// storage-sync.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ✅ Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDTdHtVfci5pWDZtw6HYNWxnt8w4HJ_CVg",
  authDomain: "mintcha-pos-upgrade.firebaseapp.com",
  databaseURL: "https://mintcha-pos-upgrade-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "mintcha-pos-upgrade",
  storageBucket: "mintcha-pos-upgrade.firebasestorage.app",
  messagingSenderId: "707430710153",
  appId: "1:707430710153:web:daa6aa30d8651e342d3f58"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ✅ Storage key
const STORE_KEY = "mintchaPOSData";

// Load from cloud → save to localStorage
async function syncFromCloud() {
  const snapshot = await get(ref(db, STORE_KEY));
  if (snapshot.exists()) {
    const cloudData = snapshot.val();
    localStorage.setItem(STORE_KEY, JSON.stringify(cloudData));
    console.log("✅ Synced from cloud:", cloudData);
  }
}

// Save from localStorage → to cloud
function syncToCloud() {
  const localData = localStorage.getItem(STORE_KEY);
  if (localData) {
    set(ref(db, STORE_KEY), JSON.parse(localData));
    console.log("✅ Synced to cloud:", JSON.parse(localData));
  }
}

// Override localStorage.setItem for auto-sync
const originalSetItem = localStorage.setItem;
localStorage.setItem = function (key, value) {
  originalSetItem.apply(this, arguments);
  if (key === STORE_KEY) {
    syncToCloud();
  }
};

// Initial load from cloud
syncFromCloud();

// Auto-sync every 30 seconds
setInterval(syncFromCloud, 30000);
