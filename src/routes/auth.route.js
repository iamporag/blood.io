const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../config/firebase");

require("dotenv").config();

const authMiddleware = require("../middleware/auth.middleware");

// ------------------ REGISTER ------------------
router.post("/register", async (req, res) => {
  try {
    const { uid, name, email } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ message: "Invalid data" });
    }

    await db.collection("users").doc(uid).set({
      name,
      email,
      emailVerified: false,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    res.json({
      message: "User profile saved",
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to save user" });
  }
});



// ------------------ LOGIN ------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password, deviceToken } = req.body;

    // 1️⃣ BASIC VALIDATION
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // 2️⃣ CHECK USER EXISTS
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (_) {
      return res.status(404).json({
        message: "User not registered",
      });
    }

    // 3️⃣ LOGIN WITH FIREBASE REST API
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

    if (data.error) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const uid = userRecord.uid;

    // 4️⃣ GET FIRESTORE USER
    const userDocRef = db.collection("users").doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        message: "User profile not found",
      });
    }

    // 5️⃣ EMAIL VERIFICATION CHECK (🔥 IMPORTANT)
    if (!userRecord.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email before login",
        result: {
          uid,
          emailVerified: false,
        },
      });
    }

    // 6️⃣ ADMIN APPROVAL CHECK
    if (userDoc.data().status !== "active") {
      return res.status(403).json({
        message: "Your account is pending admin approval",
      });
    }

    // 7️⃣ SAVE DEVICE TOKEN
    if (deviceToken) {
      await userDocRef.update({
        deviceToken,
        updatedAt: new Date(),
      });
    }

    // 8️⃣ CREATE SESSION COOKIE
    const expiresIn = 7 * 24 * 60 * 60 * 1000;
    const sessionCookie = await admin
      .auth()
      .createSessionCookie(data.idToken, { expiresIn });

    // 9️⃣ SUCCESS RESPONSE
    res.json({
      message: "Login successful",
      result: {
        access_token: sessionCookie,
        expires_in: expiresIn,
        user: {
          uid,
          ...userDoc.data(),
          deviceToken: deviceToken || null,
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
