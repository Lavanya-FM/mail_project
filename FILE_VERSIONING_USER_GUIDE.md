# File Versioning - User Guide

## 📚 How to Use File Versioning in JeeDrive

File versioning in JeeDrive allows you to track changes to your files over time and restore previous versions when needed.

---

## 🎯 Quick Start

### Viewing Version History

1. **Navigate to JeeDrive**
   - Click on "Drive" in the sidebar

2. **Select a File**
   - Right-click on any file
   - Select "Version History" from the context menu

3. **View Versions**
   - See all previous versions listed chronologically
   - Current version shown at the top with "Active" badge
   - Each version shows:
     - Version number
     - Date and time created
     - File size

### Restoring a Previous Version

1. **Open Version History**
   - Right-click file → "Version History"

2. **Select Version to Restore**
   - Click "Restore" button next to desired version

3. **Confirm Restoration**
   - Confirm the action in the dialog
   - Note: Current version will be saved as a new revision

4. **Done!**
   - Selected version is now the current version
   - Previous current version saved in history
   - No data is lost

---

## 🔄 How Versioning Works

### Automatic Version Creation

Versions are created automatically when you:

1. **Update an Existing File**
   ```
   Upload → File exists → Current version saved → New version becomes current
   ```

2. **Replace a File**
   ```
   Drag & drop → Confirm replace → Old version archived → New file active
   ```

### Version Numbering

- **Version 1:** First update after initial upload
- **Version 2:** Second update
- **Version N:** Nth update
- **Current:** Always the latest version

### Example Timeline

```
Day 1: Upload "Report.pdf" (no version yet)
Day 2: Update "Report.pdf" → Version 1 created (original saved)
Day 3: Update "Report.pdf" → Version 2 created (Day 2 version saved)
Day 4: Restore Version 1 → Version 3 created (Day 3 version saved)
       Current file now has Day 1 content
```

---

## 💡 Use Cases

### 1. Accidental Changes

**Scenario:** You accidentally deleted important content from a document.

**Solution:**
1. Open version history
2. Find version before the mistake
3. Restore that version
4. Your content is back!

### 2. Collaborative Editing

**Scenario:** Multiple people editing a file, need to see who changed what.

**Solution:**
1. Check version history
2. See timestamps of each change
3. Restore to any point in time
4. Compare versions manually

### 3. Compliance & Audit

**Scenario:** Need to prove what the document looked like on a specific date.

**Solution:**
1. Open version history
2. Find version from that date
3. Download or restore
4. Use as evidence

### 4. Experimentation

**Scenario:** Want to try major changes but keep original safe.

**Solution:**
1. Make changes (creates new version)
2. If you like it, keep it
3. If not, restore previous version
4. No risk of losing original

---

## 🎨 UI Guide

### Version History Modal

```
┌─────────────────────────────────────────────────────┐
│ 📜 Version History                              ✕   │
│ document.pdf                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 3  Current Version              [Active]    │ │
│ │ 🕐 Feb 11, 2026 3:15 PM • 2.5 MB              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ─────────────────────────────────────────────────── │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 2  Revision 2            [Restore ↻]        │ │
│ │ 🕐 Feb 10, 2026 10:30 AM • 2.3 MB            │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 1  Revision 1            [Restore ↻]        │ │
│ │ 🕐 Feb 9, 2026 2:45 PM • 2.1 MB              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                        [Close]      │
└─────────────────────────────────────────────────────┘
```

### Elements Explained

- **📄 Number Badge:** Version number
- **Current Version:** The active file
- **[Active] Badge:** Indicates current version
- **🕐 Timestamp:** When version was created
- **File Size:** Size of that version
- **[Restore ↻] Button:** Click to restore this version

---

## ⚠️ Important Notes

### What Happens When You Restore

1. ✅ Selected version becomes current
2. ✅ Previous current saved as new version
3. ✅ All versions preserved
4. ✅ No data is lost
5. ✅ Version number increments

### What Doesn't Create Versions

- ❌ Renaming a file
- ❌ Moving a file
- ❌ Starring a file
- ❌ Changing permissions
- ❌ Adding to folder

### Storage Considerations

- Each version uses storage space
- Versions count toward your quota
- Deleting a file deletes all its versions
- Consider cleaning up old versions periodically

---

## 🔐 Permissions

### Who Can View Versions?

- ✅ File owner
- ✅ Users with VIEW permission
- ✅ Users with EDIT permission
- ✅ Users with DOWNLOAD permission

### Who Can Restore Versions?

- ✅ File owner
- ✅ Users with EDIT permission
- ❌ Users with only VIEW permission
- ❌ Users with only DOWNLOAD permission

---

## 🐛 Troubleshooting

### "No previous versions found"

**Cause:** File has never been updated

**Solution:** This is normal for newly created files. Versions are created when you update the file.

### Restore button not working

**Cause:** You don't have EDIT permission

**Solution:** Ask the file owner to grant you EDIT permission or restore the version themselves.

### Version history not loading

**Cause:** Network issue or server problem

**Solution:** 
1. Refresh the page
2. Try again
3. Check your internet connection
4. Contact support if persists

### Old versions taking too much space

**Cause:** Many versions accumulated

**Solution:**
1. Manually delete old files
2. Upload fresh version
3. Contact admin for bulk cleanup

---

## 💡 Tips & Best Practices

### 1. Regular Updates

- Update files regularly to create checkpoints
- Don't wait until major changes to save
- Small, frequent versions are easier to track

### 2. Meaningful Timing

- Save versions before major edits
- Create version after completing a section
- Version before sharing with others

### 3. Version Management

- Review version history monthly
- Keep only necessary old versions
- Delete very old versions to save space

### 4. Collaboration

- Communicate with team about versions
- Agree on version naming conventions
- Use comments (when feature available)

---

## 🔮 Coming Soon

### Planned Features

1. **Version Comparison**
   - See what changed between versions
   - Side-by-side diff view
   - Highlight differences

2. **Version Comments**
   - Add notes to each version
   - Explain what changed
   - Search by comment

3. **Automatic Versioning**
   - Auto-save every N minutes
   - Configurable intervals
   - Smart deduplication

4. **Version Retention**
   - Auto-delete old versions
   - Keep last N versions
   - Configurable policies

---

## 📞 Support

### Need Help?

- **Email:** support@jeemail.in
- **Documentation:** This guide
- **Video Tutorial:** Coming soon

### Report Issues

If you encounter problems:
1. Note the file name
2. Note the version number
3. Describe what happened
4. Contact support with details

---

## ✅ Quick Reference

| Action | How To |
|--------|--------|
| View versions | Right-click file → Version History |
| Restore version | Version History → Click Restore |
| Check current version | Look for "Active" badge |
| See version date | Check timestamp in version list |
| See version size | Listed next to timestamp |

---

**Last Updated:** 2026-02-11  
**Version:** 1.0  
**Status:** Production Ready

Enjoy using file versioning in JeeDrive! 🚀
