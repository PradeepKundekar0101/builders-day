import { describe, expect, it, vi } from 'vitest';
import { MockPromptStudioAdapter } from '@buildwise/shared';
import { interpretWithModel, prepareInterpretation } from './model';
const input = { idea: 'Build a booking portal where clients can reserve fitness sessions and coaches can manage their schedules.', links: [] };
const config = { apiKey: 'test-not-a-real-key', model: 'configured-model' };
async function fixture() { const draft = await new MockPromptStudioAdapter().interpret(input); return { spec: draft.spec, questions: [], acceptanceCriteria: ['A client can reserve an available session.'], assumptions: ['Payments are deferred.'], changeSummary: 'Defined the booking flow.' }; }
function provider(value: unknown) { return vi.fn(async () => new Response(JSON.stringify({ id: 'resp_test', status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 200 } }))) as unknown as typeof fetch; }
describe('live intake adapter', () => {
 it('validates output, records usage, and never lets the model choose revision or provenance', async () => {
  const f = provider(await fixture()); const r = await interpretWithModel({ input },config,undefined,f);
  expect(r.draft.adapterMode).toBe('openai'); expect(r.draft.revision).toBe(1); expect(r.trace.usage.output_tokens).toBe(200);
  const request = JSON.parse((vi.mocked(f).mock.calls[0][1]?.body as string)); expect(request.store).toBe(false); expect(request.max_output_tokens).toBe(5000);
 });
 it('rejects cloud calls for local-only mode before fetching', async () => {
  const draft = await new MockPromptStudioAdapter().interpret(input); draft.onboarding = { persona:'non-tech',mode:'plain',budgetCap:200,approvalThreshold:50,plan:'free',privateMode:true,byok:false };
  const f=provider(await fixture()); await expect(interpretWithModel({input,draft},config,undefined,f)).rejects.toThrow('Local-only'); expect(f).not.toHaveBeenCalled();
 });
 it('masks input and removes URL credentials and query strings before dispatch', () => {
  const p=prepareInterpretation({input:{...input,idea:input.idea+' api_key=supersecretvalue email me at person@example.com',links:['https://user:password@example.com/?secret=x']}});
  expect(p.context).not.toContain('supersecretvalue'); expect(p.context).not.toContain('person@example.com'); expect(p.input.links).toEqual(['https://example.com/']);
 });
 it('preserves answered decisions and bounds follow-ups', async () => {
  const draft=await new MockPromptStudioAdapter().interpret(input); draft.questions[0].answer='Clients and coaches';
  const output=await fixture(); const r=await interpretWithModel({input,draft,message:'Clients and coaches'},config,undefined,provider(output));
  expect(r.draft.questions[0].answer).toBe('Clients and coaches'); expect(r.draft.questions).toHaveLength(3); expect(r.draft.revision).toBe(2);
 });
 it('does not replace the brief with malformed model output', async () => { await expect(interpretWithModel({input},config,undefined,provider({spec:{}}))).rejects.toThrow('invalid brief'); });
 it('surfaces provider errors without exposing provider body or credentials', async () => {
  const f=vi.fn(async()=>new Response('sensitive provider error',{status:429})) as unknown as typeof fetch;
  await expect(interpretWithModel({input},config,undefined,f)).rejects.toThrow('Your brief is preserved');
 });
});
