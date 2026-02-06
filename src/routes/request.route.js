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
// (UNCHANGED - kept exactly as your original)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;

    const {
      patientName,
      bloodGroup,
      unit,
      address,
      hospital,
      contact,
      note,
      medicalCondition,
      donationDate,
    } = req.body;

    const errors = [];

    // ---------------- BASIC VALIDATION ----------------
    if (!patientName || patientName.trim().length < 2) {
      errors.push("Valid patient name is required");
    }

    if (!bloodGroup) {
      errors.push("Blood group is required");
    }

    if (!contact || contact.toString().length < 8) {
      errors.push("Valid contact number is required");
    }

    if (!donationDate) {
      errors.push("Donation date is required");
    }

    // ---------------- ADDRESS VALIDATION ----------------
    if (!address) {
      errors.push("Address is required");
    } else {
      if (!address.line1) {
        errors.push("Address line1 is required");
      }
      if (!address.city) {
        errors.push("City is required");
      }
      if (!address.state) {
        errors.push("State is required");
      }
      if (!address.postalCode) {
        errors.push("Postal code is required");
      }
      if (!address.countryCode) {
        errors.push("Country code is required");
      }
    }

    // Return validation errors
    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors,
        result: null,
      });
    }

    // Save blood request
    const docRef = await db.collection("blood_requests").add({
      patientName: patientName.trim(),
      bloodGroup,
      unit: unit && unit > 0 ? unit : 1,
      address: {
        line1: address.line1,
        line2: address.line2 || null,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
      },
      hospital: hospital || null,
      contact: contact.toString(),
      donationDate,
      note: note || null,
      medicalCondition: medicalCondition || null,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    });

    // ------------------ Create Notification ------------------
    // Capitalize first letter of note
    const capitalizeFirstWord = (text) => {
      if (!text) return "";
      const words = text.split(" ");
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
      return words.join(" ");
    };

    // Make bloodGroup all uppercase
    const bloodGroupUpper = bloodGroup.toUpperCase();

    // Apply transformations
    const formattedNote = capitalizeFirstWord(note);

    const notificationData = {
      type: "blood_request",
      bloodRequestId: docRef.id,
      title: `🩸 ${formattedNote} ${bloodGroupUpper} Needed`,
      body: `${bloodGroupUpper} blood needed at ${hospital}, ${address.city}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    await db.collection("notifications").add(notificationData);

    console.log("🚀 Sending notification to topic: all_users");

    const response = await admin.messaging().send({
      topic: "all_users",
      notification: {
        title: `🩸 ${formattedNote} ${bloodGroupUpper} Needed`,
        body: `${bloodGroupUpper} blood needed at ${hospital}, ${address.city}`,
      },
      data: {
        type: "blood_request",
        bloodGroup: bloodGroupUpper,
        city: address.city,
        hospital: hospital || "",
      },
    });



    console.log("✅ FCM RESPONSE:", response);

    return res.status(200).json({
      message: "Blood request created successfully",
      result: {
        id: docRef.id,
      },
    });

  } catch (error) {
    console.error("Create blood request error:", error);
    return res.status(500).json({
      message: "Internal server error",
      result: null,
    });
  }
});


// ------------------ LIST BLOOD REQUESTS ------------------
router.get("/", async (req, res) => {
  try {
    let { city, bloodGroup, page, limit } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    let query = db.collection("blood_requests");

    // Filter by city (nested address field)
    if (city) {
      query = query.where("address.city", "==", city.toLowerCase());
    }

    // Filter by blood group
    if (bloodGroup) {
      query = query.where("bloodGroup", "==", bloodGroup.toUpperCase());
    }

    // Order by createdAt descending
    query = query.orderBy("createdAt", "desc");

    const snapshot = await query.get();
    const allDocs = snapshot.docs;

    // Manual pagination
    const paginatedDocs = allDocs.slice(offset, offset + limit);

    const requests = [];

    for (const doc of paginatedDocs) {
      const data = doc.data();

      requests.push({
        id: doc.id,
        patientName: data.patientName,
        bloodGroup: data.bloodGroup,
        unit: data.unit,
        hospital: data.hospital,
        contact: data.contact || null,
        note: data.note || null,
        donationDate: data.donationDate,
      });
    }

    const totalPages = Math.ceil(allDocs.length / limit);
    const baseUrl = `${req.protocol}://${req.get("host")}${req.path}`;

    res.json({
      message: "Blood requests fetched successfully",
      result: requests,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: allDocs.length,
      },
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
      ? { uid: userDoc.id, name: userDoc.data().name, contact: userDoc.data().contact, }
      : { uid: data.createdBy, name: null };

    // Donor info (if booked)
    let donorInfo = null;
    if (data.donor) {
      const donorDoc = await db.collection("users").doc(data.donor.uid).get();
      donorInfo = {
        uid: data.donor.uid,
        name: donorDoc.exists ? donorDoc.data().name : data.donor.name,
        contact: donorDoc.exists ? donorDoc.data().contact : data.donor.contact,
        bookedAt: data.donor.bookedAt,
      };
    }

    const result = {
      id: doc.id,
      patientName: data.patientName,
      bloodGroup: data.bloodGroup,
      unit:data.unit,
      hospital: data.hospital,
      contact: data.contact || null,
      address: data.address || null,
      note: data.note || null,
      status: data.status || "pending",
      donor: donorInfo,
      donationDate:data.donationDate,
      createdAt: data.createdAt,
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


// ------------------ BOOK BLOOD REQUEST ------------------
router.post("/:id/book", authMiddleware, async (req, res) => {
  try {
    const donorUid = req.user.uid;

    const requestRef = db.collection("blood_requests").doc(req.params.id);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({ message: "Blood request not found" });
    }

    const requestData = requestDoc.data();

    // ✅ Prevent the creator from booking their own request
    if (requestData.createdBy === donorUid) {
      return res.status(403).json({
        message: "You cannot book your own blood request",
      });
    }

    // ✅ Prevent booking if already booked
    if (requestData.donor) {
      return res.status(403).json({
        message: "This request is already booked by another donor",
      });
    }

    // Get donor info
    const donorDoc = await db.collection("users").doc(donorUid).get();
    const donorName = donorDoc.exists ? donorDoc.data().name : null;

    // Book the request
    await requestRef.update({
      status: "booked",
      donor: {
        uid: donorUid,
        name: donorName,
        bookedAt: new Date().toISOString(),
      },
    });

    res.json({ message: "Blood request booked successfully" });
  } catch (error) {
    console.error("🔥 Error in booking request:", error);
    res.status(500).json({ message: error.message });
  }
});

// ------------------ COMPLETE BLOOD DONATION (Request Owner Only) ------------------
router.post("/:id/complete", authMiddleware, async (req, res) => {
  try {
    const userUid = req.user.uid;

    const requestRef = db.collection("blood_requests").doc(req.params.id);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return res.status(404).json({ message: "Blood request not found" });
    }

    const data = requestDoc.data();

    // Only the user who created the request can mark it as completed
    if (data.createdBy !== userUid) {
      return res.status(403).json({ message: "Only the request owner can complete this donation" });
    }

    // Cannot complete if request is not booked by any donor
    if (!data.donor || !data.donor.uid) {
      return res.status(400).json({ message: "No donor has booked this request yet" });
    }

    // Prevent double completion
    if (data.status === "completed") {
      return res.status(400).json({ message: "Donation already completed" });
    }

    // Mark as completed
    await requestRef.update({ status: "completed" });

    // Increment donor's bloodDonatedCount
    const donorRef = db.collection("users").doc(data.donor.uid);
    await donorRef.update({
      bloodDonatedCount: admin.firestore.FieldValue.increment(1),
    });

    res.json({ message: "Donation marked as completed successfully" });
  } catch (error) {
    console.error("🔥 Error in completing donation:", error);
    res.status(500).json({ message: error.message });
  }
});





module.exports = router;
