const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Get all companies
  const { data: companies } = await supabase.from('companies').select('*');
  console.log('Companies:', companies);

  // Get all profiles without a company
  const { data: orphans } = await supabase.from('profiles').select('*').is('company_id', null);
  console.log('Orphans:', orphans);

  if (companies.length > 0 && orphans.length > 0) {
    const defaultCompany = companies[0].id;
    console.log('Assigning orphans to company:', defaultCompany);
    const { error } = await supabase.from('profiles').update({ company_id: defaultCompany }).is('company_id', null);
    if (error) console.error(error);
    else console.log('Done!');
  }
}

run();
