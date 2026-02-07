// src/lib/fileUtils.ts

export async function filesToBase64(files: File[]): Promise<Array<{
  filename: string;
  mime_type: string;
  size_bytes: number;
  content: string;
}>> {
  const results = [];

  for (const file of files) {
    const base64 = await fileToBase64(file);
    results.push({
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      content: base64
    });
  }

  return results;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:mime;base64,....."
      // we usually just want the base64 part
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
