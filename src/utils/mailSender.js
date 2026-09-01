const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
    const host = (process.env.MAIL_HOST || "").trim();
    const user = (process.env.MAIL_USER || "").trim();
    const pass = process.env.MAIL_PASS || "";
    const port = Number(process.env.MAIL_PORT || 465);

    if (!host || !user || !pass || !Number.isInteger(port)) {
        throw new Error("Email delivery is not configured.");
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host,
            port,
            secure: process.env.MAIL_SECURE !== "false",
            auth: { user, pass },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 15_000,
        });
    }

    return transporter;
}

const mailSender = async (email, title, body) => {
    const sender = (process.env.MAIL_FROM || process.env.MAIL_USER || "").trim();
    return getTransporter().sendMail({
        from: `"HeyKasa" <${sender}>`,
        to: email,
        subject: title,
        html: body,
    });
};

export default mailSender;

