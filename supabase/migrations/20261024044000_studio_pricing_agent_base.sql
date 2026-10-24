-- Claude now writes the product code, so every Studio build carries a fixed agent base:
-- its harness, reading the template, and typecheck rounds. source-v1 stays immutable for old quotes.
insert into public.cost_pricing_versions(version,config)
select 'source-v2',
  jsonb_set(jsonb_set(config,'{version}','"source-v2"'::jsonb),'{agentBaseTokens}','100000'::jsonb)
from public.cost_pricing_versions where version='source-v1'
on conflict (version) do nothing;
