const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { db } = require("../config/firebase");

// create blood request
router.post("/create", authMiddleware, async (req, res) => {
    console.log("BODY >>>", req.body);
    try {
        const uid = req.user.uid;

        const {
            patientName,
            bloodGroup,
            district,
            hospital,
            contact,
            note,
        } = req.body;

        await db.collection("blood_requests").add({
            patientName,
            bloodGroup,
            bloodGroupLower: bloodGroup.toLowerCase(),
            district,
            districtLower: district.toLowerCase(),
            hospital,
            contact,
            note,
            createdBy: uid,
            createdAt: new Date(),
        });


        res.json({
            message: "Blood request created successfully",
            result: null,
        });
    } catch (error) {
        res.status(500).json({
            message: error.message,
            result: null,
        });
    }
});

router.get("/list", async (req, res) => {
  try {
    let { district, bloodGroup } = req.query;

    let query = db.collection("blood_requests");

    if (district) {
      query = query.where("district", "==", district.toLowerCase());
    }

    if (bloodGroup) {
      bloodGroup = bloodGroup.replace(/ /g, "+").toLowerCase();
      query = query.where("bloodGroup", "==", bloodGroup);
    }

    const snapshot = await query
      .orderBy("createdAt", "desc")
      .get();

    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      total: data.length,
      message: "Blood requests fetched successfully",
      result: data,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      result: null,
    });
  }
});


module.exports = router;
