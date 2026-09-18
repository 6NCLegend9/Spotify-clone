import dbConnect from "@/utils/dbconnect";
import WeekPulse from "@/models/WeekPulse";
import { recordPulsePlay, utcWeekKey } from "@/utils/weekPulse.mjs";

export async function incrementWeekPulse(videoId) {
  const tracks = recordPulsePlay([], videoId);
  if (!tracks.length) return;
  await dbConnect();
  const weekKey = utcWeekKey();
  const current = await WeekPulse.findOne({ weekKey }).lean();
  const nextTracks = recordPulsePlay(current?.tracks, videoId);
  await WeekPulse.updateOne(
    { weekKey },
    { $set: { tracks: nextTracks } },
    { upsert: true },
  );
}
