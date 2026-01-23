const admin = require("firebase-admin");
const path = require("path");

console.log("🔥 Loading Firebase config...");

const serviceAccount = require(path.join(__dirname, "../../serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
console.log("✅ Firebase initialized, db created");

module.exports = { admin, db };  // ✅ export BOTH admin and db
