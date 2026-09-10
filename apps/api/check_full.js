const Database = require('better-sqlite3');
const db = new Database('../../data/local-notebook-ai.sqlite');
const row = db.prepare("SELECT content, length(content) as byte_len FROM document_chunks WHERE file_id = 'c1a685f5-bc4a-47a4-9092-03a3aee46061' AND chunk_index = 0").get();
console.log("length:", row.byte_len);
console.log("---content---");
console.log(row.content);
console.log("---end---");
