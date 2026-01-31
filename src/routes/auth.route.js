const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../config/firebase");

require("dotenv").config();

const authMiddleware = require("../middleware/auth.middleware");
const { sendVerificationEmail } = require("../services/mail.service");


function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


// ------------------ REGISTER ------------------
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirm_password, } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name are required", result: null });
    }
    if (!email) {
      return res.status(400).json({ message: "Email are required", result: null });
    }
    if (!password) {
      return res.status(400).json({ message: "Password are required", result: null });
    }
    if (!confirm_password) {
      return res.status(400).json({ message: "Confirm password are required", result: null });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ message: "Passwords do not match", result: null });
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
      emailVerified: false,
    });

    // Generate OTP
    const verificationCode = generateOTP();

    // Create Firestore profile with pending status
    const profile = {
      name,
      email,
      status: "pending", // must be approved by admin
      isDoner: false,
      emailVerified: false,
      verificationCode,
      codeExpiresAt: Date.now() + 10 * 60 * 1000,
      lastOtpSentAt: Date.now(),
      createdAt: new Date().toISOString(),
    };

    await db.collection("users").doc(userRecord.uid).set(profile);
    // TODO: Send email here
    sendVerificationEmail(email, verificationCode);

    res.json({
      message: "Registration successful. Verification code sent to email",
      result: {
        uid: userRecord.uid,
        email,
        emailVerified: false,
      },
    });
  } catch (error) {
    console.error("🔥 Registration Error:", error);
    res.status(500).json({ message: "Failed to register user", result: null });
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
    const userDocRef = db.collection("users").doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        message: "User data not found",
      });
    }

if (
  userDoc.data().status !== "active" &&
  userRecord.emailVerified === false // ✅ use userRecord here
) {
  return res.status(403).json({
    message: "Please verify your email to activate your account",
    result: {
      uid: userRecord.uid,  
      emailVerified: userRecord.emailVerified, 
    },
  });
}


    // 6️⃣ SAVE DEVICE TOKEN (if provided)
    if (deviceToken) {
      await userDocRef.update({
        deviceToken: deviceToken,
        updatedAt: new Date(),
      });
    }

    // 7️⃣ CREATE 7-DAY SESSION COOKIE
    const expiresIn = 7 * 24 * 60 * 60 * 1000;

    const sessionCookie = await admin
      .auth()
      .createSessionCookie(data.idToken, { expiresIn });

    // 8️⃣ SUCCESS RESPONSE
    res.json({
      message: "Login successful",
      result: {
        access_token: sessionCookie,
        expires_in: expiresIn,
        user: {
          uid,
          ...userDoc.data(),
          deviceToken: deviceToken || userDoc.data().deviceToken || null,
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


router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    // Find user in Firebase Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (_) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const userRef = db.collection("users").doc(userRecord.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        message: "User profile not found",
      });
    }

    const user = userSnap.data();

    // Already verified?
    if (user.emailVerified) {
      return res.status(400).json({
        message: "Email already verified",
      });
    }

    // ⏱️ COOLDOWN (60 sec)
    const now = Date.now();
    if (user.lastOtpSentAt && now - user.lastOtpSentAt < 60 * 1000) {
      const waitTime = Math.ceil((60 * 1000 - (now - user.lastOtpSentAt)) / 1000);
      return res.status(429).json({
        message: `Please wait ${waitTime} seconds before requesting a new code`,
      });
    }

    // 🔢 Generate new OTP
    const newOtp = generateOTP();

    // 🔄 Update Firestore
    await userRef.update({
      verificationCode: newOtp,
      codeExpiresAt: now + 10 * 60 * 1000,
      lastOtpSentAt: now,
    });

    // 📩 Send email
    await sendVerificationEmail(user.email, newOtp);

    res.json({
      message: "A new verification code has been sent to your email",
    });

  } catch (error) {
    console.error("🔥 Resend OTP Error:", error);
    res.status(500).json({
      message: "Failed to resend verification code",
    });
  }
});



// Registration successful. Waiting for admin approval
router.post("/verify-email", async (req, res) => {
  try {
    const { uid, code } = req.body;

    if (!uid || !code) {
      return res.status(400).json({ message: "UID and code required", result: null });
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ message: "User not found", result: null });
    }

    const user = userSnap.data();
        // ✅ Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({
        message: "Email already verified",
        result: null
      });
    }


    if (user.verificationCode !== code) {
      return res.status(400).json({ message: "Invalid verification code", result: null });
    }

    if (Date.now() > user.codeExpiresAt) {
      return res.status(400).json({ message: "Verification code expired", result: null });
    }
    // Mark verified
    await admin.auth().updateUser(uid, {
      emailVerified: true,
    });

    await userRef.update({
      emailVerified: true,
      status: "active",
      verificationCode: admin.firestore.FieldValue.delete(),
      codeExpiresAt: admin.firestore.FieldValue.delete(),
      lastOtpSentAt: admin.firestore.FieldValue.delete(),
    });

    res.json({
      message: "Email verified successfully",
      result: null,
    });
  } catch (error) {
    console.error("🔥 Verify Email Error:", error);
    res.status(500).json({ message: "Failed to verify email", result: null });
  }
});


module.exports = router;
