export const AttachmentManifestSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AttachmentManifest",
    "type": "object",
    "properties": {
        "attachment_id": { "type": "string" },
        "message_id": { "type": "string" },
        "total_size": { "type": "integer", "minimum": 0 },
        "chunk_size": { "type": "integer", "minimum": 1 },
        "total_chunks": { "type": "integer", "minimum": 1 },
        "chunk_hashes": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1
        },
        "encryption_meta": {
            "type": "object",
            "required": ["algorithm", "iv"],
            "properties": {
                "algorithm": { "type": "string" },
                "iv": { "type": "string" },
                "key_hash": { "type": "string" }
            },
            "additionalProperties": true
        },
        "transfer_policy": {
            "type": "object",
            "required": ["retries", "timeout"],
            "properties": {
                "retries": { "type": "integer", "minimum": 0 },
                "timeout": { "type": "integer", "minimum": 0 }
            },
            "additionalProperties": true
        },
        "delivery_mode": { "type": "string", "const": "P2P" }
    },
    "required": [
        "attachment_id",
        "message_id",
        "total_size",
        "chunk_size",
        "total_chunks",
        "chunk_hashes",
        "encryption_meta",
        "transfer_policy",
        "delivery_mode"
    ]
};

export const ChunkMessageSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ChunkMessage",
    "type": "object",
    "properties": {
        "message_id": { "type": "string" },
        "attachment_id": { "type": "string" },
        "chunk_index": { "type": "integer", "minimum": 0 },
        "encrypted_payload": { "type": "string" },
        "checksum": { "type": "string" }
    },
    "required": ["message_id", "attachment_id", "chunk_index", "encrypted_payload", "checksum"]
};

export const AckResumeMessageSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AckResumeMessage",
    "type": "object",
    "properties": {
        "message_id": { "type": "string" },
        "attachment_id": { "type": "string" },
        "received_chunks": {
            "type": "array",
            "items": { "type": "integer", "minimum": 0 }
        },
        "missing_chunks": {
            "type": "array",
            "items": { "type": "integer", "minimum": 0 }
        }
    },
    "required": ["message_id", "attachment_id", "received_chunks", "missing_chunks"]
};
