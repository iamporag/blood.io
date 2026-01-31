const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT),
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function sendVerificationEmail(email, code) {
  try {
    await transporter.sendMail({
      from: `"Blood Bridge" <${process.env.MAIL_FROM}>`,
      to: email,
      subject: "Verify Your Email",
      html: `
        <h3>Email Verification</h3>
        <p>Your verification code is:</p>
        <h2>${code}</h2>
        <p>This code will expire in 10 minutes.</p>
      `,
    });
    console.log(`OTP email sent to ${email}`);
  } catch (err) {
    console.error("Email sending failed:", err);
    throw err;
  }
}

module.exports = { sendVerificationEmail };