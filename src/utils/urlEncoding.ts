export const encodeEmailId = (id: string | number): string => {
    const str = `msg-${id}`;
    // Use a simple base64 encoding for "random looking" string
    // In a real app, this might be a UUID from the database
    try {
        return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        return String(id);
    }
};

export const decodeEmailId = (encoded: string): string | null => {
    try {
        let str = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        const decoded = atob(str);
        if (decoded.startsWith('msg-')) {
            return decoded.slice(4);
        }
        return null;
    } catch (e) {
        // If it's not encoded or invalid, return it as is if it looks numeric, or null
        // This allows backward compatibility if we had plain IDs before
        if (!isNaN(Number(encoded))) {
            return encoded;
        }
        return null;
    }
};
