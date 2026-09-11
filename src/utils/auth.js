import { getSessionUser } from "@/utils/sessionAuth";


// check if user is logged in
export default async function auth(req) {
    try {
        return await getSessionUser(req);
    } catch (error) {
        console.error(error);
        return null
    }
}