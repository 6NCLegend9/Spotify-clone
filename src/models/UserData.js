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
        likedPlaylists: [
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
        genreIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "genre"
            }
        ],
        tags: {
            type: [String],
            default: []
        },
        tagIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "tag"
            }
        ],
        followedArtists: {
            type: [String],
            default: []
        },
        // Channel metadata for followed artists so the UI can link to profiles and
        // surface new releases; the names array above stays the recommendation seed.
        followedArtistsMeta: {
            type: [
                {
                    _id: false,
                    name: { type: String, default: "" },
                    channelId: { type: String, default: "" },
                    thumbnail: { type: String, default: "" },
                    followedAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
        notInterested: {
            type: [String],
            default: []
        },
        snoozedTracks: {
            type: [String],
            default: []
        },
        explicitContent: {
            type: Boolean,
            default: false
        },
        settings: {
            eqPreset: { type: String, default: "Flat / Neutral" },
            eqBands: { type: [Number], default: [0, 0, 0, 0, 0] },
            dataSaver: { type: Boolean, default: false },
            audioOnly: { type: Boolean, default: false },
            videoQuality: { type: String, enum: ["auto", "720p", "1080p", "audio-only"], default: "auto" },
            wifiOnlyDownloads: { type: Boolean, default: false },
            streamingQuality: { type: String, enum: ["auto", "low", "normal", "high", "very-high"], default: "auto" },
            normalization: { type: String, enum: ["quiet", "normal", "loud"], default: "normal" },
            monoAudio: { type: Boolean, default: false },
            explicitContent: { type: Boolean, default: false },
            privateSession: { type: Boolean, default: false },
            syncedLyrics: { type: Boolean, default: true },
            pictureInPicture: { type: Boolean, default: true },
            masterVolume: { type: Number, min: 0, max: 1, default: 0.85 },
            keyboardShortcuts: { type: Boolean, default: true },
            captions: { type: Boolean, default: true },
            fadeEnabled: { type: Boolean, default: true },
            fadeSeconds: { type: Number, min: 0, max: 12, default: 0.8 },
            spatialAudio: { type: Boolean, default: false },
        },
    },
    { timestamps: true, toJSON: { flattenMaps: true } }
);

export default mongoose.models.userData || mongoose.model("userData", fileSchema, "userData");