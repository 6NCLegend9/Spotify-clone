import { MongoClient } from "mongodb";

let db = null;
let connectionPromise = null;

export const ConnectDB = async (callback) => {
  if (!connectionPromise) {
    let dbName = process.env.MONGODB_DB_NAME || "musicon";
    connectionPromise = MongoClient.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
    }).then((res) => {
      db = res.db(dbName);
      return res;
    });
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
