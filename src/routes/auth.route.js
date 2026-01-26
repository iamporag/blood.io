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
      return res.status(400).json({ message: "Email, password, and name are required", result: null });
    }

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      return res.status(400).json({ message: "User already exists", result: null });
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
      message: "Registration successful. Waiting for admin approval",
      result: profile,
    });
  } catch (error) {
    console.error("🔥 Registration Error:", error);
    res.status(500).json({ message: "Failed to register user", result: null });
  }
});

// ------------------ LOGIN ------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ BASIC VALIDATION
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // 2️⃣ CHECK USER EXISTS (ADMIN SDK)
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (err) {
      return res.status(404).json({
        message: "User not registered",
      });
    }

    // 3️⃣ FIREBASE AUTH LOGIN
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    // 4️⃣ AUTH ERRORS (SECURE HANDLING)
    if (data.error) {
      return res.status(401).json({
        message: "Invalid password",
      });
    }


    const uid = userRecord.uid;

    // 5️⃣ CHECK FIRESTORE USER
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        message: "User data not found",
      });
    }

    if (userDoc.data().status !== "approved") {
      return res.status(403).json({
        message: "Account not approved",
      });
    }

    // 6️⃣ CREATE 7-DAY SESSION COOKIE
    const expiresIn = 7 * 24 * 60 * 60 * 1000;

    const sessionCookie = await admin
      .auth()
      .createSessionCookie(data.idToken, { expiresIn });

    // 7️⃣ SUCCESS RESPONSE
    res.json({
      message: "Login successful",
      result: {
        access_token: sessionCookie,
        expires_in: expiresIn,
        user: {
          uid,
          ...userDoc.data(),
        },
      },
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({
      message: "Login failed",
    });
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

    res.json({
      message: "Profile fetched successfully",
      result: { uid, ...userDoc.data() }
    });
  } catch (error) {
    console.error("🔥 Profile Error:", error);
    res.status(500).json({ message: "Failed to fetch Profile", result: res.body });
  }
});

module.exports = router;
