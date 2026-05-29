# Table Operations

<cite>
**Referenced Files in This Document**
- [TableData.tsx](file://src/plugins/mysql-client/views/TableData.tsx)
- [ImportExport.tsx](file://src/plugins/mysql-client/views/ImportExport.tsx)
- [mysql-connections.ts](file://src/plugins/mysql-client/store/mysql-connections.ts)
- [types.ts](file://src/plugins/mysql-client/types.ts)
- [index.tsx](file://src/plugins/mysql-client/index.tsx)
- [DatabaseBrowser.tsx](file://src/plugins/mysql-client/views/DatabaseBrowser.tsx)
- [IndexManager.tsx](file://src/plugins/mysql-client/views/IndexManager.tsx)
- [commands.rs](file://src-tauri/src/plugins/mysql/commands.rs)
- [client_pool.rs](file://src-tauri/src/plugins/mysql/client_pool.rs)
- [types.rs](file://src-tauri/src/plugins/mysql/types.rs)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains MySQL table operations in RDMM, focusing on the table data viewer, import/export workflows, record editing, and schema management. It covers browsing and editing records with pagination, inline editing, and constraints-aware operations; importing and exporting data in JSON and CSV formats; and managing indexes and table metadata. Practical examples demonstrate working with large datasets, bulk operations, and ensuring data integrity during migrations.

## Project Structure
RDMM’s MySQL plugin is organized into React views, a Zustand store, and a Tauri-backed Rust backend. The frontend provides user interfaces for browsing, editing, and importing/exporting data, while the backend executes SQL, manages pools, and handles file operations.

```mermaid
graph TB
subgraph "Frontend"
IDX["index.tsx<br/>Plugin Root"]
DBB["DatabaseBrowser.tsx"]
TDATA["TableData.tsx<br/>Table Data Viewer"]
IMPEXP["ImportExport.tsx<br/>Import/Export"]
IDXMAN["IndexManager.tsx<br/>Indexes"]
end
subgraph "Store"
STORE["mysql-connections.ts<br/>Zustand Store"]
TYPES["types.ts<br/>Frontend Types"]
end
subgraph "Backend (Rust)"
CMDS["commands.rs<br/>Tauri Commands"]
POOL["client_pool.rs<br/>Connection Pool"]
BTYPES["types.rs<br/>Backend Types"]
end
IDX --> DBB
IDX --> TDATA
IDX --> IMPEXP
IDX --> IDXMAN
TDATA --> STORE
IMPEXP --> STORE
IDXMAN --> STORE
STORE --> CMDS
CMDS --> POOL
CMDS --> BTYPES
TYPES --> STORE
```

**Diagram sources**
- [index.tsx:14-37](file://src/plugins/mysql-client/index.tsx#L14-L37)
- [DatabaseBrowser.tsx:4-12](file://src/plugins/mysql-client/views/DatabaseBrowser.tsx#L4-L12)
- [TableData.tsx:5-21](file://src/plugins/mysql-client/views/TableData.tsx#L5-L21)
- [ImportExport.tsx:5-18](file://src/plugins/mysql-client/views/ImportExport.tsx#L5-L18)
- [IndexManager.tsx:5-14](file://src/plugins/mysql-client/views/IndexManager.tsx#L5-L14)
- [mysql-connections.ts:77-152](file://src/plugins/mysql-client/store/mysql-connections.ts#L77-L152)
- [types.ts:1-40](file://src/plugins/mysql-client/types.ts#L1-L40)
- [commands.rs:176-615](file://src-tauri/src/plugins/mysql/commands.rs#L176-L615)
- [client_pool.rs:7-65](file://src-tauri/src/plugins/mysql/client_pool.rs#L7-L65)
- [types.rs:1-97](file://src-tauri/src/plugins/mysql/types.rs#L1-L97)

**Section sources**
- [index.tsx:14-37](file://src/plugins/mysql-client/index.tsx#L14-L37)
- [mysql-connections.ts:77-152](file://src/plugins/mysql-client/store/mysql-connections.ts#L77-L152)

## Core Components
- Table Data Viewer: Displays paginated rows, supports inline edit and delete when a primary key exists, and allows inserting new rows via a JSON editor.
- Import/Export: Exports table rows to JSON or CSV and imports JSON/CSV files with preview and two modes (insert-only or replace-into).
- Index Manager: Lists indexes and supports creating/dropping indexes.
- Store: Centralizes state and exposes actions for data operations, navigation, and metadata retrieval.
- Backend Commands: Implements SQL execution, row operations, exports, imports, and server status.

**Section sources**
- [TableData.tsx:5-21](file://src/plugins/mysql-client/views/TableData.tsx#L5-L21)
- [ImportExport.tsx:5-18](file://src/plugins/mysql-client/views/ImportExport.tsx#L5-L18)
- [IndexManager.tsx:5-14](file://src/plugins/mysql-client/views/IndexManager.tsx#L5-L14)
- [mysql-connections.ts:48-61](file://src/plugins/mysql-client/store/mysql-connections.ts#L48-L61)
- [commands.rs:296-385](file://src-tauri/src/plugins/mysql/commands.rs#L296-L385)
- [commands.rs:503-601](file://src-tauri/src/plugins/mysql/commands.rs#L503-L601)

## Architecture Overview
The frontend communicates with the backend via Tauri commands. The store orchestrates UI actions and invokes backend commands. The backend uses a connection pool to execute SQL safely and efficiently.

```mermaid
sequenceDiagram
participant UI as "TableData.tsx"
participant Store as "mysql-connections.ts"
participant Cmd as "commands.rs"
participant Pool as "client_pool.rs"
UI->>Store : loadRows(offset, limit)
Store->>Cmd : cmd_mysql_select_rows(conn_id, db, table, offset, limit)
Cmd->>Pool : get_pool(conn_id)
Pool-->>Cmd : Pool
Cmd->>Cmd : Build SELECT with LIMIT/OFFSET
Cmd->>Pool : Execute query
Pool-->>Cmd : Rows
Cmd-->>Store : MysqlRowPage
Store-->>UI : rowPage
```

**Diagram sources**
- [TableData.tsx:13-16](file://src/plugins/mysql-client/views/TableData.tsx#L13-L16)
- [mysql-connections.ts:134-138](file://src/plugins/mysql-client/store/mysql-connections.ts#L134-L138)
- [commands.rs:296-322](file://src-tauri/src/plugins/mysql/commands.rs#L296-L322)
- [client_pool.rs:32-48](file://src-tauri/src/plugins/mysql/client_pool.rs#L32-L48)

## Detailed Component Analysis

### Table Data Viewer
The table viewer displays rows with a fixed page size, shows a “readonly” hint when no primary key exists, and enables inline edit/delete operations. It also supports inserting new rows via a JSON modal.

```mermaid
flowchart TD
Start(["Open Table"]) --> CheckPK["Detect Primary Keys"]
CheckPK --> HasPK{"Has PK?"}
HasPK --> |No| ReadOnly["Show 'readonly' notice"]
HasPK --> |Yes| Editable["Enable Edit/Delete"]
ReadOnly --> View["Render Table with Pagination"]
Editable --> View
View --> Actions{"Action?"}
Actions --> |Insert| OpenInsert["Open Insert Modal (JSON)"]
Actions --> |Edit| OpenEdit["Open Edit Modal (JSON)"]
Actions --> |Delete| ConfirmDelete["Confirm Delete"]
OpenInsert --> SaveInsert["Invoke insertRow()"]
OpenEdit --> SaveEdit["Invoke updateRow()"]
ConfirmDelete --> ExecDelete["Invoke deleteRow()"]
SaveInsert --> Refresh["Reload Rows"]
SaveEdit --> Refresh
ExecDelete --> Refresh
Refresh --> View
```

**Diagram sources**
- [TableData.tsx:10-21](file://src/plugins/mysql-client/views/TableData.tsx#L10-L21)
- [mysql-connections.ts:139-141](file://src/plugins/mysql-client/store/mysql-connections.ts#L139-L141)
- [commands.rs:324-385](file://src-tauri/src/plugins/mysql/commands.rs#L324-L385)

**Section sources**
- [TableData.tsx:5-21](file://src/plugins/mysql-client/views/TableData.tsx#L5-L21)
- [mysql-connections.ts:48-61](file://src/plugins/mysql-client/store/mysql-connections.ts#L48-L61)

### Import/Export Workflow
The import/export panel supports exporting to JSON or CSV and importing from JSON or CSV with a preview. Two import modes are supported: insert-only and replace-into.

```mermaid
sequenceDiagram
participant UI as "ImportExport.tsx"
participant Store as "mysql-connections.ts"
participant Cmd as "commands.rs"
UI->>Store : exportRows(format)
Store->>Cmd : cmd_mysql_export_rows(conn_id, db, table, format)
Cmd->>Cmd : Fetch up to N rows
Cmd->>Cmd : Write JSON or CSV to exports folder
Cmd-->>Store : Path
Store-->>UI : Path
UI->>Store : pickImportFile()
Store->>Cmd : cmd_mysql_pick_import_file()
Cmd-->>Store : Path (first .json/.csv)
Store-->>UI : Path
UI->>Store : previewImportFile(path, count)
Store->>Cmd : cmd_mysql_preview_import_file(path, count)
Cmd-->>Store : Preview rows
Store-->>UI : Preview
UI->>Store : importRows(path, mode)
Store->>Cmd : cmd_mysql_import_rows(conn_id, db, table, path, mode)
Cmd->>Cmd : Parse file to rows
Cmd->>Cmd : INSERT or REPLACE INTO per row
Cmd-->>Store : {successCount, failedCount, errors}
Store-->>UI : Result
```

**Diagram sources**
- [ImportExport.tsx:5-18](file://src/plugins/mysql-client/views/ImportExport.tsx#L5-L18)
- [mysql-connections.ts:57-61](file://src/plugins/mysql-client/store/mysql-connections.ts#L57-L61)
- [commands.rs:503-531](file://src-tauri/src/plugins/mysql/commands.rs#L503-L531)
- [commands.rs:558-562](file://src-tauri/src/plugins/mysql/commands.rs#L558-L562)
- [commands.rs:564-577](file://src-tauri/src/plugins/mysql/commands.rs#L564-L577)
- [commands.rs:579-601](file://src-tauri/src/plugins/mysql/commands.rs#L579-L601)

**Section sources**
- [ImportExport.tsx:5-18](file://src/plugins/mysql-client/views/ImportExport.tsx#L5-L18)
- [mysql-connections.ts:57-61](file://src/plugins/mysql-client/store/mysql-connections.ts#L57-L61)

### Index Management
The index manager lists existing indexes and supports creating new indexes and dropping them (excluding primary keys).

```mermaid
flowchart TD
Start(["Open Indexes Tab"]) --> Load["listIndexes()"]
Load --> Render["Render Index List"]
Render --> Create{"Create New?"}
Create --> |Yes| OpenForm["Open Create Index Modal"]
OpenForm --> Validate["Validate Columns"]
Validate --> ExecCreate["cmd_mysql_create_index()"]
ExecCreate --> Reload["listIndexes()"]
Create --> |No| Drop{"Drop Index?"}
Drop --> |Yes| ExecDrop["cmd_mysql_drop_index()"]
ExecDrop --> Reload
Drop --> |No| End(["Idle"])
```

**Diagram sources**
- [IndexManager.tsx:5-14](file://src/plugins/mysql-client/views/IndexManager.tsx#L5-L14)
- [mysql-connections.ts:144-146](file://src/plugins/mysql-client/store/mysql-connections.ts#L144-L146)
- [commands.rs:446-501](file://src-tauri/src/plugins/mysql/commands.rs#L446-L501)

**Section sources**
- [IndexManager.tsx:5-14](file://src/plugins/mysql-client/views/IndexManager.tsx#L5-L14)
- [mysql-connections.ts:144-146](file://src/plugins/mysql-client/store/mysql-connections.ts#L144-L146)

### Data Model Overview
The frontend and backend share typed models for database, table, column, index, row pages, SQL results, and import results.

```mermaid
erDiagram
MYSQL_DATABASE_INFO {
string name
}
MYSQL_TABLE_INFO {
string name
string tableType
}
MYSQL_COLUMN_INFO {
string name
string columnType
boolean nullable
string key
string defaultValue
string extra
}
MYSQL_TABLE_STATUS {
string name
string engine
uint64 rows
uint64 dataLength
uint64 indexLength
string collation
}
MYSQL_ROW_PAGE {
array columns
array rows
uint64 total
}
MYSQL_SQL_RESULT {
array columns
array rows
uint64 affectedRows
uint64 lastInsertId
string message
}
MYSQL_INDEX_INFO {
string name
array columns
boolean unique
string indexType
uint64 cardinality
}
MYSQL_QUERY_HISTORY_ITEM {
string id
string connectionId
string database
string sql
string executedAt
}
MYSQL_IMPORT_RESULT {
uint64 successCount
uint64 failedCount
array errors
}
MYSQL_SERVER_STATUS {
string version
map status
}
MYSQL_TABLE_STATUS ||--|| MYSQL_TABLE_INFO : "describes"
MYSQL_COLUMN_INFO ||--|| MYSQL_TABLE_INFO : "belongs_to"
MYSQL_ROW_PAGE ||--|| MYSQL_TABLE_INFO : "contains"
MYSQL_SQL_RESULT ||--|| MYSQL_TABLE_INFO : "produced_by"
MYSQL_INDEX_INFO ||--|| MYSQL_TABLE_INFO : "applies_to"
MYSQL_QUERY_HISTORY_ITEM ||--|| MYSQL_DATABASE_INFO : "executed_on"
```

**Diagram sources**
- [types.ts:30-39](file://src/plugins/mysql-client/types.ts#L30-L39)
- [types.rs:10-97](file://src-tauri/src/plugins/mysql/types.rs#L10-L97)

**Section sources**
- [types.ts:1-40](file://src/plugins/mysql-client/types.ts#L1-L40)
- [types.rs:1-97](file://src-tauri/src/plugins/mysql/types.rs#L1-L97)

## Dependency Analysis
- Frontend depends on the store for state and actions; the store invokes Tauri commands.
- Backend commands depend on the connection pool and filesystem for exports/imports.
- Type definitions are shared between frontend and backend to ensure consistent serialization.

```mermaid
graph LR
TDATA["TableData.tsx"] --> STORE["mysql-connections.ts"]
IMPEXP["ImportExport.tsx"] --> STORE
IDXMAN["IndexManager.tsx"] --> STORE
STORE --> CMDS["commands.rs"]
CMDS --> POOL["client_pool.rs"]
CMDS --> BTYPES["types.rs"]
TYPES["types.ts"] --> STORE
```

**Diagram sources**
- [TableData.tsx:5-21](file://src/plugins/mysql-client/views/TableData.tsx#L5-L21)
- [ImportExport.tsx:5-18](file://src/plugins/mysql-client/views/ImportExport.tsx#L5-L18)
- [IndexManager.tsx:5-14](file://src/plugins/mysql-client/views/IndexManager.tsx#L5-L14)
- [mysql-connections.ts:77-152](file://src/plugins/mysql-client/store/mysql-connections.ts#L77-L152)
- [commands.rs:176-615](file://src-tauri/src/plugins/mysql/commands.rs#L176-L615)
- [client_pool.rs:7-65](file://src-tauri/src/plugins/mysql/client_pool.rs#L7-L65)
- [types.ts:1-40](file://src/plugins/mysql-client/types.ts#L1-L40)
- [types.rs:1-97](file://src-tauri/src/plugins/mysql/types.rs#L1-L97)

**Section sources**
- [mysql-connections.ts:77-152](file://src/plugins/mysql-client/store/mysql-connections.ts#L77-L152)
- [commands.rs:176-615](file://src-tauri/src/plugins/mysql/commands.rs#L176-L615)

## Performance Considerations
- Pagination and limits: The backend enforces a maximum page size for row selection to avoid heavy queries.
- Bulk imports: The backend iterates rows and executes inserts or replaces; consider batching at the client or splitting very large files.
- Export size: Exports are written to the application data exports directory; large exports may impact disk I/O.
- Connection pooling: The backend maintains pools keyed by connection ID to reduce overhead.
- Sorting and filtering: Not implemented in the viewer; use the SQL workspace for advanced queries.

Recommendations:
- For large datasets, prefer exporting via the SQL workspace with WHERE clauses and LIMIT/OFFSET.
- Use replace-into mode for idempotent imports when duplicates may occur.
- Monitor server status to assess concurrent connections and uptime.

**Section sources**
- [commands.rs:313-322](file://src-tauri/src/plugins/mysql/commands.rs#L313-L322)
- [commands.rs:503-531](file://src-tauri/src/plugins/mysql/commands.rs#L503-L531)
- [client_pool.rs:32-48](file://src-tauri/src/plugins/mysql/client_pool.rs#L32-L48)

## Troubleshooting Guide
Common issues and resolutions:
- No primary key: Editing and deleting are disabled. Add a primary key or surrogate key to enable inline edits.
- Import failures: Review the returned error list and fix malformed rows or schema mismatches.
- Connection problems: Test the connection and ensure credentials and network settings are correct.
- Large result handling: Use the SQL workspace for filtered queries or export smaller subsets.

Operational tips:
- Use the SQL workspace to validate queries and check server status.
- Keep the query history to audit recent operations.
- Verify table metadata (engine, collation, sizes) in the database browser.

**Section sources**
- [TableData.tsx:10-11](file://src/plugins/mysql-client/views/TableData.tsx#L10-L11)
- [ImportExport.tsx:13-14](file://src/plugins/mysql-client/views/ImportExport.tsx#L13-L14)
- [mysql-connections.ts:142-143](file://src/plugins/mysql-client/store/mysql-connections.ts#L142-L143)
- [DatabaseBrowser.tsx:10](file://src/plugins/mysql-client/views/DatabaseBrowser.tsx#L10)

## Conclusion
RDMM’s MySQL plugin provides a practical toolkit for browsing, editing, and migrating table data. The table data viewer offers constrained inline editing, while import/export supports JSON and CSV with preview and flexible modes. Index management complements schema evolution. For large-scale operations, combine the SQL workspace with backend commands and monitor server health to maintain performance and data integrity.