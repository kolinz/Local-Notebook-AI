const Database = require('better-sqlite3');
const db = new Database('../../data/local-notebook-ai.sqlite');
const rows = db.prepare("SELECT chunk_index, length(content) as len, CASE WHEN embedding_vector_ref IS NULL THEN 'NULL' ELSE 'SET' END as vec FROM document_chunks WHERE file_id = 'c1a685f5-bc4a-47a4-9092-03a3aee46061' ORDER BY chunk_index").all();
console.log(JSON.stringify(rows, null, 2));
