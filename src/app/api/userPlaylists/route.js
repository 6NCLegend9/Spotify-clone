import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import User from "@/models/User";
import dbConnect from "@/utils/dbconnect";
import Playlist from "@/models/Playlist";
import UserData from "@/models/UserData";
import auth from "@/utils/auth";


// Create a new playlist
export async function POST(req){
    const { name } = await req.json();
    try {
        await dbConnect();
        const user = await auth(req);
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User not logged in",
                    data: null
                },
                { status: 404 }
            );
        }
        const  playlist = await Playlist.create({
            name,
            user: user._id
        });

        const userData = await UserData.findById(user.userData);
        userData.playlists.push(playlist._id);
        await userData.save();
        return NextResponse.json(
            {
                success: true,
                message: "Playlist created",
                data: {
                    playlist
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

// delete a playlist
export async function DELETE(req){
    const { playlistId } = await req.json();
    try {
        await dbConnect();
        const user = await auth(req);
        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    message: "User not logged in",
                    data: null
                },
                { status: 404 }
            );
        }
        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Playlist not found",
                    data: null
                },
                { status: 404 }
            );
        }
        if (playlist.user.toString() !== user._id.toString()) {
            return NextResponse.json(
                {
                    success: false,
                    message: "You are not authorized to delete this playlist",
                    data: null
                },
                { status: 401 }
            );
        }
        await Playlist.deleteOne({ _id: playlistId });
        const userData = await UserData.findById(user.userData);
        userData.playlists = userData.playlists.filter((playlist) => playlist.toString() !== playlistId);
        await userData.save();
        return NextResponse.json(
            {
                success: true,
                message: "Playlist deleted",
                data: null
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

// update playlist library settings or collaborators
export async function PATCH(req){
    const { playlistId, action, value, email } = await req.json();
    try {
        await dbConnect();
        const user = await auth(req);
        if (!user) {
            return NextResponse.json(
                { success: false, message: "User not logged in", data: null },
                { status: 401 }
            );
        }

        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return NextResponse.json(
                { success: false, message: "Playlist not found", data: null },
                { status: 404 }
            );
        }
        if (playlist.user.toString() !== user._id.toString()) {
            return NextResponse.json(
                { success: false, message: "Only the playlist owner can make this change", data: null },
                { status: 403 }
            );
        }

        if (action === "pinned") {
            playlist.pinned = Boolean(value);
        } else if (action === "smartShuffle") {
            playlist.smartShuffle = Boolean(value);
        } else if (action === "visibility" && ["public", "private"].includes(value)) {
            playlist.visibility = value;
        } else if (action === "addCollaborator") {
            const collaborator = await User.findOne({ email: email?.trim().toLowerCase() });
            if (!collaborator) {
                return NextResponse.json(
                    { success: false, message: "No Hayasaka account uses that email", data: null },
                    { status: 404 }
                );
            }
            if (collaborator._id.toString() === user._id.toString()) {
                return NextResponse.json(
                    { success: false, message: "You already own this playlist", data: null },
                    { status: 400 }
                );
            }
            if (!playlist.collaborators.some((id) => id.toString() === collaborator._id.toString())) {
                playlist.collaborators.push(collaborator._id);
            }
        } else {
            return NextResponse.json(
                { success: false, message: "Unsupported playlist update", data: null },
                { status: 400 }
            );
        }

        await playlist.save();
        await playlist.populate("user", "userName imageUrl");
        await playlist.populate("collaborators", "userName imageUrl");
        return NextResponse.json({
            success: true,
            message: action === "addCollaborator" ? "Collaborator added" : "Playlist updated",
            data: { playlist }
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json(
            { success: false, message: "Something went wrong", data: null },
            { status: 500 }
        );
    }
}


// get all playlists
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
        const playlists = await Playlist.find({
            $or: [
                { _id: { $in: userData.playlists } },
                { collaborators: user._id }
            ]
        })
            .populate("user", "userName imageUrl")
            .populate("collaborators", "userName imageUrl")
            .sort({ updatedAt: -1 });
        return NextResponse.json(
            {
                success: true,
                message: "Playlists fetched",
                data: {
                    playlists
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