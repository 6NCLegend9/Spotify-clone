import mongoose from "mongoose";

const getMongoUrl = () =>
  (process.env.MONGODB_URL || process.env.MONGODB_URI || "").trim();

const dbConnect = async () => {
  const mongoUrl = getMongoUrl();
  if (!mongoUrl) {
    throw new Error("Please define MONGODB_URL inside .env.local");
  }
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  return mongoose
    .connect(mongoUrl, {
      dbName: (process.env.DB_NAME || "").trim() || undefined,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => console.log("connected to db"))
    .catch((err) => console.log(err));
};

export default dbConnect;
