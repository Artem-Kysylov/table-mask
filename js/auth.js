/**
 * TableMask Auth — Syntax Labs
 * Firebase Auth (Google Sign-In) via ESM CDN
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: 'AIzaSyAohwGS6V3OWbTxkXd_g497nl8NVqWKolk',
    authDomain: 'tablemask.firebaseapp.com',
    projectId: 'tablemask',
    storageBucket: 'tablemask.firebasestorage.app',
    messagingSenderId: '677700955959',
    appId: '1:677700955959:web:69725b4da30612f4d274b2'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
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

async function syncUserInDatabase(user) {
    const userRef = doc(db, 'users', user.uid);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
        return docSnap.data();
    }

    const newUser = {
        uid: user.uid,
        email: user.email,
        createdAt: new Date().toISOString(),
        isPro: false
    };

    await setDoc(userRef, newUser);
    return newUser;
}

export { auth, loginWithGoogle, logoutUser, onAuthChange, syncUserInDatabase };
