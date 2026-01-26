const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { db } = require("../config/firebase");


// donor list route

router.get("/", authMiddleware, async (req, res) => {
    try {
        const snapshot = await db.collection("users")
            .where("isDoner", "==", true)
            .where("status", "==", "approved")
            .get();

        const donors = [];
        snapshot.forEach(doc => {
            donors.push({ uid: doc.id, ...doc.data() });
        });

        res.json({
            message: "Donors fetched successfully",
            result: donors,
        });
    }
    catch (error) {
        console.error("🔥 Donor List Error:", error);
        res.status(500).json({
            message: "Failed to fetch donors",
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