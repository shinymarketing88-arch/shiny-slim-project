import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const metaEnv = (import.meta as any).env || {};

export const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || '',
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "shiny-slim-project.firebaseapp.com",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "shiny-slim-project",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "shiny-slim-project.firebasestorage.app",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "54178644265",
  appId: metaEnv.VITE_FIREBASE_APP_ID || "1:54178644265:web:c5a1ccf91a0d3b5ab2b738"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
