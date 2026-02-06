const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { db } = require("../config/firebase");
// donor list route
// donor list route
router.get("/", authMiddleware, async (req, res) => {
    try {
        let { page, limit } = req.query;
        page = parseInt(page) || 1;      // default page 1
        limit = parseInt(limit) || 10;   // default 10 items per page
        const currentUserId = req.user.uid;

        const now = new Date();

        let query = db.collection("users")
            .where("status", "==", "active")
            .orderBy("createdAt", "desc");

        // Pagination
        if (page > 1) {
            const prevSnapshot = await query.limit((page - 1) * limit).get();
            if (!prevSnapshot.empty) {
                const lastDoc = prevSnapshot.docs[prevSnapshot.docs.length - 1];
                query = query.startAfter(lastDoc);
            }
        }

        const snapshot = await query.limit(limit).get();
        const donors = [];

        snapshot.forEach(doc => {
            if (doc.id === currentUserId) return; // skip current user

            const data = doc.data();

            let dynamicIsDoner = true;
            let lastDonationRaw = data.lastDonationDate || null;

            if (lastDonationRaw) {
                const lastDonationDate = new Date(lastDonationRaw);

                // Calculate exact 4 months later using milliseconds
                const fourMonthsLater = new Date(lastDonationDate);
                fourMonthsLater.setMonth(fourMonthsLater.getMonth() + 4);

                // Only eligible if current time >= exactly 4 months later
                dynamicIsDoner = now.getTime() >= fourMonthsLater.getTime();
            }

            donors.push({
                uid: doc.id,
                name: data.name,
                bloodGroup: data.bloodGroup,
                district: data.district,
                phone: data.phone || null,
                lastDonationDate: lastDonationRaw,
                isDoner: dynamicIsDoner,
            });
        });

        // Total count for pagination
        const totalSnapshot = await db.collection("users")
            .where("isDoner", "==", true)
            .where("status", "==", "approved")
            .get();
        const total = totalSnapshot.size;
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
            message: "Failed to fetch donors",
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