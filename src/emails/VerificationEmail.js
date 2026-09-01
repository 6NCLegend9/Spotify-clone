function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const getVerificationEmailTemplate = (userName, url) => {
  const safeName = escapeHtml(String(userName || "there").slice(0, 32));
  const safeUrl = escapeHtml(url);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
    <style>
        body { font-family: 'Poppins', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #000814; color: #ffffff; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #07121d; border-radius: 14px; overflow: hidden; box-shadow: 0 0 28px rgba(0, 230, 230, 0.16); border: 1px solid rgba(255,255,255,0.1); }
        .header { background-color: #0b1722; padding: 25px 30px; text-align: center; border-bottom: 2px solid #00e6e6; }
        .logo { font-size: 28px; font-weight: 800; color: #00e6e6; letter-spacing: 1px; margin: 0; }
        .content { padding: 35px 40px; text-align: left; }
        h2 { margin-top: 0; color: #ffffff; font-size: 22px; font-weight: 600; font-family: 'Poppins', sans-serif;}
        p { color: #9aa8b5; line-height: 1.6; font-size: 14px; margin-bottom: 25px; }
        .btn-container { text-align: center; margin: 35px 0; }
        .btn { display: inline-block; background-color: #00e6e6; color: #000000 !important; padding: 12px 24px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 50px; transition: opacity 0.3s; margin: 10px auto; min-width: 200px; }
        .btn:hover { opacity: 0.9; }
        .footer { background-color: #020813; padding: 20px 30px; text-align: center; font-size: 13px; color: #c9d4de; }
        .link-text { word-break: break-all; color: #64c9d7; font-size: 12px; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="https://spotify-clone-iota-pink.vercel.app/icon-192x192.png" alt="HeyKasa Logo" height="40" style="vertical-align: middle; margin-right: 10px; border-radius: 8px;">
            <span class="logo" style="vertical-align: middle;">HeyKasa</span>
        </div>
        <div class="content">
            <h2>Welcome to HeyKasa, ${safeName}!</h2>
            <p>Thanks for signing up. We're thrilled to have you join our community of music lovers. To start syncing your playlists and personalized recommendations, we just need to verify your email address.</p>
            
            <div class="btn-container">
                <a href="${safeUrl}" class="btn">Verify Email Address</a>
            </div>
            
            <p>This verification link will expire in 1 hour. If you didn't create an account with HeyKasa, you can safely ignore this email.</p>
            
            <p style="margin-bottom: 0;">If you're having trouble clicking the button, copy and paste this URL into your browser:</p>
            <p class="link-text">${safeUrl}</p>
        </div>
        <div class="footer">
             &copy; 2026 HeyKasa. All rights reserved.
        </div>
    </div>
</body>
</html>
  `;
};
