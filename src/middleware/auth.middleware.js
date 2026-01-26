const { admin } = require("../config/firebase"); // now admin is defined

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // 🔥 VERIFY SESSION COOKIE (NOT idToken)
    const decoded = await admin.auth().verifySessionCookie(token, true);

    req.user = decoded;
    next();

  } catch (error) {
    return res.status(401).json({
      message: "Session expired or invalid"
    });
  }
};


module.exports = authMiddleware;
