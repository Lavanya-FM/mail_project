# ComposeEmail.tsx Integration Guide

## Step 1: Update Line 2 - Add HardDrive to imports
**Find this line:**
```typescript
import { X, Send, Paperclip, Link, Smile, Clock, Share2, Zap, Info } from 'lucide-react';
```

**Replace with:**
```typescript
import { X, Send, Paperclip, Link, Smile, Clock, Share2, Zap, Info, HardDrive } from 'lucide-react';
```

## Step 2: After line 5 - Add new imports
**Add these two lines after `import { p2pService } from '../lib/p2pService';`:**
```typescript
import AttachFromDriveModal from './AttachFromDriveModal';
import type { DriveFile } from '../lib/driveService';
```

## Step 3: After line 65 - Add state variables
**Find this line:**
```typescript
const [p2pConnected, setP2pConnected] = useState(false);
```

**Add these two lines right after it:**
```typescript
const [showAttachFromDrive, setShowAttachFromDrive] = useState(false);
const [driveAttachments, setDriveAttachments] = useState<DriveFile[]>([]);
```

## Step 4: Around line 646 - Add HardDrive button
**Find the Paperclip button block (around line 603-608):**
```typescript
<button
  onClick={handleAttachment}
  className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
  title="Attach file"
>
  <Paperclip className="w-4 h-4" />
</button>
```

**Add this button RIGHT AFTER the Paperclip button (before the input element):**
```typescript
<button
  onClick={() => setShowAttachFromDrive(true)}
  className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
  title="Attach from JeeDrive"
>
  <HardDrive className="w-4 h-4" />
</button>
```

## Step 5: Before the final closing tags - Add modal
**Find the very end of the component (around line 766), just BEFORE `</div>` and `);`:**

**Add this modal component:**
```typescript
{/* Attach from JeeDrive Modal */}
<AttachFromDriveModal
  isOpen={showAttachFromDrive}
  onClose={() => setShowAttachFromDrive(false)}
  onAttach={(files) => {
    setDriveAttachments([...driveAttachments, ...files]);
    console.log(`Attached ${files.length} file(s) from JeeDrive:`, files);
  }}
/>
```

## That's it!
The Attach from JeeDrive feature will now work. Click the HardDrive icon next to the Paperclip to open the file browser.
