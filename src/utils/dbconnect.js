import mongoose from "mongoose";
import { resolveMongoConnectionUrl } from "./mongoSrvUrl.mjs";
import { mongoPoolSize } from "./mongoPoolSize.mjs";

const getMongoUrl = () =>
  (process.env.MONGODB_URL || process.env.MONGODB_URI || "").trim();

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
    throw new Error("MONGODB_URL or MONGODB_URI is not configured.");
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
  } catch (error) {
    cached.promise = null;
    throw error;
  }
};

export default dbConnect;
