const axios = require('axios');
const { getSchool, getMethod, getMethodName } = require('../helpers/prayerHelper');

const ALADHAN_BASE = 'https://api.aladhan.com/v1';

// ─── Today Prayer Time ───────────────────────────────────────────────────────
const getTodayPrayerTime = async (req, res) => {
  try {
    const body = req.method === 'POST' ? req.body : req.query;

    const {
      lat,
      lng,
      city       = 'Unknown',
      prayer_method = '3',
      school     = 'STANDARD',
      timezone   = 'Asia/Dhaka',
      type       = 'automatic',
      date,
    } = body;

    // Validate
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng are required',
      });
    }

    const usedDate  = date || new Date().toISOString().split('T')[0];
    const method    = getMethod(prayer_method);
    const schoolVal = getSchool(school);

    // Call AlAdhan API
    const { data } = await axios.get(
      `${ALADHAN_BASE}/timings/${usedDate}`,
      {
        params: {
          latitude:  lat,
          longitude: lng,
          method:    method,
          school:    schoolVal,
          timezone:  timezone,
        },
      }
    );

    const timings = data.data.timings;
    const meta    = data.data.meta;

    return res.json({
      success: true,
      data: {
        city,
        type,
        date:          usedDate,
        timezone,
        prayer_method: String(prayer_method),
        method_name:   getMethodName(prayer_method),
        school,
        timings: {
          imsak:    timings.Imsak,
          fajr:     timings.Fajr,
          sunrise:  timings.Sunrise,
          dhuhr:    timings.Dhuhr,
          asr:      timings.Asr,
          maghrib:  timings.Maghrib,
          isha:     timings.Isha,
          midnight: timings.Midnight,
          lastthird: timings.Lastthird,
        },
        meta: {
          method:   meta.method.name,
          school:   meta.school,
          timezone: meta.timezone,
          latitude:  parseFloat(lat),
          longitude: parseFloat(lng),
        },
      },
    });

  } catch (error) {
    console.error('❌ getTodayPrayerTime error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─── Prayer Time by Month ────────────────────────────────────────────────────
const getMonthlyPrayerTime = async (req, res) => {
  try {
    const body = req.method === 'POST' ? req.body : req.query;

    const {
      lat,
      lng,
      city          = 'Unknown',
      prayer_method = '3',
      school        = 'STANDARD',
      timezone      = 'Asia/Dhaka',
      month,
      year,
    } = body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng are required',
      });
    }

    const now        = new Date();
    const usedMonth  = month || (now.getMonth() + 1);
    const usedYear   = year  || now.getFullYear();
    const method     = getMethod(prayer_method);
    const schoolVal  = getSchool(school);

    const { data } = await axios.get(
      `${ALADHAN_BASE}/calendar/${usedYear}/${usedMonth}`,
      {
        params: {
          latitude:  lat,
          longitude: lng,
          method:    method,
          school:    schoolVal,
          timezone:  timezone,
        },
      }
    );

    const calendar = data.data.map((day) => ({
      date:     day.date.readable,
      gregorian: day.date.gregorian.date,
      hijri:    `${day.date.hijri.day} ${day.date.hijri.month.en} ${day.date.hijri.year}`,
      timings: {
        imsak:    day.timings.Imsak,
        fajr:     day.timings.Fajr,
        sunrise:  day.timings.Sunrise,
        dhuhr:    day.timings.Dhuhr,
        asr:      day.timings.Asr,
        maghrib:  day.timings.Maghrib,
        isha:     day.timings.Isha,
        midnight: day.timings.Midnight,
      },
    }));

    return res.json({
      success: true,
      data: {
        city,
        month:        usedMonth,
        year:         usedYear,
        prayer_method: String(prayer_method),
        method_name:  getMethodName(prayer_method),
        school,
        timezone,
        calendar,
      },
    });

  } catch (error) {
    console.error('❌ getMonthlyPrayerTime error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─── Next Prayer ─────────────────────────────────────────────────────────────
const getNextPrayer = async (req, res) => {
  try {
    const body = req.method === 'POST' ? req.body : req.query;

    const {
      lat,
      lng,
      city          = 'Unknown',
      prayer_method = '3',
      school        = 'STANDARD',
      timezone      = 'Asia/Dhaka',
    } = body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng are required',
      });
    }

    const today     = new Date().toISOString().split('T')[0];
    const method    = getMethod(prayer_method);
    const schoolVal = getSchool(school);

    const { data } = await axios.get(
      `${ALADHAN_BASE}/timings/${today}`,
      {
        params: {
          latitude:  lat,
          longitude: lng,
          method:    method,
          school:    schoolVal,
          timezone:  timezone,
        },
      }
    );

    const timings = data.data.timings;

    // Find next prayer
    const prayerOrder = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const now = new Date();

    let nextPrayer = null;
    let nextTime   = null;

    for (const prayer of prayerOrder) {
      const [hours, minutes] = timings[prayer].split(':').map(Number);
      const prayerDate = new Date();
      prayerDate.setHours(hours, minutes, 0, 0);

      if (prayerDate > now) {
        nextPrayer = prayer;
        nextTime   = timings[prayer];
        break;
      }
    }

    // If no next prayer today, next is Fajr tomorrow
    if (!nextPrayer) {
      nextPrayer = 'Fajr';
      nextTime   = timings['Fajr'];
    }

    return res.json({
      success: true,
      data: {
        city,
        date:        today,
        timezone,
        next_prayer: nextPrayer.toLowerCase(),
        next_time:   nextTime,
        all_timings: {
          fajr:    timings.Fajr,
          sunrise: timings.Sunrise,
          dhuhr:   timings.Dhuhr,
          asr:     timings.Asr,
          maghrib: timings.Maghrib,
          isha:    timings.Isha,
        },
      },
    });

  } catch (error) {
    console.error('❌ getNextPrayer error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getTodayPrayerTime,
  getMonthlyPrayerTime,
  getNextPrayer,
};