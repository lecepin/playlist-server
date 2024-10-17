import express, { Request, Response } from "express";
import cors from "cors";
import db from "./database";

interface Playlist {
  id: number;
  name: string;
  description: string;
}

interface Video {
  name: string;
  url: string;
  description: string;
}

const app = express();
app.use(express.json());
app.use("/public", express.static("public"));
app.use(cors());

// 添加新视频
app.post("/videos", (req: Request, res: Response) => {
  const { name, url, description } = req.body;
  db.run(
    `INSERT INTO videos (name, url, description) VALUES (?, ?, ?)`,
    [name, url, description],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ name });
    }
  );
});

// 修改视频描述
app.put("/videos/:name", (req: Request, res: Response) => {
  const { name } = req.params;
  const { description } = req.body;
  db.run(
    `UPDATE videos SET description = ? WHERE name = ?`,
    [description, name],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ updated: this.changes });
    }
  );
});

// 添加新播放列表
app.post("/playlists", (req: Request, res: Response) => {
  const { name, description } = req.body;
  db.run(
    `INSERT INTO playlists (name, description) VALUES (?, ?)`,
    [name, description],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID });
    }
  );
});

// 将视频添加到播放列表
app.post(
  "/playlists/:playlistId/videos/:videoName",
  (req: Request, res: Response) => {
    const { playlistId, videoName } = req.params;

    // 查询当前播放列表中最大的 position 值
    db.get(
      `SELECT MAX(position) as maxPosition FROM playlist_videos WHERE playlist_id = ?`,
      [playlistId],
      (err, row: any) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // 如果没有视频，maxPosition 为 null，设置为 0
        const newPosition = (row?.maxPosition ?? 0) + 1;

        // 插入新的视频记录
        db.run(
          `INSERT INTO playlist_videos (playlist_id, video_name, position) VALUES (?, ?, ?)`,
          [playlistId, videoName, newPosition],
          function (err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID });
          }
        );
      }
    );
  }
);

// 将视频从播放列表中移除
app.delete("/playlists/:playlistId/videos/:videoName", (req, res) => {
  const { playlistId, videoName } = req.params;

  const query = `
    DELETE FROM playlist_videos 
    WHERE playlist_id = ? AND video_name = ?
  `;

  db.run(query, [playlistId, videoName], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Video removed from playlist" });
  });
});

// 删除视频
app.delete("/videos/:name", (req: Request, res: Response) => {
  const { name } = req.params;
  db.run(`DELETE FROM videos WHERE name = ?`, name, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ deleted: this.changes });
  });
});

// 调整视频顺序
app.post(
  "/playlists/:playlistId/videos/:videoName/move",
  (req: Request, res: Response) => {
    const { playlistId, videoName } = req.params;
    const { direction } = req.body; // 'up', 'down', 'top', 'bottom'

    db.get(
      `SELECT position FROM playlist_videos WHERE playlist_id = ? AND video_name = ?`,
      [playlistId, videoName],
      (err, row: any) => {
        if (err || !row) {
          return res.status(404).json({ error: "Video not found in playlist" });
        }

        let newPosition: number;
        switch (direction) {
          case "up":
            newPosition = row.position - 1;
            break;
          case "down":
            newPosition = row.position + 1;
            break;
          case "top":
            newPosition = 1;
            break;
          case "bottom":
            db.get(
              `SELECT MAX(position) as maxPosition FROM playlist_videos WHERE playlist_id = ?`,
              [playlistId],
              (err, maxRow: any) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }
                newPosition = maxRow.maxPosition + 1;
                updatePosition(newPosition);
              }
            );
            return;
          default:
            return res.status(400).json({ error: "Invalid direction" });
        }

        updatePosition(newPosition);
      }
    );

    function updatePosition(newPosition: number) {
      db.run(
        `UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_name = ?`,
        [newPosition, playlistId, videoName],
        function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ updated: this.changes });
        }
      );
    }
  }
);

// 获取所有视频
app.get("/videos", (req: Request, res: Response) => {
  const { listId } = req.query;

  let query = `
    SELECT 
      videos.name, 
      videos.url, 
      videos.description, 
      COALESCE(
        json_group_array(
          CASE 
            WHEN playlists.id IS NOT NULL THEN
              json_object(
                'id', playlists.id,
                'name', playlists.name,
                'description', playlists.description
              )
            ELSE
              NULL
          END
        ),
        '[]'
      ) AS lists
    FROM 
      videos
    LEFT JOIN 
      playlist_videos ON videos.name = playlist_videos.video_name
    LEFT JOIN 
      playlists ON playlist_videos.playlist_id = playlists.id
  `;

  if (listId) {
    query += `WHERE playlists.id = ? `;
  }

  query += `
    GROUP BY videos.name
  `;

  if (listId) {
    query += `
      ORDER BY playlist_videos.position ASC
    `;
  }

  db.all(query, listId ? [listId] : [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(
      rows.map((row: any) => {
        if (row.lists === "[null]") {
          row.lists = "[]";
        }

        row.lists = JSON.parse(row.lists);

        return row;
      })
    );
  });
});

// 获取所有播放列表
app.get("/playlists", (req: Request, res: Response) => {
  db.all(
    `SELECT id, name, description FROM playlists`,
    (err, rows: Playlist[]) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// 获取视频所在的所有播放列表
app.get("/videos/:name/playlists", (req: Request, res: Response) => {
  const { name } = req.params;
  db.all(
    `SELECT playlists.id, playlists.name, playlists.description FROM playlists
            JOIN playlist_videos ON playlists.id = playlist_videos.playlist_id
            WHERE playlist_videos.video_name = ?`,
    [name],
    (err, rows: Playlist[]) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// 获取特定播放列表中的视频，按 position 升序排序
app.get("/playlists/:playlistId/videos", (req: Request, res: Response) => {
  const { playlistId } = req.params;

  db.all(
    `SELECT videos.name, videos.url, videos.description, playlist_videos.position
       FROM playlist_videos
       JOIN videos ON playlist_videos.video_name = videos.name
       WHERE playlist_videos.playlist_id = ?
       ORDER BY playlist_videos.position ASC`,
    [playlistId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
