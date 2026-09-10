const Database = require('better-sqlite3');
const db = new Database('../../data/local-notebook-ai.sqlite');
const rows = db.prepare("SELECT chunk_index, length(embedding_vector_ref) as vec_len FROM document_chunks WHERE file_id = ?").all(process.argv[2]);
console.log(JSON.stringify(rows, null, 2));
