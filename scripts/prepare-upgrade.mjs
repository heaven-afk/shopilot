import {readFile,writeFile} from 'node:fs/promises';
const names=['003_team_and_business_settings.sql','004_platform_admin.sql','005_authorised_sync_and_receipts.sql'];
const parts=await Promise.all(names.map(async name=>`-- ${name}\n${await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')}`));
await writeFile(new URL('../supabase/upgrade-team-admin.sql',import.meta.url),'-- Shopilot upgrade. Apply ONCE after migrations 001 and 002.\n-- This transaction does not grant any platform administrator automatically.\nbegin;\n'+parts.join('\n\n')+'\ncommit;\n');
console.log('Prepared supabase/upgrade-team-admin.sql');
