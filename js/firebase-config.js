// firebase-config.js — used by browser pages (onboarding, options)
// The firebase global is loaded by <script> tags in each HTML file before this module runs.

const firebaseConfig = {
    apiKey: "AIzaSyCItzc_DOEJQvr77DMXSlexTEDGTSNMHUQ",
    authDomain: "link-stach.firebaseapp.com",
    projectId: "link-stach",
    storageBucket: "link-stach.firebasestorage.app",
    messagingSenderId: "344277938908",
    appId: "1:344277938908:web:af1c2e687e71f7385cfa19",
    measurementId: "G-DNL5FPZ7FC"
};

// Guard against double-initialization if module is imported multiple times
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

export { auth, db };
