// src/lib/fileUtils.ts

export async function filesToBase64(files: File[]): Promise<Array<{
  filename: string;
  mime_type: string;
  size_bytes: number;
  content: string;
}>> {
  const results = [];
  
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );
    
    results.push({
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      content: base64
    });
  }
  
  return results;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ''
    )
  );
}
