import mongoose from "mongoose";

const getMongoUrl = () =>
  (process.env.MONGODB_URL || process.env.MONGODB_URI || "").trim();

const globalCache = globalThis;
const cached = globalCache.__hayasakaMongoose || {
  connection: null,
  promise: null,
};

globalCache.__hayasakaMongoose = cached;
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
    cached.promise = mongoose.connect(mongoUrl, {
      dbName: (process.env.DB_NAME || "").trim() || undefined,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
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
