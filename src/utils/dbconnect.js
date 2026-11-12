import mongoose from "mongoose";
import { resolveMongoConnectionUrl } from "./mongoSrvUrl.mjs";
import { mongoPoolSize } from "./mongoPoolSize.mjs";
import { ApiRouteError } from "./apiResponseCore.mjs";

const getMongoUrl = () =>
  (process.env.MONGODB_URL || "").trim() || (process.env.MONGODB_URI || "").trim();

function unavailable() {
  return new ApiRouteError("SERVICE_UNAVAILABLE", {
    message: "HayKasa data is temporarily unavailable. Please try again later.",
    headers: { "Retry-After": "30" },
  });
}

const globalCache = globalThis;
const cached = globalCache.__HeyKasaMongoose || {
  connection: null,
  promise: null,
};

globalCache.__HeyKasaMongoose = cached;
mongoose.set("bufferCommands", false);

const dbConnect = async () => {
  const mongoUrl = getMongoUrl();
  if (!mongoUrl) {
    throw unavailable();
  }

  if (cached.connection) {
    return cached.connection;
  }

  if (!cached.promise) {
    cached.promise = resolveMongoConnectionUrl(mongoUrl).then((connectionUrl) =>
      mongoose.connect(connectionUrl, {
        dbName: (process.env.DB_NAME || "").trim() || undefined,
        family: 4,
        maxPoolSize: mongoPoolSize(process.env.MONGODB_MAX_POOL_SIZE),
        maxIdleTimeMS: 10_000,
        serverSelectionTimeoutMS: 10_000,
      }),
    );
  }

  try {
    cached.connection = await cached.promise;
    return cached.connection;
  } catch {
    cached.promise = null;
    // Only connection establishment is classified here. Query/programming errors
    // still reach the route's normal error handler; credentials never reach clients.
    throw unavailable();
  }
};

export default dbConnect;
