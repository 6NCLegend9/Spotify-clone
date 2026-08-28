import { MongoClient } from "mongodb";

let clientPromise;
export async function getDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  clientPromise ||= MongoClient.connect(process.env.MONGODB_URI);
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB_NAME || "musicon");
}
