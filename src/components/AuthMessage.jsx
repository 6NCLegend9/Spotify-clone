"use client";

import UserMessage from "@/components/UserMessage";

export default function AuthMessage(props) {
  return (
    <UserMessage
      hrefLabel="Request a new password link"
      {...props}
    />
  );
}
