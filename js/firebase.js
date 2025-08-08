// === Firebase v12.0.0 Setup ===
// Load firebase-app.js and firebase-database.js via script tags in HTML
// This file only handles the config and database initialization

const firebaseConfig = {
  apiKey: "AIzaSyDTdHtVfci5pWDZtw6HYNWxnt8w4HJ_CVg",
  authDomain: "mintcha-pos-upgrade.firebaseapp.com",
  projectId: "mintcha-pos-upgrade",
  storageBucket: "mintcha-pos-upgrade.appspot.com",
  messagingSenderId: "707430710153",
  appId: "1:707430710153:web:daa6aa30d8651e342d3f58",
  databaseURL: "https://mintcha-pos-upgrade-default-rtdb.firebaseio.com" // ✅ Important for Realtime Database
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Realtime Database and export it globally
const db = firebase.database();
