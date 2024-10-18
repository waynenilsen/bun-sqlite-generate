# SQLite Interface Generator

This script generates TypeScript interfaces and CRUD functions from a SQLite schema file.

This could be called a lightweight ORM but that really overstates the case. It is a standardized
way to generate TypeScript interfaces and functions for interacting with a bun:sqlite database.

Most of these functions would have been written manually before but this script automates the process.

## Example

```schema.sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    characters_remaining INTEGER NOT NULL DEFAULT 1000000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

```

run `bunx bun-sqlite-generate --schema-file ./schema.sql --output-dir ./src/db` which will generate the following

```typescript
import { Database } from "bun:sqlite";

export interface Users {
    id: number | bigint;
    username: string;
    email: string;
    password_hash: string;
    is_admin: number;
    characters_remaining: number | bigint;
    created_at: string | null;
    updated_at: string | null;
}

export function insertUsers(db: Database, users: Partial<Users>): Users {
    const columns = ["id","username","email","password_hash","is_admin","characters_remaining","created_at","updated_at"];
    const insertColumns = columns.filter(col => users[col as keyof typeof users] !== undefined);
    const insertValues = insertColumns.map(col => users[col as keyof typeof users]);
    const placeholders = insertColumns.map(() => '?').join(', ');
    const sql = `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const stmt = db.prepare<Users, any[]>(sql);
    const result = stmt.get(insertValues);
    return result as Users;
}

export function getAllUsers(db: Database): Users[] {
    const stmt = db.prepare<Users, []>('SELECT * FROM users');
    return stmt.all() as Users[];
}

export function getUsers(db: Database, id: number | bigint): Users | null {
    const stmt = db.prepare<Users, (number | bigint)[]>('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as Users | null;
}

export function updateUsers(db: Database, id: number | bigint, users: Partial<Users>): Users | null {
    const columns = ["id","username","email","password_hash","is_admin","characters_remaining","created_at","updated_at"];
    const updateColumns = columns.filter(col => users[col as keyof typeof users] !== undefined && !["id"].includes(col));
    if (updateColumns.length === 0) return getUsers(db, id);
    const setClause = updateColumns.map(col => `${col} = ?`).join(', ');
    const updateValues = updateColumns.map(col => users[col as keyof typeof users]);
    const sql = `UPDATE users SET ${setClause} WHERE id = ? RETURNING *`;
    const stmt = db.prepare<Users, any[]>(sql);
    const result = stmt.get([...updateValues, id]);
    return result as Users | null;
}

export function deleteUsers(db: Database, id: number | bigint): void {
    const stmt = db.prepare<Users, (number | bigint)[]>('DELETE FROM users WHERE id = ?');
    stmt.run(id);
}

```


## Why this exists

1. Type Safety: Automatically generates TypeScript interfaces matching your SQLite schema, ensuring type consistency between your database and application code.
2. Productivity: Saves time by automating the creation of basic CRUD operations for each table.
3. Consistency: Ensures a standardized approach to database interactions across your project.
4. Schema-Driven Development: Encourages maintaining an up-to-date schema file, which can serve as a single source of truth for your database structure.

## How to use

1. Install Bun: https://bun.sh/docs/installation
2. Add the script to your project `bun add bun-sqlite-generate`
3. Run the script `bunx bun-sqlite-generate --schema-file ./schema.sql --output-dir ./src/db`

## How it works

1. The script reads the SQLite schema file and extracts the table definitions.
2. It then generates TypeScript interfaces for each table.
3. It also generates CRUD functions for each table.
4. It outputs the generated interfaces and functions to the specified output directory.

## License

MIT
