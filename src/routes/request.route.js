const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { db } = require("../config/firebase");
const admin = require("firebase-admin");

// ------------------ Helper ------------------
function sanitizeTopic(str) {
  return str.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

// ------------------ CREATE BLOOD REQUEST ------------------
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { patientName, bloodGroup, district, hospital, contact, note } = req.body;

    // Validate required fields
    if (!patientName || !bloodGroup || !district || !hospital) {
      return res.status(400).json({
        message: "Required fields are missing",
        result: null,
      });
    }

    // Save blood request
    await db.collection("blood_requests").add({
      patientName,
      bloodGroup,
      bloodGroupLower: bloodGroup.toLowerCase(),
      district,
      districtLower: district.toLowerCase(),
      hospital,
      contact: contact || null,
      note: note || null,
      createdBy: uid,
      createdAt: new Date(),
    });

    console.log("🚀 Sending notification to topic: all_users");

    // SEND NOTIFICATION (IMPORTANT FIX HERE)
    const response = await admin.messaging().send({
      topic: "all_users",
      notification: {
        title: "🩸 Urgent Blood Needed",
        body: `${bloodGroup} blood needed at ${hospital}, ${district}`,
      },
      data: {
        type: "blood_request",
        bloodGroup,
        district,
        hospital,
      },
    });

    console.log("✅ FCM RESPONSE:", response);

    res.json({
      message: "Blood request created and notification sent successfully",
      result: null,
    });

  } catch (error) {
    console.error("🔥 Error in /create:", error);
    res.status(500).json({
      message: error.message,
      result: null,
    });
  }
});



// ------------------ LIST BLOOD REQUESTS ------------------
router.get("/list", async (req, res) => {
  try {
    let { district, bloodGroup } = req.query;

    let query = db.collection("blood_requests");

    if (district) {
      query = query.where("districtLower", "==", district.toLowerCase());
    }

    if (bloodGroup) {
      query = query.where("bloodGroupLower", "==", bloodGroup.toLowerCase());
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json({ total: data.length, message: "Blood requests fetched successfully", result: data });
  } catch (error) {
    console.error("🔥 Error in /list:", error);
    res.status(500).json({ message: error.message, result: null });
  }
});

module.exports = router;
