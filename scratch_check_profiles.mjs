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

async function main() {
  await supabase.auth.signInWithPassword({
    email: 'rep@cbi-africa.com',
    password: 'Password123'
  });
  
  const { data: role, error: roleErr } = await supabase.rpc('get_my_role');
  console.log('Role:', role, roleErr);
  
  const { data: dept, error: deptErr } = await supabase.rpc('get_my_department');
  console.log('Dept:', dept, deptErr);
}

main();
