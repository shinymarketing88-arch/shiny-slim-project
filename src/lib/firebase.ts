import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCRzerWEnFDmPcCcRCETsMlp8WdAT0k90E",
  authDomain: "shiny-slim-project.firebaseapp.com",
  projectId: "shiny-slim-project",
  storageBucket: "shiny-slim-project.firebasestorage.app",
  messagingSenderId: "54178644265",
  appId: "1:54178644265:web:c5a1ccf91a0d3b5ab2b738"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
