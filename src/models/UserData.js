import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
    {
        favourites: {
            type: Array,
            default: []
        },
        favouriteAddedAt: {
            type: Map,
            of: Date,
            default: {}
        },
        songHistory: {
            type: Array,
            default: []
        },
        completedPlays: {
            type: [String],
            default: []
        },
        searches: {
            type: [String],
            default: []
        },
        skippedTracks: {
            type: [String],
            default: []
        },
        playlists: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "playlist"
            }
        ],
        language: {
            type: Array,
            default: []
        },
        genres: {
            type: [String],
            default: []
        },
        followedArtists: {
            type: [String],
            default: []
        },
        notInterested: {
            type: [String],
            default: []
        },
        snoozedTracks: {
            type: [String],
            default: []
        },
        excludedPlaylists: {
            type: [String],
            default: []
        },
        explicitContent: {
            type: Boolean,
            default: false
        },
        settings: {
            transitionMode: { type: String, enum: ["off", "manual", "automix"], default: "automix" },
            crossfadeSeconds: { type: Number, min: 0, max: 12, default: 6 },
            eqPreset: { type: String, default: "Flat / Neutral" },
            eqBands: { type: [Number], default: [0, 0, 0, 0, 0] },
            dataSaver: { type: Boolean, default: false },
            audioOnly: { type: Boolean, default: false },
            videoQuality: { type: String, enum: ["auto", "720p", "1080p", "audio-only"], default: "auto" },
            wifiOnlyDownloads: { type: Boolean, default: false },
            streamingQuality: { type: String, enum: ["auto", "low", "normal", "high", "very-high"], default: "auto" },
            normalization: { type: String, enum: ["quiet", "normal", "loud"], default: "normal" },
            monoAudio: { type: Boolean, default: false },
            privateSession: { type: Boolean, default: false },
            tailoredAds: { type: Boolean, default: true },
            syncedLyrics: { type: Boolean, default: true },
            pictureInPicture: { type: Boolean, default: true },
            masterVolume: { type: Number, min: 0, max: 1, default: 0.85 },
        },
    },
    { timestamps: true, toJSON: { flattenMaps: true } }
);

export default mongoose.models.userData || mongoose.model("userData", fileSchema, "userData");