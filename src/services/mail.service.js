// src/services/mail.service.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.sendgrid.net",
  port: 587,
  auth: {
    user: "apikey", // fixed
    pass: process.env.SENDGRID_API_KEY,
  },
});

async function sendVerificationEmail(email, code) {
  try {
    await transporter.sendMail({
      from: `"Blood Bridge" <no-reply@yourdomain.com>`,
      to: email,
      subject: "Verify Your Email",
      html: `<h3>Email Verification</h3>
             <p>Your verification code is:</p>
             <h2>${code}</h2>
             <p>This code will expire in 10 minutes.</p>`,
    });
    console.log(`OTP email sent to ${email}`);
  } catch (err) {
    console.error("Email sending failed:", err);
    throw err;
  }
}

module.exports = { sendVerificationEmail };
