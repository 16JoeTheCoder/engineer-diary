// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD3_b_SXpMkNqZ0VNJ3zjOhdd0VRZCOWbo",
  authDomain: "fuse-josef.firebaseapp.com",
  projectId: "fuse-josef",
  storageBucket: "fuse-josef.firebasestorage.app",
  messagingSenderId: "1073008091609",
  appId: "1:1073008091609:web:adece2846c5393c9e379c8",
  measurementId: "G-3212PDM0J6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);