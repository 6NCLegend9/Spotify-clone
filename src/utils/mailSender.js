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

function htmlToPlainText(html) {
    return String(html || "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const mailSender = async (email, title, body) => {
    const sender = (process.env.MAIL_FROM || process.env.MAIL_USER || "").trim();
    const recipient = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!sender || !recipient) {
        throw new Error("Email delivery is not configured.");
    }

    try {
        return await getTransporter().sendMail({
            from: `"HayKasa" <${sender}>`,
            to: recipient,
            subject: title,
            html: body,
            text: htmlToPlainText(body),
        });
    } catch {
        console.error("Email delivery failed.");
        throw new Error("Email delivery failed.");
    }
};

export { htmlToPlainText };
export default mailSender;
