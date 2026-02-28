const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const profileComplete = require("../middleware/profileComplete.middleware");
const { db } = require("../config/firebase");
const admin = require("firebase-admin");

// ------------------ Helper ------------------
function sanitizeTopic(str) {
  return str.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

// ------------------ CREATE BLOOD REQUEST ------------------
// (UNCHANGED - kept exactly as your original)
router.post("/", authMiddleware, profileComplete, async (req, res) => {
  try {
    const uid = req.user.uid;

    const {
      patientName,
      medicalCondition,
      bloodGroup,
      unit,
      address,
      hospital,
      contact,
      note,
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
    }

    // Return validation errors
    if (errors.length > 0) {
      return res.status(400).json({
        message: errors,
      });
    }

    // ---------------- CHECK 24 HOUR LIMIT ----------------
    const lastRequestQuery = await db
      .collection("blood_requests")
      .where("createdBy", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!lastRequestQuery.empty) {
      const lastRequest = lastRequestQuery.docs[0].data();
      const lastCreatedAt = new Date(lastRequest.createdAt);
      const now = new Date();

      const diffHours = (now - lastCreatedAt) / (1000 * 60 * 60);

      if (diffHours < 24) {
        const remainingHours = Math.ceil(24 - diffHours);

        return res.status(400).json({
          message: `You can create another request after ${remainingHours} hour(s)`,
        });
      }
    }


    // Save blood request
    const docRef = await db.collection("blood_requests").add({
      patientName: patientName.trim(),
      medicalCondition: medicalCondition || null,
      bloodGroup,
      unit: unit && unit > 0 ? unit : 1,
      address: {
        line1: address.line1,
        line2: address.line2 || null,
        city: address.city,
        state: address.state,
      },
      hospital: hospital || null,
      contact: contact.toString(),
      donationDate,
      note: note || null,
      status: "pending",
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

    console.log("🚀 Sending notification to blood group topic:", bloodGroupUpper);

    const response = await admin.messaging().send({
      topic: `blood_${bloodGroupUpper}`, // 🔥 dynamic topic
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

    // Today midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = new Date().toISOString().split("T")[0];


    let query = db
      .collection("blood_requests")
      .where("status", "==", "pending")
      .where("donationDate", ">=", todayStr);

    if (city) {
      query = query.where("address.city", "==", city.toLowerCase());
    }

    if (bloodGroup) {
      query = query.where("bloodGroup", "==", bloodGroup.toUpperCase());
    }

    query = query.orderBy("createdAt", "desc");

    const snapshot = await query.get();
    const allDocs = snapshot.docs;

    const totalItems = allDocs.length;
    const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / limit);

    const paginatedDocs = allDocs.slice(offset, offset + limit);

    const requests = paginatedDocs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        patientName: data.patientName,
        bloodGroup: data.bloodGroup,
        unit: data.unit,
        hospital: data.hospital,
        contact: data.contact || null,
        note: data.note || null,
        donationDate: data.donationDate,
      };
    });

    const baseUrl = `${req.protocol}://${req.get("host")}${req.path}`;

    res.json({
      message: totalItems === 0
        ? "No blood requests found"
        : "Blood requests fetched successfully",
      result: requests,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
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
      medicalCondition: data.medicalCondition || null,
      bloodGroup: data.bloodGroup,
      unit: data.unit,
      hospital: data.hospital,
      contact: data.contact,
      address: data.address || null,
      note: data.note,
      status: data.status || "pending",
      donor: donorInfo,
      donationDate: data.donationDate,
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
router.post("/:id/book", authMiddleware, profileComplete, async (req, res) => {
  try {
    const donorUid = req.user.uid;
    const requestRef = db.collection("blood_requests").doc(req.params.id);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) return res.status(404).json({ message: "Blood request not found" });

    const requestData = requestDoc.data();

    // Prevent self-booking & already booked
    if (requestData.createdBy === donorUid)
      return res.status(403).json({ message: "You cannot book your own blood request" });
    if (requestData.donor)
      return res.status(403).json({ message: "This request is already booked" });

    // Get donor info
    const donorDoc = await db.collection("users").doc(donorUid).get();
    if (!donorDoc.exists) return res.status(404).json({ message: "Donor not found" });



    const donorData = donorDoc.data();
    const donorName = donorData.name || "Donor";
    const donorBloodGroup = donorData.bloodGroup;
    const lastDonatedDate = donorData.lastDonatedDate;

    // ------------------ 90 DAY DONATION RULE ------------------
    if (lastDonatedDate) {
      const lastDate = new Date(lastDonatedDate);
      const now = new Date();

      const diffTime = now - lastDate; // milliseconds difference
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      if (diffDays < 90) {
        const remainingDays = Math.ceil(90 - diffDays);

        return res.status(403).json({
          message: `You can donate again after ${remainingDays} day(s).`,
        });
      }
    }

    // ------------------ BLOOD GROUP MATCHING ------------------
    if (!donorBloodGroup || donorBloodGroup !== requestData.bloodGroup)
      return res.status(403).json({ message: `Blood group mismatch. Required: ${requestData.bloodGroup}` });

    // Check if donor has active booking
    const activeBooking = await db
      .collection("blood_requests")
      .where("donor.uid", "==", donorUid)
      .where("status", "==", "booked")
      .limit(1)
      .get();

    if (!activeBooking.empty)
      return res.status(403).json({ message: "You already have an active booked request." });

    // ------------------ BOOK REQUEST ------------------
    await requestRef.update({
      status: "booked",
      donor: { uid: donorUid, name: donorName, bloodGroup: donorBloodGroup, bookedAt: new Date().toISOString() },
    });

    await db.collection("users").doc(donorUid).update({
      myBookings: admin.firestore.FieldValue.arrayUnion(req.params.id),
    });

    // ------------------ CREATE NOTIFICATION FOR CREATOR ------------------
    const notificationData = {
      type: "request_booked",
      bloodRequestId: requestDoc.id,
      title: "🩸 Blood request booked",
      body: `${donorName} has booked your blood request for ${requestData.bloodGroup}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    await db.collection("notifications").add(notificationData);

    // FCM to creator
    const creatorDoc = await db.collection("users").doc(requestData.createdBy).get();
    const creatorToken = creatorDoc.data()?.deviceToken;

    if (creatorToken) {
      try {
        await admin.messaging().send({
          token: creatorToken,
          notification: { title: notificationData.title, body: notificationData.body },
          data: { type: notificationData.type, requestId: notificationData.bloodRequestId },
        });
      } catch (err) {
        console.error("FCM error:", err.code, err.message);
        if (err.code === "messaging/registration-token-not-registered") {
          await db.collection("users").doc(requestData.createdBy).update({ deviceToken: admin.firestore.FieldValue.delete() });
        }
      }
    }

    res.json({ message: "Blood request booked successfully" });
  } catch (error) {
    console.error("🔥 Error in booking request:", error);
    res.status(500).json({ message: error.message });
  }
});


// ------------------ COMPLETE BLOOD DONATION ------------------
router.post("/:id/complete", authMiddleware, profileComplete, async (req, res) => {
  try {
    const userUid = req.user.uid;
    const requestRef = db.collection("blood_requests").doc(req.params.id);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) return res.status(404).json({ message: "Blood request not found" });

    const data = requestDoc.data();

    if (data.createdBy !== userUid)
      return res.status(403).json({ message: "Only the request owner can complete this donation" });

    if (!data.donor || !data.donor.uid)
      return res.status(400).json({ message: "No donor has booked this request yet" });

    if (data.status === "completed") return res.status(400).json({ message: "Donation already completed" });

    const donorRef = db.collection("users").doc(data.donor.uid);
    const donorDoc = await donorRef.get();
    const donorName = donorDoc.exists ? donorDoc.data().name : data.donor.name;
    const donorToken = donorDoc.data()?.deviceToken;

    // ------------------ MARK REQUEST AS COMPLETED ------------------
    await requestRef.update({ status: "completed" });

    await donorRef.update({ bloodDonatedCount: admin.firestore.FieldValue.increment(1) });

    // ------------------ CREATE NOTIFICATION FOR DONOR ------------------
    const notificationData = {
      type: "donation_completed",
      bloodRequestId: requestDoc.id,
      title: "✅ Donation completed",
      body: `Your blood donation for ${data.bloodGroup} has been marked as completed. Thank you, ${donorName}!`,
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    await db.collection("notifications").add(notificationData);

    // FCM to donor
    if (donorToken) {
      try {
        await admin.messaging().send({
          token: donorToken,
          notification: { title: notificationData.title, body: notificationData.body },
          data: { type: notificationData.type, requestId: notificationData.bloodRequestId },
        });
      } catch (err) {
        console.error("FCM error:", err.code, err.message);
        if (err.code === "messaging/registration-token-not-registered") {
          await donorRef.update({ deviceToken: admin.firestore.FieldValue.delete() });
        }
      }
    }

    res.json({ message: "Donation marked as completed successfully" });
  } catch (error) {
    console.error("🔥 Error in completing donation:", error);
    res.status(500).json({ message: error.message });
  }
});

// ------------------ REFRESH EXPIRED BLOOD REQUESTS ------------------
router.post("/refresh", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const dbRef = db.collection("blood_requests");

    const snapshot = await dbRef.where("status", "==", "pending").get();

    if (snapshot.empty) {
      return res.json({ message: "No pending blood requests found", updated: 0 });
    }

    const batch = db.batch();
    let updatedCount = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();

      const donationDate = new Date(data.donationDate);

      // 🔥 Add 1 day to donationDate (next midnight)
      const expireTime = new Date(
        donationDate.getFullYear(),
        donationDate.getMonth(),
        donationDate.getDate() + 1,
        0, 0, 0, 0
      );

      if (now >= expireTime) {
        batch.update(doc.ref, { status: "expired" });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }

    res.json({
      message: "Expired blood requests refreshed successfully",
      updated: updatedCount,
    });

  } catch (error) {
    console.error("🔥 Error refreshing expired blood requests:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
