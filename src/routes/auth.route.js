const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../config/firebase");

require("dotenv").config();

const authMiddleware = require("../middleware/auth.middleware");

// ------------------ REGISTER ------------------
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, age, bloodGroup, district, lastDonationDate, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: "Email, password, and name are required" });
    }

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      return res.status(400).json({ success: false, message: "User already exists" });
    } catch (_) {
      // user does not exist → OK
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: phone || undefined,
    });

    // Create Firestore profile with pending status
    const profile = {
      name,
      email,
      phone: phone || null,
      age: age || null,
      bloodGroup: bloodGroup || null,
      district: district || null,
      lastDonationDate: lastDonationDate || null,
      status: "pending", // must be approved by admin
      isDoner: false,
      createdAt: new Date(),
    };

    await db.collection("users").doc(userRecord.uid).set(profile);

    res.json({
      success: true,
      message: "Registration successful. Waiting for admin approval",
      body: profile,
    });
  } catch (error) {
    console.error("🔥 Registration Error:", error);
    res.status(500).json({ success: false, message: "Failed to register user" });
  }
});

// ------------------ LOGIN ------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    // Use Firebase REST API to get ID token
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(401).json({ success: false, message: data.error.message });
    }

    // data.idToken is what /login expects
    res.json({ success: true, idToken: data.idToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});


// ------------------ GET LOGGED-IN USER ------------------
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists || userDoc.data().status !== "approved") {
      return res.status(403).json({ success: false, message: "Account not approved by admin" });
    }

    res.json({ success: true, message: "User fetched", body: userDoc.data() });
  } catch (error) {
    console.error("🔥 Get Me Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
});

module.exports = router;
