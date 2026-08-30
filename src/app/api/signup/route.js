import { NextResponse } from "next/server";
import dbConnect from "@/utils/dbconnect";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import UserData from "@/models/UserData";
import crypto from "crypto";
import mailSender from "@/utils/mailSender";
import { getVerificationEmailTemplate } from "@/emails/VerificationEmail";

export async function POST(request) {
    const {userName, email, password, imageUrl } = await request.json();
    try {
        if (!userName || !email || !password || !imageUrl) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Please fill all the fields",
                    data: null
                },
                { status: 400 }
            );
        }
        await dbConnect();

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User already exists",
                    data: null
                },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userData = await UserData.create({});
        
        // Generate Verification Token
        const verificationToken = crypto.randomBytes(20).toString('hex');
        
        const result = await User.create({ 
            userName,
            email,
            password: hashedPassword,
            imageUrl,
            userData: userData._id,
            verificationToken: verificationToken,
            verificationTokenExpires: Date.now() + 3600000, // 1 Hour
         });

        // Send Email
        const url = `${process.env.NEXTAUTH_URL}/verify-email/${verificationToken}`;
        const title = "Welcome to Hayasaka! Verify Your Email";
        const body = getVerificationEmailTemplate(userName, url);

        await mailSender(email, title, body);

        return NextResponse.json(
            {
                success: true,
                message: "User created successfully. Please check your email to verify your account.",
                data: {
                    userName: result.userName,
                    email: result.email,
                    _id: result._id
                }
            }
        );
    } catch (e) {
        console.error(e);
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
