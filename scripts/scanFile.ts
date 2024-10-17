import * as fs from "fs";
import * as path from "path";
import axios from "axios";

const videoExtensions = new Set([".mp4", ".mkv", ".avi", ".mov", ".flv"]);

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return videoExtensions.has(ext);
}

function escapeForSQL(filePath: string): string {
  return filePath.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

function scanDirectory(
  dir: string,
  baseDir: string
): { path: string; filename: string }[] {
  let results: { path: string; filename: string }[] = [];

  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.resolve(dir, file);
    const relativePath = path.relative(baseDir, filePath);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      results = results.concat(scanDirectory(filePath, baseDir));
    } else if (isVideoFile(filePath)) {
      results.push({
        path: escapeForSQL(relativePath), // Escape path for SQL
        filename: escapeForSQL(file), // Escape filename for SQL
      });
    }
  });

  return results;
}

function getVideoFilesFromDir(
  startDir: string
): { path: string; filename: string }[] {
  if (!fs.existsSync(startDir)) {
    console.error("Directory does not exist:", startDir);
    return [];
  }

  return scanDirectory(startDir, startDir);
}

// Example usage:
const videos = getVideoFilesFromDir("public");
console.log("Video files:", videos);

videos.forEach((item) => {
  axios
    .post("http://localhost:3000/videos", {
      name: item.filename,
      url: `/public/${item.path}`,
    })
    .then((res) => {
      console.log(res.data);
    });
});
