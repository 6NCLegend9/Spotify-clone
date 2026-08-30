import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import dbConnect from "@/utils/dbconnect";
import { tokenOptions } from "@/utils/authToken";


// check if user is logged in
export default async function auth(req) {
    const token = await getToken(tokenOptions(req));
    if (!token?.email) {
        return null
    }
    try {
        await dbConnect();
        const user = await User.findOne({ email: token.email });
        if (!user) {
            return null
        }
        return user;
    } catch (error) {
        console.error(error);
        return null
    }
}