import nodemailer from "nodemailer";
import dotnev from "dotenv";

dotnev.config();

export const mailConfigured = Boolean(
  process.env.MAIL_EMAIL && process.env.MAIL_SECRET
);

let transporter = mailConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_EMAIL,
        pass: process.env.MAIL_SECRET,
      },
    })
  : null;

export const sendMail = (details, callback) => {
  if (!transporter) {
    callback(new Error("Mail service is not configured"), null);
    return;
  }

  transporter.sendMail(
    {
      from: `Musicon <${process.env.MAIL_EMAIL}>`,
      ...details,
    },
    (err, done) => {
      if (err) {
        callback(err, null);
      } else {
        callback(null, done);
      }
    }
  );
};
