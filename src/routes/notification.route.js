const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { db } = require("../config/firebase");
const admin = require("firebase-admin");

// ------------------ GET NOTIFICATIONS ------------------
router.get("/", authMiddleware, async (req, res) => {
  try {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    let query = db.collection("notifications").orderBy("createdAt", "desc");

    const snapshot = await query.get();
    const allDocs = snapshot.docs;

    // Apply pagination
    const paginatedDocs = allDocs.slice(offset, offset + limit);

    const notifications = paginatedDocs.map(doc => ({ id: doc.id, ...doc.data() }));

    const totalPages = Math.ceil(allDocs.length / limit);
    const baseUrl = `${req.protocol}://${req.get("host")}${req.path}`;

    res.json({
      message: "Notifications fetched successfully",
      result: notifications,
      links: {
        first: `${baseUrl}?page=1&limit=${limit}`,
        last: `${baseUrl}?page=${totalPages}&limit=${limit}`,
        prev: page > 1 ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null,
        next: page < totalPages ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null,
      },
    });

  } catch (error) {
    console.error("🔥 Notification List Error:", error);
    res.status(500).json({ message: error.message, result: null });
  }
});


// ------------------ MARK NOTIFICATION AS READ ------------------
router.patch("/:id/read", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const docRef = db.collection("notifications").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Notification not found", result: null });
    }

    await docRef.update({ isRead: true });

    res.json({ message: "Notification marked as read", result: { id } });

  } catch (error) {
    console.error("🔥 Mark Notification Read Error:", error);
    res.status(500).json({ message: error.message, result: null });
  }
});

module.exports = router;