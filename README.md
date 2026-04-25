# Grett Engineering Solutions — Pay Order Tracker
## Setup & Deployment Guide

---

## Step 1 — Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add Project** → name it `grett-pay-tracker` (or anything you like)
3. Disable Google Analytics if you don't need it → **Create Project**

---

## Step 2 — Enable Authentication

1. In Firebase Console → **Build → Authentication → Get Started**
2. Under **Sign-in method**, enable **Email/Password**
3. Go to **Users → Add User**
4. Enter your email and a strong password → **Add User**
   - Only users you add here can log in. Nobody else can access the tracker.

---

## Step 3 — Create Firestore Database

1. In Firebase Console → **Build → Firestore Database → Create Database**
2. Choose **Start in production mode** → select a region close to Pakistan (e.g. `asia-south1` — Mumbai)
3. After it's created, go to the **Rules** tab
4. Replace the rules with the contents of `firestore.rules` from this project
5. Click **Publish**

---

## Step 4 — Get Your Firebase Config

1. In Firebase Console → **Project Settings** (gear icon) → **Your Apps**
2. Click **Add App → Web** → name it `grett-tracker` → **Register App**
3. Copy the `firebaseConfig` object shown
4. Open `js/firebase-config.js` in this project
5. Replace the placeholder values with your actual config values

Example:
```js
const firebaseConfig = {
  apiKey:            "AIzaSyABC123...",
  authDomain:        "grett-pay-tracker.firebaseapp.com",
  projectId:         "grett-pay-tracker",
  storageBucket:     "grett-pay-tracker.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

---

## Step 4.5 — Deploy Cloud Functions (admin claim sync)

Admin authorization is enforced via a Firebase Auth custom claim
(`admin: true`) which is mirrored from the `role` field on `users/{uid}`
by a Cloud Function. Deploy it once:

```
npm install -g firebase-tools           # if not already
firebase login
cd functions && npm install && cd ..
firebase deploy --only functions
firebase deploy --only firestore:rules
```

The function runs whenever a user doc is created or its `role` changes
and calls `admin.auth().setCustomUserClaims(uid, { admin: ... })`.
Existing admin users will need to sign out and back in once for their
ID token to pick up the new claim — the AuthContext also keeps the
user-doc role as a propagation-window fallback.

> Note: web Firebase API keys (the values in `.env.example`) are not
> secrets — they are public project identifiers. Security comes from
> Firestore rules and Auth, not from hiding the keys.

---

## Step 5 — Deploy to Netlify

1. Push this entire folder to a GitHub repository
   - Create a new repo on https://github.com (e.g. `grett-pay-tracker`) — make it **Private**
   - Upload all files or use Git:
     ```
     git init
     git add .
     git commit -m "Initial commit"
     git remote add origin https://github.com/YOUR_USERNAME/grett-pay-tracker.git
     git push -u origin main
     ```

2. Go to https://app.netlify.com → **Add New Site → Import from Git**
3. Connect your GitHub account → select the repo
4. Leave build settings empty (no build command needed)
5. Click **Deploy Site**
6. Once deployed, Netlify gives you a URL like `https://grett-tracker.netlify.app`
7. You can set a custom domain in Netlify settings if you have one

---

## Step 6 — Test It

1. Visit your Netlify URL
2. You should see the **Sign In** page
3. Enter the email and password you created in Firebase Authentication
4. You should land on the **Dashboard**

---

## Adding More Users

To give access to another person (e.g. an accountant or partner):
1. Firebase Console → Authentication → Users → Add User
2. Enter their email and a password
3. Share the credentials with them securely

---

## File Structure

```
grett-tracker/
├── index.html          ← Login page
├── dashboard.html      ← Main tracker (protected)
├── netlify.toml        ← Netlify routing config
├── firestore.rules     ← Firestore security rules
├── css/
│   └── style.css       ← All styles
└── js/
    ├── firebase-config.js  ← ⚠️ Fill this in with your config
    └── app.js              ← All app logic
```

---

## Security Notes

- Nobody can access the dashboard without logging in — Firebase Auth handles this
- Firestore rules block all reads/writes from unauthenticated requests
- Keep your GitHub repo **Private** so your Firebase config isn't publicly exposed
- Never share your Firebase config publicly
