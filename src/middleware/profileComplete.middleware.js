const { db } = require("../config/firebase");

const profileCompleteMiddleware = async (req, res, next) => {
    try {
        const uid = req.user.uid;

        const userDoc = await db.collection("users").doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        const user = userDoc.data();

        // Required fields for profile completion
        const isProfileComplete =
            user.dateOfBirth &&
            user.contact &&
            user.bloodGroup &&
            user.address &&
            user.address.line1 &&
            user.address.city &&
            user.address.state;

        if (!isProfileComplete) {
            return res.status(403).json({
                message: "Please complete your profile to continue",
                   result: {
          profileComplete: false,
        },
            });
        }

        next();
    } catch (error) {
        console.error("Profile check error:", error);
        res.status(500).json({
            message: "Profile validation failed",
        });
    }
};

module.exports = profileCompleteMiddleware;
