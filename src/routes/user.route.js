const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { db } = require("../config/firebase");

// create / update Profile

router.post("/profile", authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const phone = req.user.phone_number;
        const { name, age, bloodGroup, district, lastDonationDate, isDoner } = req.body;
        await db.collection("users").doc(uid).set({
            name,
            phone,
            age,
            bloodGroup,
            district,
            isDoner: isDoner || false,
            lastDonationDate,
            createdAt: new Date(),
        }, { merge: true });

        res.json({
            message: "Profile created/updated successfully",
            body: req.body,
        });
    }
    catch (error) {
        console.error("🔥 Profile Error:", error);
        res.status(500).json({
            message: "Failed to create/update profile",
            body: null,
        });
    }
});

// get Profile

router.get("profile", authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const userDoc = await db.collection("users").doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                message: "Profile not found",
                body: null,
            });
        }

        res.json({
            message: "Profile fetched successfully",
            body: userDoc.data(),
        });
    }
    catch (error) {
        console.error("🔥 Get Profile Error:", error);
        res.status(500).json({
            message: "Failed to fetch profile",
            body: null,
        });
    }
});

module.exports = router;