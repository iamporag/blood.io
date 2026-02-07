const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { db } = require("../config/firebase");
router.get("/", authMiddleware, async (req, res) => {
  try {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;

    const currentUserId = req.user.uid;
    const now = new Date();

    // Base query
    let query = db.collection("users")
      .where("profileComplete", "==", true)
      .where("status", "==", "active")
      .orderBy("createdAt", "desc");

    const snapshot = await query.get();
    const allDocs = snapshot.docs;

    // Manual pagination
    const offset = (page - 1) * limit;
    const paginatedDocs = allDocs.slice(offset, offset + limit);

    const donors = [];

    paginatedDocs.forEach(doc => {
      if (doc.id === currentUserId) return;

      const data = doc.data();

      let dynamicIsDonor = true;
      let lastDonationRaw = data.lastDonationDate || null;

      if (lastDonationRaw) {
        const lastDonationDate = new Date(lastDonationRaw);
        const fourMonthsLater = new Date(lastDonationDate);
        fourMonthsLater.setMonth(fourMonthsLater.getMonth() + 4);

        dynamicIsDonor = now.getTime() >= fourMonthsLater.getTime();
      }

      donors.push({
        uid: doc.id,
        name: data.name,
        bloodGroup: data.bloodGroup,
        contact: data.contact || null,
        address: data.address || null,
        lastDonationDate: lastDonationRaw,
        isDonor: dynamicIsDonor,
      });
    });

    const total = allDocs.length;
    const totalPages = Math.ceil(total / limit);
    const baseUrl = `${req.protocol}://${req.get("host")}${req.path}`;

    res.json({
      message: "Donors fetched successfully",
      result: donors,
      links: {
        first: `${baseUrl}?page=1&limit=${limit}`,
        last: `${baseUrl}?page=${totalPages}&limit=${limit}`,
        prev: page > 1 ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null,
        next: page < totalPages ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null,
      },
    });

  } catch (error) {
    console.error("🔥 Donor List Error:", error);
    res.status(500).json({
      message: error.message,
      result: null,
    });
  }
});

// ------------------ GET DONOR BY ID ------------------
router.get("/:id", authMiddleware, async (req, res) => {
    try {
        const donorId = req.params.id;
        const currentUserId = req.user.uid;

        if (donorId === currentUserId) {
            return res.status(400).json({
                message: "Cannot fetch your own donor profile via this endpoint",
                result: null,
            });
        }

        const doc = await db.collection("users").doc(donorId).get();

        if (!doc.exists || !doc.data().isDoner || doc.data().status !== "approved") {
            return res.status(404).json({
                message: "Donor not found",
                result: null,
            });
        }

        const data = doc.data();

        res.json({
            message: "Donor fetched successfully",
            result: data,
        });
    } catch (error) {
        console.error("🔥 Get Donor Error:", error);
        res.status(500).json({
            message: "Failed to fetch donor",
            result: null,
        });
    }
});



router.get("/search", authMiddleware, async (req, res) => {
    try {
        let { bloodGroup, district } = req.query;

        if (bloodGroup) {
            bloodGroup = bloodGroup.replace(/ /g, "+").toLowerCase(); // fix '+'
        }
        if (district) {
            district = district.toLowerCase();
        }

        let query = db.collection("users")
            .where("isDoner", "==", true)
            .where("status", "==", "approved");

        if (bloodGroup) query = query.where("bloodGroup", "==", bloodGroup);
        if (district) query = query.where("district", "==", district);

        const snapshot = await query.get();
        const donors = [];

        snapshot.forEach(doc => donors.push({ uid: doc.id, ...doc.data() }));

        res.json({
            total: donors.length,
            message: "Donors fetched successfully",
            result: donors,
        });
    } catch (error) {
        console.error("🔥 Donor Search Error:", error);
        res.status(500).json({ message: "Failed to fetch donors", result: null });
    }
});



module.exports = router;