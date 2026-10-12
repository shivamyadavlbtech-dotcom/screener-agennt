import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
export function loadEnvironment(cwd = process.cwd()) {
    const envFiles = [path.join(cwd, '.env.local'), path.join(cwd, '.env')];
    for (const file of envFiles) {
        if (fs.existsSync(file)) {
            dotenv.config({ path: file, override: false });
        }
    }
}
