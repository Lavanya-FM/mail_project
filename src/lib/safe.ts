export function safeArray<T>(arr: any): T[] {
  if (Array.isArray(arr)) return arr;
  if (arr == null) return [];
  try { return Array.from(arr); } catch(e) { return []; }
}
