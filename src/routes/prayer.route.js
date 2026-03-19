const express = require("express");
const router = express.Router();
const axios = require("axios");

// ------------------ TODAY PRAYER TIME ------------------
router.post("/", async (req, res) => {
  try {
    // Query parameters
    const {
      date,
      lat,
      lng,
    } = req.query || {};

    // Validation
    if (!date || !lat || !lng) {
      return res.status(400).json({
        message: "date, lat, and lng are required in query params",
        result: null,
      });
    }

    // Call Aladhan API
    const { data } = await axios.get(
      `https://api.aladhan.com/v1/timings/${date}`,
      {
        params: {
          latitude: Number(lat),
          longitude: Number(lng),
          method: 1,  // default
          school: 1,  // STANDARD
        },
      }
    );

    const t = data.data.timings;

    // Check if date is Friday (Jumma)
    const day = new Date(date).getDay(); // 5 = Friday
    const is_jumma = day === 5;

    // Respond with simplified timings
    res.json({
      message: "Prayer times fetched successfully",
      data: {
        date: date,
        is_jumma,
        imsak: t.Imsak,
        fajr_start: t.Fajr,
        sunrise: t.Sunrise,
        zuhr_start: t.Dhuhr,
        asr_start: t.Asr,
        maghrib_start: t.Maghrib,
        isha_start: t.Isha,
      },
    });

  } catch (error) {
    console.error("🔥 FULL ERROR:", error);
    res.status(500).json({
      message: error.message,
      result: null,
    });
  }
});

module.exports = router;