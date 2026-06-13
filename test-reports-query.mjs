import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8');
const envLines = envFile.split('\n');
const env = {};
for (const line of envLines) {
  const [key, ...value] = line.split('=');
  if (key && value.length > 0) {
    env[key.trim()] = value.join('=').trim().replace(/^['"](.*)['"]$/, '$1');
  }
}

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("Signing in as admin...");
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: 'admin@cbi-overtime.com',
  password: 'Password123'
});

if (authError) {
  console.error("Auth error:", authError.message);
  process.exit(1);
}

console.log("Querying profiles...");
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .limit(1);

if (error) {
  console.error("Profiles query error:", error.message);
  process.exit(1);
}

console.log("Profiles fields:", data.length > 0 ? Object.keys(data[0]) : "No profiles found");






