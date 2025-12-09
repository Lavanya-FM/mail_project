/**
 * backend/drive.js
 */
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const router = express.Router();

/* ===============================
   BASE UPLOAD SETUP
================================ */
const ROOT_UPLOADS = path.join(__dirname, "uploads");
if (!fs.existsSync(ROOT_UPLOADS)) fs.mkdirSync(ROOT_UPLOADS);

function ensureUserDir(userId) {
  const dir = path.join(ROOT_UPLOADS, String(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ROOT_UPLOADS),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, `temp-${unique}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

/* ===============================
   UPLOAD FILE (supports folder_id)
================================ */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id;
    const folderId = req.body.folder_id || null;

    if (!userId)
      return res.status(400).json({ error: "user_id is required" });

    if (!req.file)
      return res.status(400).json({ error: "File is required" });

    const userDir = ensureUserDir(userId);
    const newFilename = req.file.filename.replace("temp-", "");
    const oldPath = req.file.path;
    const newPath = path.join(userDir, newFilename);
    fs.renameSync(oldPath, newPath);

    await db.query(
      `INSERT INTO drive_files (user_id, filename, filepath, size, folder_id)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, newFilename, newPath, req.file.size, folderId]
    );

    res.json({
      success: true,
      filename: newFilename,
      folder_id: folderId,
      url: `/uploads/${userId}/${newFilename}`
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

/* ===============================
   GET FOLDER CONTENTS
================================ */
router.get("/contents", async (req, res) => {
  try {
    const userId = req.query.user_id;
    let folderId = req.query.folder_id;

    if (!userId)
      return res.status(400).json({ error: "user_id is required" });

    // Normalize folderId
    if (folderId === undefined || folderId === null || folderId === "" || folderId === "0") {
      folderId = null; // treat 0 as root
    } else {
      folderId = Number(folderId);
    }

    // --- FILES ---
    let filesQuery = `
      SELECT id, filename, filepath, size, is_starred, folder_id, created_at, user_id
      FROM drive_files
      WHERE user_id = ?
      AND (is_deleted = 0 OR is_deleted IS NULL)
      AND ${folderId === null ? "folder_id IS NULL" : "folder_id = ?"}
      ORDER BY created_at DESC
    `;

    const filesParams = folderId === null ? [userId] : [userId, folderId];

    const [filesRaw] = await db.query(filesQuery, filesParams);

    const files = filesRaw.map(f => ({
      id: f.id,
      name: f.filename,
      filename: f.filename,
      user_id: f.user_id || userId,
      filepath: f.filepath,
      size_bytes: f.size,
      file_type: f.filename.split('.').pop(),
      folder_id: f.folder_id,
      is_starred: !!f.is_starred,
      created_at: f.created_at,
      updated_at: f.created_at
    }));

    // --- FOLDERS ---
    let foldersQuery = `
      SELECT id, name, parent_folder_id, created_at, updated_at
      FROM drive_folders
      WHERE user_id = ?
      AND ${folderId === null ? "parent_folder_id IS NULL" : "parent_folder_id = ?"}
      ORDER BY name ASC
    `;

    const foldersParams = folderId === null ? [userId] : [userId, folderId];

    const [folders] = await db.query(foldersQuery, foldersParams);

    res.json({ success: true, files, folders });

  } catch (err) {
    console.error("CONTENT ERROR:", err);
    res.status(500).json({ error: "Failed to fetch contents" });
  }
});

/* ===============================
   CREATE FOLDER
================================ */
router.post("/folder", async (req, res) => {
  try {
    const { user_id, parent_folder_id, name } = req.body;

    if (!user_id || !name)
      return res.status(400).json({ error: "user_id and name are required" });

    const [existing] = await db.query(
      `SELECT id FROM drive_folders
       WHERE user_id = ? AND name = ? 
       AND (${parent_folder_id ? "parent_folder_id = ?" : "parent_folder_id IS NULL"})`,
      parent_folder_id ? [user_id, name, parent_folder_id] : [user_id, name]
    );

    if (existing.length > 0)
      return res.status(409).json({ error: "Folder already exists" });

    const [result] = await db.query(
      `INSERT INTO drive_folders (user_id, parent_folder_id, name, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [user_id, parent_folder_id || null, name]
    );

    res.json({
      success: true,
      folder: { id: result.insertId, name, parent_folder_id }
    });

  } catch (err) {
    console.error("CREATE FOLDER ERROR:", err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

/* ===============================
   MOVE FILE TO FOLDER
================================ */
router.post("/move", async (req, res) => {
  try {
    const { file_id, folder_id, user_id } = req.body;

    if (!file_id || !user_id)
      return res.status(400).json({ error: "file_id and user_id required" });

    await db.query(
      "UPDATE drive_files SET folder_id = ? WHERE id = ? AND user_id = ?",
      [folder_id || null, file_id, user_id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("MOVE FILE ERROR:", err);
    res.status(500).json({ error: "Failed to move file" });
  }
});

/* ===============================
   STAR / UNSTAR FILE
================================ */
router.post("/toggle-star", async (req, res) => {
  try {
    const { file_id, is_starred, user_id } = req.body;

    if (!file_id || user_id == null)
      return res.status(400).json({ error: "file_id and user_id required" });

    await db.query(
      "UPDATE drive_files SET is_starred = ? WHERE id = ? AND user_id = ?",
      [is_starred ? 1 : 0, file_id, user_id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("STAR ERROR:", err);
    res.status(500).json({ error: "Failed to toggle star" });
  }
});

/* ===============================
   MOVE TO TRASH
================================ */
router.post("/trash", async (req, res) => {
  try {
    const { file_id, user_id } = req.body;

    if (!file_id || !user_id)
      return res.status(400).json({ error: "file_id and user_id required" });

    await db.query(
      "UPDATE drive_files SET is_deleted = 1, deleted_at = NOW() WHERE id = ? AND user_id = ?",
      [file_id, user_id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("TRASH ERROR:", err);
    res.status(500).json({ error: "Failed to trash file" });
  }
});

/* ===============================
   DELETE (Frontend expects POST /delete)
================================ */
router.post("/delete", async (req, res) => {
  try {
    const { file_id, user_id } = req.body;

    if (!file_id || !user_id)
      return res.status(400).json({ error: "file_id and user_id required" });

    const [[file]] = await db.query(
      "SELECT * FROM drive_files WHERE id = ? AND user_id = ?",
      [file_id, user_id]
    );

    if (!file)
      return res.status(404).json({ error: "File not found" });

    if (fs.existsSync(file.filepath))
      fs.unlinkSync(file.filepath);

    await db.query("DELETE FROM drive_files WHERE id = ?", [file_id]);

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

/* ===============================
   GET RECENT FILES
   GET /recent?user_id=1&limit=20
================================ */
router.get("/recent", async (req, res) => {
  try {
    const userId = req.query.user_id;
    const limit = Number(req.query.limit) || 20;

    if (!userId) return res.status(400).json({ error: "user_id is required" });

    const [rows] = await db.query(
      `SELECT id, filename, filepath, size, is_starred, folder_id, created_at, user_id
       FROM drive_files
       WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    const files = (rows || []).map(f => ({
      id: f.id,
      name: f.filename,
      filename: f.filename,
      user_id: f.user_id || userId,
      filepath: f.filepath,
      size_bytes: f.size,
      file_type: (f.filename || "").split('.').pop(),
      folder_id: f.folder_id,
      is_starred: !!f.is_starred,
      created_at: f.created_at,
      updated_at: f.created_at
    }));

    res.json({ success: true, files });
  } catch (err) {
    console.error("RECENT ERROR:", err);
    res.status(500).json({ error: "Failed to fetch recent files" });
  }
});

/* ===============================
   GET STARRED FILES
   GET /starred?user_id=1
================================ */
router.get("/starred", async (req, res) => {
  try {
    const userId = req.query.user_id;

    if (!userId) return res.status(400).json({ error: "user_id is required" });

    const [rows] = await db.query(
      `SELECT id, filename, filepath, size, is_starred, folder_id, created_at, user_id
       FROM drive_files
       WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND is_starred = 1
       ORDER BY created_at DESC`,
      [userId]
    );

    const files = (rows || []).map(f => ({
      id: f.id,
      name: f.filename,
      filename: f.filename,
      user_id: f.user_id || userId,
      filepath: f.filepath,
      size_bytes: f.size,
      file_type: (f.filename || "").split('.').pop(),
      folder_id: f.folder_id,
      is_starred: !!f.is_starred,
      created_at: f.created_at,
      updated_at: f.created_at
    }));

    res.json({ success: true, files });
  } catch (err) {
    console.error("STARRED ERROR:", err);
    res.status(500).json({ error: "Failed to fetch starred files" });
  }
});

module.exports = router;
