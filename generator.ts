#!/usr/bin/env bun

/**
 * SQLite Interface Generator
 * 
 * This script generates TypeScript interfaces and CRUD functions from a SQLite schema file.
 * It's designed to automate the process of creating type-safe database interactions in TypeScript projects.
 * 
 * Why this exists:
 * 1. Type Safety: Automatically generates TypeScript interfaces matching your SQLite schema,
 *    ensuring type consistency between your database and application code.
 * 2. Productivity: Saves time by automating the creation of basic CRUD operations for each table.
 * 3. Consistency: Ensures a standardized approach to database interactions across your project.
 * 4. Schema-Driven Development: Encourages maintaining an up-to-date schema file, which can
 *    serve as a single source of truth for your database structure.
 * 
 * Benefits of using this generator:
 * 1. Reduced Boilerplate: Eliminates the need to manually write interfaces and basic CRUD functions.
 * 2. Error Prevention: Type-safe interfaces help catch potential type-related errors at compile-time.
 * 3. Easy Updates: When your schema changes, simply re-run the generator to update all interfaces and functions.
 * 4. Improved Developer Experience: Auto-completion and type inference in your IDE for database operations.
 * 
 * When to consider using this:
 * - For projects using SQLite with TypeScript, especially those with frequently changing schemas.
 * - When starting a new project and want to quickly set up a type-safe database layer.
 * - In scenarios where maintaining manual ORM configurations is cumbersome.
 * 
 * Considerations and potential drawbacks:
 * 1. Generated Code: The output is generated code, which may not always fit all specific use cases.
 * 2. Maintenance: Requires re-running the generator when the schema changes, which could be forgotten.
 * 3. Complexity: For very simple projects, this might introduce unnecessary complexity.
 * 4. Customization: While the generated code covers basic CRUD, complex queries still need to be written manually.
 * 5. Performance: The generated functions use dynamic SQL, which might not be optimal for all scenarios.
 * 
 * Always review the generated code and adjust as necessary for your specific project needs.
 * This tool is meant to be a starting point and can be customized further to fit more specific requirements.
 */


import { Database } from "bun:sqlite";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
}

interface TableInfo {
    name: string;
}

class InterfaceGenerator {
    private db: Database;

    constructor(schemaPath: string) {
        this.db = new Database(":memory:");
        const schema = readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
    }

    generateInterfaces(): Map<string, string> {
        const tables = this.db.query<TableInfo, []>("SELECT name FROM sqlite_master WHERE type='table'").all();
        const interfaces = new Map<string, string>();

        for (const table of tables) {
            const columns = this.db.query<ColumnInfo, []>(`PRAGMA table_info(${table.name})`).all();
            const primaryKeys = columns.filter(col => col.pk > 0).sort((a, b) => a.pk - b.pk);
            
            let interfaceContent = `import { Database } from "bun:sqlite";\n\n`;
            interfaceContent += `export interface ${this.pascalCase(table.name)} {\n`;
            for (const column of columns) {
                interfaceContent += `    ${column.name}: ${this.mapSqliteTypeToTypescript(column.type)}${column.notnull || !!column.pk ? '' : ' | null'};\n`;
            }
            interfaceContent += `}\n\n`;

            // Generate improved insert function with dynamic SQL generation
            interfaceContent += `export function insert${this.pascalCase(table.name)}(db: Database, ${table.name}: Partial<${this.pascalCase(table.name)}>): ${this.pascalCase(table.name)} {\n`;
            interfaceContent += `    const columns = ${JSON.stringify(columns.map(col => col.name))};\n`;
            interfaceContent += `    const insertColumns = columns.filter(col => ${table.name}[col as keyof typeof ${table.name}] !== undefined);\n`;
            interfaceContent += `    const insertValues = insertColumns.map(col => ${table.name}[col as keyof typeof ${table.name}]);\n`;
            interfaceContent += `    const placeholders = insertColumns.map(() => '?').join(', ');\n`;
            interfaceContent += `    const sql = \`INSERT INTO ${table.name} (\${insertColumns.join(', ')}) VALUES (\${placeholders}) RETURNING *\`;\n`;
            interfaceContent += `    const stmt = db.prepare<${this.pascalCase(table.name)}, any[]>(sql);\n`;
            interfaceContent += `    const result = stmt.get(insertValues);\n`;
            interfaceContent += `    return result as ${this.pascalCase(table.name)};\n`;
            interfaceContent += `}\n\n`;

            // Generate getAll function
            interfaceContent += `export function getAll${this.pascalCase(table.name)}(db: Database): ${this.pascalCase(table.name)}[] {\n`;
            interfaceContent += `    const stmt = db.prepare<${this.pascalCase(table.name)}, []>('SELECT * FROM ${table.name}');\n`;
            interfaceContent += `    return stmt.all() as ${this.pascalCase(table.name)}[];\n`;
            interfaceContent += `}\n\n`;

            // Only generate get, update, and delete functions if primary keys exist
            if (primaryKeys.length > 0) {
                const pkParams = primaryKeys.map(pk => `${pk.name}: ${this.mapSqliteTypeToTypescript(pk.type)}`).join(', ');
                const pkWhere = primaryKeys.map(pk => `${pk.name} = ?`).join(' AND ');

                // Generate get function
                interfaceContent += `export function get${this.pascalCase(table.name)}(db: Database, ${pkParams}): ${this.pascalCase(table.name)} | null {\n`;
                interfaceContent += `    const stmt = db.prepare<${this.pascalCase(table.name)}, (${this.mapSqliteTypeToTypescript(primaryKeys[0].type)})[]>('SELECT * FROM ${table.name} WHERE ${pkWhere}');\n`;
                interfaceContent += `    return stmt.get(${primaryKeys.map(pk => pk.name).join(', ')}) as ${this.pascalCase(table.name)} | null;\n`;
                interfaceContent += `}\n\n`;

                // Generate update function
                interfaceContent += `export function update${this.pascalCase(table.name)}(db: Database, ${pkParams}, ${table.name}: Partial<${this.pascalCase(table.name)}>): ${this.pascalCase(table.name)} | null {\n`;
                interfaceContent += `    const columns = ${JSON.stringify(columns.map(col => col.name))};\n`;
                interfaceContent += `    const updateColumns = columns.filter(col => ${table.name}[col as keyof typeof ${table.name}] !== undefined && !${JSON.stringify(primaryKeys.map(pk => pk.name))}.includes(col));\n`;
                interfaceContent += `    if (updateColumns.length === 0) return get${this.pascalCase(table.name)}(db, ${primaryKeys.map(pk => pk.name).join(', ')});\n`;
                interfaceContent += `    const setClause = updateColumns.map(col => \`\${col} = ?\`).join(', ');\n`;
                interfaceContent += `    const updateValues = updateColumns.map(col => ${table.name}[col as keyof typeof ${table.name}]);\n`;
                interfaceContent += `    const sql = \`UPDATE ${table.name} SET \${setClause} WHERE ${pkWhere} RETURNING *\`;\n`;
                interfaceContent += `    const stmt = db.prepare<${this.pascalCase(table.name)}, any[]>(sql);\n`;
                interfaceContent += `    const result = stmt.get([...updateValues, ${primaryKeys.map(pk => pk.name).join(', ')}]);\n`;
                interfaceContent += `    return result as ${this.pascalCase(table.name)} | null;\n`;
                interfaceContent += `}\n\n`;

                // Generate delete function
                interfaceContent += `export function delete${this.pascalCase(table.name)}(db: Database, ${pkParams}): void {\n`;
                interfaceContent += `    const stmt = db.prepare<${this.pascalCase(table.name)}, (${this.mapSqliteTypeToTypescript(primaryKeys[0].type)})[]>('DELETE FROM ${table.name} WHERE ${pkWhere}');\n`;
                interfaceContent += `    stmt.run(${primaryKeys.map(pk => pk.name).join(', ')});\n`;
                interfaceContent += `}\n`;
            }

            interfaces.set(table.name, interfaceContent);
        }

        return interfaces;
    }

    private pascalCase(str: string): string {
        return str.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    private mapSqliteTypeToTypescript(sqliteType: string): string {
        const typeMap: { [key: string]: string } = {
            'INTEGER': 'number | bigint',
            'REAL': 'number',
            'TEXT': 'string',
            'BLOB': 'Uint8Array',
            'BOOLEAN': 'number',
            'TIMESTAMP': 'string'
        };

        const baseType = sqliteType.split('(')[0].toUpperCase();
        return typeMap[baseType] || 'any';
    }
}

function generateFiles(outputDir: string, interfaces: Map<string, string>): void {
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    for (const [tableName, interfaceContent] of interfaces) {
        const fileName = `${tableName}.ts`;
        const filePath = join(outputDir, fileName);
        writeFileSync(filePath, interfaceContent);
        console.log(`Generated ${fileName}`);
    }

    // Generate index.ts file
    const indexContent = Array.from(interfaces.keys())
        .map(tableName => `export * from './${tableName}';`)
        .join('\n');
    writeFileSync(join(outputDir, 'index.ts'), indexContent);
    console.log('Generated index.ts');
}

function showHelp() {
    console.log(`
SQLite Interface Generator

Usage: bunx bun-sqlite-generate [options]

Options:
  --schema-file <path>   Path to the SQLite schema file (required)
  --output-dir <path>    Directory to output generated files (required)
  --help                 Show this help message

Example:
  bunx bun-sqlite-generate --schema-file ./schema.sql --output-dir ./src/db

Description:
  This script generates TypeScript interfaces and CRUD functions from a SQLite schema file.
  It automates the process of creating type-safe database interactions in TypeScript projects.
    `);
}

function parseArgs(args: string[]): { [key: string]: string } {
    const parsedArgs: { [key: string]: string } = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--help') {
            parsedArgs['help'] = 'true';
            break;
        }
        if (args[i].startsWith('--') && i + 1 < args.length) {
            parsedArgs[args[i].slice(2)] = args[i + 1];
            i++;
        }
    }
    return parsedArgs;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    
    if (args['help']) {
        showHelp();
        process.exit(0);
    }

    if (!args['schema-file'] || !args['output-dir']) {
        console.error("Error: Missing required arguments.");
        showHelp();
        process.exit(1);
    }

    const schemaPath = args['schema-file'];
    const outputDir = args['output-dir'];

    try {
        console.log(`Generating interfaces from schema: ${schemaPath}`);
        console.log(`Output directory: ${outputDir}`);

        const generator = new InterfaceGenerator(schemaPath);
        const interfaces = generator.generateInterfaces();
        generateFiles(outputDir, interfaces);

        console.log("Interface generation completed successfully.");
    } catch (error) {
        console.error("Error during interface generation:", error);
        process.exit(1);
    }
}

main();
