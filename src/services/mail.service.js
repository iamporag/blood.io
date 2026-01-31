const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",   // ✅ correct
  port: 587,
  secure: false,            // TLS
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS, // Gmail App Password
  },
  tls: {
    rejectUnauthorized: false, // important for Render
  },
});

// Debug (temporary)
console.log("MAIL_USER:", process.env.MAIL_USER);
console.log("MAIL_PASS exists:", !!process.env.MAIL_PASS);

// Verify SMTP connection
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP VERIFY ERROR:", error);
  } else {
    console.log("SMTP READY: Gmail connected");
  }
});

async function sendVerificationEmail(email, code) {
  try {
    await transporter.sendMail({
      from: `"Blood Bridge" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Verify Your Email",
      html: `
        <h3>Email Verification</h3>
        <p>Your verification code is:</p>
        <h2>${code}</h2>
        <p>This code will expire in 10 minutes.</p>
      `,
    });
  } catch (error) {
    console.error("EMAIL SEND FAILED:", error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail,
};
