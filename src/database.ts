import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";

const dbFilePath = path.join(__dirname, "../database.sqlite");

const dbExists = fs.existsSync(dbFilePath);
const db = new sqlite3.Database(dbFilePath);

if (!dbExists) {
  db.serialize(() => {
    db.run(`CREATE TABLE videos (
      name TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      description TEXT
    )`);

    db.run(`CREATE TABLE playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT
    )`);

    db.run(`CREATE TABLE playlist_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      video_name TEXT NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (video_name) REFERENCES videos(name) ON DELETE CASCADE
    )`);
  });
}

export default db;
