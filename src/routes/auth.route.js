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

    if (!name) {
      return res.status(400).json({ message: "Name are required" });
    }
    if (!email) {
      return res.status(400).json({ message: "Email are required" });
    }

    await db.collection("users").doc(uid).set({
      name,
      email,
      emailVerified: false,
      profileComplete: false,
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
    if (!email) {
      return res.status(400).json({
        message: "Email are required",
      });
    }
    if (!password) {
      return res.status(400).json({
        message: "Password are required",
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
          uid: userRecord.uid,
          emailVerified: userRecord.emailVerified,
        },
      });
    }

    // 6️⃣ ADMIN APPROVAL CHECK
    if (userDoc.data().status !== "active") {
      await userDocRef.update({
        status: "active",
        updatedAt: new Date().toISOString(),
      });
    }

    // 7️⃣ SAVE DEVICE TOKEN
    if (deviceToken) {
      await userDocRef.update({
        deviceToken,
        updatedAt: new Date().toISOString(),
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


// ------------------ GET LOGGED-IN USER PROFILE ------------------
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists || userDoc.data().status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account not approved by admin"
      });
    }

    const userData = userDoc.data();

    // Count total requests created by user
    const requestsSnapshot = await db
      .collection("blood_requests")
      .where("createdBy", "==", uid)
      .get();
    const requestsCount = requestsSnapshot.size;

    // Count total booked by this user
    const bookedSnapshot = await db
      .collection("blood_requests")
      .where("donor.uid", "==", uid)
      .get();
    const bookedCount = bookedSnapshot.size;

    // Count total completed by this user
    const completedSnapshot = await db
      .collection("blood_requests")
      .where("donor.uid", "==", uid)
      .where("status", "==", "completed")
      .get();
    const completedCount = completedSnapshot.size;

    res.json({
      message: "Profile fetched successfully",
      result: {
        uid,
        name: userData.name,
        email: userData.email,
        dateOfBirth: userData.dateOfBirth,
        contact: userData.contact || null,
        bloodGroup: userData.bloodGroup || null,
        bloodDonatedCount: userData.bloodDonatedCount || 0,
        requestsCount,
        bookedCount,
        completedCount,
        lastDonatedDate: userData.lastDonatedDate || null,
        profileComplete: userData.profileComplete,
        address: userData.address || {},
        createdAt: userData.createdAt,
      }
    });
  } catch (error) {
    console.error("🔥 Profile Error:", error);
    res.status(500).json({ message: "Failed to fetch Profile", result: null });
  }
});


// ------------------ VALIDATION FUNCTIONS ------------------

// Validate name (string, min 2 chars)
function validateName(name) {
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return "Name must be at least 2 characters long";
  }
  return null;
}

// Validate date of birth (YYYY-MM-DD) and age >= 18
function validateDateOfBirth(dobStr) {
  if (!dobStr) return "Date of birth is required";

  const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dobRegex.test(dobStr)) return "Invalid date of birth format (YYYY-MM-DD)";

  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  if (age < 18) return "User must be at least 18 years old";

  return null;
}

// Validate contact (Bangladesh phone number)
function validateContact(contact) {
  if (!contact) return "Contact is required";

  const phoneRegex = /^01[3-9]\d{8}$/;
  if (!phoneRegex.test(contact)) return "Invalid contact number";

  return null;
}

// Validate blood group
function validateBloodGroup(bloodGroup) {
  const validGroups = ["a+", "a-", "b+", "b-", "ab+", "ab-", "o+", "o-"];
  if (!bloodGroup) return "Blood group is required";

  if (!validGroups.includes(bloodGroup.trim().toLowerCase())) {
    return "Invalid blood group";
  }

  return null;
}

// Validate address
function validateAddress(address) {
  if (!address || typeof address !== "object") {
    return "Address must be provided as an object";
  }
  if (!address.line1 || !address.city || !address.state) {
    return "Address must include line1, city, and state";
  }
  return null;
}


// ------------------ UPDATE LOGGED-IN USER PROFILE ------------------
router.post("/me", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { name, dateOfBirth, contact, bloodGroup, address } = req.body;

    // ------------------ VALIDATION ------------------
    const errors = [];

    const nameError = validateName(name);
    if (nameError) errors.push(nameError);

    const dobError = validateDateOfBirth(dateOfBirth);
    if (dobError) errors.push(dobError);

    const contactError = validateContact(contact);
    if (contactError) errors.push(contactError);

    const bgError = validateBloodGroup(bloodGroup);
    if (bgError) errors.push(bgError);

    const addressError = validateAddress(address);
    if (addressError) errors.push(addressError);

    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    // ------------------ UPDATE DATA ------------------
    const updateData = {
      name: name.trim(),
      dateOfBirth,
      contact: contact.trim(),
      bloodGroup: bloodGroup.trim().toLowerCase(),
      address: {
        line1: address.line1,
        line2: address.line2 || "",
        city: address.city,
        state: address.state,
      },
      profileComplete: true, // mark profile as complete
    };

    await db.collection("users").doc(uid).update(updateData);

    // Fetch updated data
    const updatedUser = await db.collection("users").doc(uid).get();
    const data = updatedUser.data();

    res.json({
      message: "Profile updated successfully",
      result: {
        uid,
        name: data.name,
        dateOfBirth: data.dateOfBirth,
        contact: data.contact,
        bloodGroup: data.bloodGroup,
        address: data.address || {},
        bloodDonatedCount: data.bloodDonatedCount || 0,
        createdAt: data.createdAt,
      },
    });

  } catch (error) {
    console.error("🔥 Profile Update Error:", error);
    res.status(500).json({
      message: "Failed to update profile",
      result: null,
    });
  }
});






// ------------------ GET LOGGED-IN USER'S BLOOD REQUESTS (LIST) ------------------
router.get("/me/requests", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid; // Logged-in user UID
    let { page, limit } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    // Fetch all blood requests created by this user
    let query = db.collection("blood_requests")
      .where("createdBy", "==", uid)
      .orderBy("createdAt", "desc");

    const snapshot = await query.get();
    const allDocs = snapshot.docs;

    const paginatedDocs = allDocs.slice(offset, offset + limit);

    const requests = paginatedDocs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        patientName: data.patientName,
        bloodGroup: data.bloodGroup,
        hospital: data.hospital,
        status: data.status || "pending",
        createdAt: data.createdAt,
      };
    });

    const totalPages = Math.ceil(allDocs.length / limit);
    const baseUrl = `${req.protocol}://${req.get("host")}${req.path}`;

    res.json({
      message: "Your blood requests fetched successfully",
      result: requests,
      links: {
        first: `${baseUrl}?page=1&limit=${limit}`,
        last: `${baseUrl}?page=${totalPages}&limit=${limit}`,
        prev: page > 1 ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null,
        next: page < totalPages ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null,
      },
    });

  } catch (error) {
    console.error("🔥 Error in /auth/me/requests:", error);
    res.status(500).json({ message: error.message, result: null });
  }
});


// ------------------ GET LOGGED-IN USER'S SINGLE BLOOD REQUEST (DETAIL VIEW) ------------------
router.get("/me/requests/:id", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid; // Logged-in user UID
    const { id } = req.params;

    const docRef = db.collection("blood_requests").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        message: "Blood request not found",
        result: null,
      });
    }

    const data = doc.data();

    // Check ownership
    if (data.createdBy !== uid) {
      return res.status(403).json({
        message: "You do not have permission to view this request",
        result: null,
      });
    }

    // Fetch donor info if booked
    const donorInfo = data.donor
      ? { uid: data.donor.uid, name: data.donor.name, bookedAt: data.donor.bookedAt }
      : null;

    const result = {
      id: doc.id,
      patientName: data.patientName,
      bloodGroup: data.bloodGroup,
      unit: data.unit || 1,
      hospital: data.hospital,
      contact: data.contact || null,
      address: data.address || null,
      note: data.note || null,
      status: data.status || "pending",
      donor: donorInfo,
      createdAt: data.createdAt,
    };

    res.json({
      message: "Blood request details fetched successfully",
      result,
    });
  } catch (error) {
    console.error("🔥 Error in /auth/me/requests/:id:", error);
    res.status(500).json({ message: error.message, result: null });
  }
});



module.exports = router;
