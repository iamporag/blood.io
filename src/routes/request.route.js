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
router.post("/", authMiddleware, async (req, res) => {
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
  const docRef =  await db.collection("blood_requests").add({
      patientName,
      bloodGroup,
      district,
      hospital,
      contact: contact || null,
      note: note || null,
      createdBy: uid,
      createdAt:  new Date().toISOString(),
    });

        // ------------------ Create Notification ------------------
    const notificationData = {
      type: "blood_request",
      bloodRequestId: docRef.id,
      title: "🩸 Urgent Blood Needed",
      body: `${bloodGroup} blood needed at ${hospital}, ${district}`,
      createdAt: new Date().toISOString(),
      isRead: false, // default unread
    };

    await db.collection("notifications").add(notificationData);

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
router.get("/", async (req, res) => {
  try {
    let { district, bloodGroup, page, limit } = req.query;

    page = parseInt(page) || 1;      // default page 1
    limit = parseInt(limit) || 10;   // default 10 items per page
    const offset = (page - 1) * limit;

    let query = db.collection("blood_requests");

    if (district) query = query.where("district", "==", district.toLowerCase());
    if (bloodGroup) query = query.where("bloodGroup", "==", bloodGroup.toLowerCase());

    // Order by createdAt descending
    query = query.orderBy("createdAt", "desc");

    // ⚠ Firestore doesn't support offset efficiently for large data, but for small datasets it's okay
    const snapshot = await query.get();
    const allDocs = snapshot.docs;

    // Paginate manually
    const paginatedDocs = allDocs.slice(offset, offset + limit);

    const requests = [];

    for (const doc of paginatedDocs) {
      const data = doc.data();
      const userDoc = await db.collection("users").doc(data.createdBy).get();
      requests.push({
        id: doc.id,
        patientName: data.patientName,
        bloodGroup: data.bloodGroup,
        hospital: data.hospital,
        contact: data.contact || null,
        note: data.note || null,
        createdAt: data.createdAt,
      });
    }

    const totalPages = Math.ceil(allDocs.length / limit);
    const baseUrl = `${req.protocol}://${req.get("host")}${req.path}`;

    res.json({
      message: "Blood requests fetched successfully",
      result: requests,
      links: {
        first: `${baseUrl}?page=1&limit=${limit}`,
        last: `${baseUrl}?page=${totalPages}&limit=${limit}`,
        prev: page > 1 ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null,
        next: page < totalPages ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null,
      },
    });
  } catch (error) {
    console.error("🔥 Error in /list:", error);
    res.status(500).json({ message: error.message, result: null });
  }
});

// ------------------ GET BLOOD REQUEST BY ID ------------------
router.get("/:id", authMiddleware, async (req, res) => {
  try {
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

    // Fetch creator info
    const userDoc = await db.collection("users").doc(data.createdBy).get();
    const createdBy = userDoc.exists
      ? { uid: userDoc.id, name: userDoc.data().name }
      : { uid: data.createdBy, name: null };

    const result = {
      id: doc.id,
      patientName: data.patientName,
      bloodGroup: data.bloodGroup,
      district: data.district,
      hospital: data.hospital,
      contact: data.contact || null,
      note: data.note || null,
      createdAt: data.createdAt, // ISO string
      createdBy,
    };

    res.json({
      message: "Blood request fetched successfully",
      result,
    });
  } catch (error) {
    console.error("🔥 Error in GET /blood_requests/:id:", error);
    res.status(500).json({
      message: error.message,
      result: null,
    });
  }
});

module.exports = router;
