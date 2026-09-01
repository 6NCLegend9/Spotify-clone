const nodemailer = require("nodemailer");
const path = require("path");

let transporter;
const LOGO_CID = "heykasa-logo";
const LIGHT_PILLAR_CID = "heykasa-light-pillar";
const logoPath = path.join(process.cwd(), "public", "icon-192x192.png");
const lightPillarPath = path.join(process.cwd(), "public", "email-light-pillar.png");

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

const mailSender = async (email, title, body, { inlineLogo = false } = {}) => {
    const sender = (process.env.MAIL_FROM || process.env.MAIL_USER || "").trim();
    return getTransporter().sendMail({
        from: `"HeyKasa" <${sender}>`,
        to: email,
        subject: title,
        html: body,
        ...(inlineLogo
            ? {
                attachments: [
                    {
                        filename: "heykasa-logo.png",
                        path: logoPath,
                        cid: LOGO_CID,
                        contentDisposition: "inline",
                    },
                    {
                        filename: "heykasa-light-pillar.png",
                        path: lightPillarPath,
                        cid: LIGHT_PILLAR_CID,
                        contentDisposition: "inline",
                    },
                ],
            }
            : {}),
    });
};

export default mailSender;

