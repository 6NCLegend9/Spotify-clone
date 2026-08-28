import { useState } from "react";
import { MailIcon } from "../../../assets";

const Mail = ({ email, type, handleForm }) => {
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");
  const searchPhrase =
    type === "forgot"
      ? "Musicon Password Forgot Verification"
      : "Musicon Register Verification";

  const openMail = () => {
    const domain = email.split("@")[1]?.toLowerCase();
    const encodedSearch = encodeURIComponent(searchPhrase);
    let mailUrl = `https://mail.google.com/mail/u/0/#search/${encodedSearch}`;

    if (domain?.includes("outlook") || domain?.includes("hotmail")) {
      mailUrl = `https://outlook.live.com/mail/0/search/${encodedSearch}`;
    } else if (domain?.includes("yahoo")) {
      mailUrl = `https://mail.yahoo.com/d/search/keyword=${encodedSearch}`;
    }

    window.open(mailUrl, "_blank", "noopener,noreferrer");
  };

  const resend = async () => {
    setResending(true);
    setMessage("");

    try {
      const sent = await handleForm();
      setMessage(
        sent
          ? "A new verification email was sent. Check Inbox, Spam, and Promotions."
          : "We could not send the email. Check the server mail configuration and try again."
      );
    } catch (error) {
      setMessage("We could not send the email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="mail">
      <div className="mail-icon">
        <MailIcon width={"5rem"} height={"5rem"} />
      </div>
      <h3>Check your email</h3>
      <p>
        We sent instructions to <strong>{email}</strong> to {type} your account.
      </p>
      <p className="mail-hint">
        The message may appear in Spam or Promotions. Delivery can take a few minutes.
      </p>
      <button className="mail-open" onClick={openMail} type="button">
        Open email
      </button>
      <p className="mail-search">
        Search for: <code>{searchPhrase}</code>
      </p>
      <p className="mail-status" aria-live="polite">
        {message}
      </p>
      <button onClick={resend} type="button" disabled={resending}>
        {resending ? "Sending..." : "Resend email"}
      </button>
    </div>
  );
};

export default Mail;
