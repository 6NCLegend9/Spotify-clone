import { MongoClient } from "mongodb";

let db = null;
let connectionPromise = null;

export const ConnectDB = async (callback) => {
  if (!connectionPromise) {
    let dbName = process.env.MONGODB_DB_NAME || "musicon";
    if (!process.env.MONGODB_URI) {
      callback(new Error("MONGODB_URI is not configured"), null);
      return;
    }

    try {
      connectionPromise = MongoClient.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
      }).then((res) => {
        db = res.db(dbName);
        return res;
      });
    } catch (err) {
      callback(err, null);
      return;
    }
  }

  try {
    let res = await connectionPromise;
    callback(null, res);
  } catch (err) {
    connectionPromise = null;
    callback(err, null);
  }
};

export { db };
