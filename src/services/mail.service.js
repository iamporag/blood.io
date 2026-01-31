const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function sendVerificationEmail(email, code) {
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
}

module.exports = {
  sendVerificationEmail,
};
