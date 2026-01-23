const admin = require("firebase-admin");

require("dotenv").config();


console.log("🔥 Loading Firebase config...");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

console.log("✅ Firebase initialized successfully");

module.exports = { admin, db };
