import * as fs from 'fs';
import * as path from 'path';

const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../../config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

export default config;
