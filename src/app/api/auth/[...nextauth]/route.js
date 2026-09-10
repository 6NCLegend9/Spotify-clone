import NextAuth from "next-auth";
import { authOptions } from "@/utils/authOptions";

export const runtime = "nodejs";
export const maxDuration = 15;

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
