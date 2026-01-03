import mongoose from "mongoose";
export async function connectDB() {
    let uri = process.env.MONGO_URI;
    const username = process.env.MONGO_USERNAME;
    const password = process.env.MONGO_PASSWORD;
    const authDb = process.env.MONGO_AUTH_DB || process.env.MONGO_DB_NAME || "test_db";
    // If MONGO_URI is provided but doesn't include auth, add it if username/password are available
    if (uri && username && password && !uri.includes("@")) {
        const encodedPassword = encodeURIComponent(password);
        // Insert credentials after mongodb://
        uri = uri.replace("mongodb://", `mongodb://${username}:${encodedPassword}@`);
        // Add authSource if not present
        if (!uri.includes("authSource")) {
            uri += uri.includes("?") ? `&authSource=${authDb}` : `?authSource=${authDb}`;
        }
    }
    else if (!uri) {
        // Construct URI from individual parts
        const host = process.env.MONGO_HOST || "localhost";
        const port = process.env.MONGO_PORT || "27017";
        const dbName = process.env.MONGO_DB_NAME || "test_db";
        if (username && password) {
            const encodedPassword = encodeURIComponent(password);
            uri = `mongodb://${username}:${encodedPassword}@${host}:${port}/${dbName}?authSource=${authDb}`;
        }
        else {
            uri = `mongodb://${host}:${port}/${dbName}`;
        }
    }
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected");
}
