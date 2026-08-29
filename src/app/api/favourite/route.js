import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import dbConnect from "@/utils/dbconnect";
import UserData from "@/models/UserData";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Get user data
export async function GET(req){
    const token = await getToken({ req, secret: process.env.JWT_SECRET });
    if (!token) {
        return NextResponse.json(
            {
                success: false,
                message: "User not logged in",
                data: null
            },
            { status: 401 }
        );
    }
    try {
        await dbConnect();
        const user = await User.findOne({ email: token.email });
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User not found",
                    data: null
                },
                { status: 404 }
            );
        }
        const userData = await UserData.findById(user.userData);
        if (!userData) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User data not found",
                    data: null
                },
                { status: 404 }
            );
        }
        return NextResponse.json(
            {
                success: true,
                message: "User Data found",
                data: userData
            }
        );

    } catch (e) {
        console.error('get user data error', e);
        return NextResponse.json(
            {
                success: false,
                message: "Something went wrong",
                data: null
            },
            { status: 500 }
        );
    }

}



// Add to favourites
export async function POST(request) {
    const token = await getToken({ req: request, secret: process.env.JWT_SECRET });
    if (!token) {
        return NextResponse.json(
            {
                success: false,
                message: "User not logged in",
                data: null
            },
            { status: 401 }
        );
    }
    const { id } = await request.json();
    if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) {
        return NextResponse.json(
            {
                success: false,
                message: "A valid YouTube track is required",
                data: null
            },
            { status: 400 }
        );
    }
    try {
        await dbConnect();
        const user = await User.findOne({ email: token.email });
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User not found",
                    data: null
                },
                { status: 404 }
            );
        }
        const userData = await UserData.findById(user.userData);
        if (!userData) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User data not found",
                    data: null
                },
                { status: 404 }
            );
        }
        if (userData.favourites.includes(id)) {
            userData.favourites = userData.favourites.filter((songId) => songId !== id);
            userData.favouriteAddedAt?.delete(id);
        } else {
            userData.favourites.push(id);
            userData.favouriteAddedAt?.set(id, new Date());
        }
        await userData.save();
        return NextResponse.json(
            {
                success: true,
                message: "Favourites updated",
                data: userData
            }
        );

    } catch (e) {
        console.log('add to favourites error', e);  
        return NextResponse.json(
            {
                success: false,
                message: "Something went wrong",
                data: null
            },
            { status: 500 }
        );
    }

}