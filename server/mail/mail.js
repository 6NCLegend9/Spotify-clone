import nodemailer from "nodemailer";
import dotnev from "dotenv";

dotnev.config();

export const mailConfigured = Boolean(
  process.env.MAIL_EMAIL && process.env.MAIL_SECRET
);

let transporter = mailConfigured
  ? nodemailer.createTransport({
      host: process.env.MAIL_HOST || "smtp.gmail.com",
      port: Number(process.env.MAIL_PORT || 465),
      secure: process.env.MAIL_SECURE
        ? process.env.MAIL_SECURE === "true"
        : true,
      auth: {
        user: process.env.MAIL_EMAIL,
        pass: process.env.MAIL_SECRET,
      },
    })
  : null;

export const sendMail = async (details) => {
  if (!transporter) {
    throw new Error("Mail service is not configured");
  }

  return transporter.sendMail({
    from: `Musicon <${process.env.MAIL_EMAIL}>`,
    ...details,
  });
};

export const verifyMail = async () => {
  if (!transporter) {
    return false;
  }

  await transporter.verify();
  return true;
};
