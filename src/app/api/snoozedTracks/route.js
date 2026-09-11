import { feedbackHandlers } from "@/utils/feedbackRoute";

export const runtime = "nodejs";
export const maxDuration = 15;

const handlers = feedbackHandlers("snoozedTracks");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
