// Firebase Configuration for Vibefling
// ----------------------------------------------------
// 1) Go to Firebase Console (https://console.firebase.google.com)
// 2) Project settings > Your apps > Web (</>) > Register app
// 3) Paste your configuration keys below, OR enter them in the app's setup modal.

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCLLtOyT-1ZMICPgV2kLXVlS928Arju--0",
  authDomain: "vibe-fling.firebaseapp.com",
  projectId: "vibe-fling",
  storageBucket: "vibe-fling.firebasestorage.app",
  messagingSenderId: "1020491553546",
  appId: "1:1020491553546:web:40dfc8c6c9287b489b78f3",
};

// Check if stored in localStorage from the UI setup dialog
export function getFirebaseConfig() {
  try {
    const saved = localStorage.getItem('vibefling_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.apiKey !== 'YOUR_API_KEY') {
        return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveFirebaseConfig(config) {
  localStorage.setItem('vibefling_firebase_config', JSON.stringify(config));
}

export function isFirebaseConfigured() {
  const cfg = getFirebaseConfig();
  return Boolean(
    cfg &&
    cfg.apiKey &&
    cfg.apiKey !== 'YOUR_API_KEY' &&
    cfg.projectId &&
    cfg.projectId !== 'YOUR_PROJECT'
  );
}

export const firebaseConfig = getFirebaseConfig();
