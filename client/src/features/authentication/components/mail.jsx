import { useState } from "react";
import { MailIcon } from "../../../assets";

const Mail = ({ email, type, handleForm }) => {
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");

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
