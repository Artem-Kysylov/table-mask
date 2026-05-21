/**
 * TableMask Auth — Syntax Labs
 * Firebase Auth (Google Sign-In) via ESM CDN
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyAohwGS6V3OWbTxkXd_g497nl8NVqWKolk',
    authDomain: 'tablemask.firebaseapp.com',
    projectId: 'tablemask',
    storageBucket: 'tablemask.firebasestorage.app',
    messagingSenderId: '677700955959',
    appId: '1:677700955959:web:69725b4da30612f4d274b2'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

async function loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
}

async function logoutUser() {
    await signOut(auth);
}

function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

export { auth, loginWithGoogle, logoutUser, onAuthChange };
