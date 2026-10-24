// Local-only browser QA harness. Never imported by the application or deployed.
// Runs the real customer/admin components against an isolated in-memory ledger.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(root,'package.json'));
const viteRequire=createRequire(createRequire(require.resolve('vitest/package.json')).resolve('vite/package.json'));
const {build}=viteRequire('esbuild');
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const buyer='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222';
await db.exec('create schema auth; create table auth.users(id uuid primary key); create table profiles(id uuid primary key,role text); create role anon; create role authenticated; create role service_role;');
const migration=n=>readFileSync(path.join(root,'../../supabase/migrations',n),'utf8');
const wallet=migration('20261024021000_credit_wallet.sql');
await db.exec(wallet.slice(0,wallet.indexOf('alter table public.quotes')));
await db.exec(wallet.slice(wallet.indexOf('create function public.cost_wallet_read'),wallet.indexOf('create function public.cost_wallet_cas')));
await db.exec(migration('20261024041000_manual_upi.sql'));
await db.exec(migration('20261024042000_manual_payment_build_context.sql'));
await db.query('insert into auth.users values($1),($2)',[buyer,staff]);
await db.query("insert into profiles values($1,'user'),($2,'admin')",[buyer,staff]);
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import BuildRun from './components/prompt-studio/build-run';import {ManualCredits} from './app/credits/manual';import {ReviewPayment} from './app/admin/payments/review';
async function main(){let view;if(location.pathname==='/admin/payments'){const data=await (await fetch('/fixture/admin')).json();view=<div style={{padding:40}}><h1>Verify UPI payments</h1>{data.map(p=><section key={p.id}><h2>₹{p.credits} for {p.credits} credits</h2><p>Test customer: {p.account_id}</p><ReviewPayment id={p.id}/></section>)}</div>;}else view=location.pathname==='/credits'?<ManualCredits/>:<BuildRun/>;createRoot(document.getElementById('root')).render(view);}main();`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outdir:'/tmp/buildwise-qr-ui',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture-next',setup(b){b.onResolve({filter:/^next\/(navigation|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/link'?`import React from 'react';export default function Link(p){return React.createElement('a',p);}`:`export function useSearchParams(){return new URLSearchParams(location.search)};export function useRouter(){return {push:u=>location.assign(u),refresh:()=>location.reload()}}`,loader:'js',resolveDir:root}));b.onResolve({filter:/^@\//},a=>({path:path.join(root,a.path.slice(2)+'.ts')}));}}]});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=result.outputFiles.find(f=>f.path.endsWith('.css')).contents;
const balance=async()=>{const s=(await db.query('select cost_wallet_read($1) as state',[buyer])).rows[0].state;return {availableCredits:s.paidUnits/10000}};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let raw='';for await(const c of req)raw+=c;const input=raw?JSON.parse(raw):{};const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(js)}
if(url.pathname==='/app.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
if(url.pathname==='/payments/owner-upi-qr.png'){res.setHeader('Content-Type','image/png');return res.end(readFileSync(path.join(root,'public/payments/owner-upi-qr.png')))}
if(url.pathname==='/api/prompt-studio/prepare')return json({sessionId:buyer,revision:2,specId:buyer,...await balance(),quote:{costCredits:150,modelBudgetUsd:1,selection:{selectedIds:['page:0']},weightsVersion:'source-v1',featureCosts:[{id:'page:0',label:'Test product page'}]}});
if(url.pathname==='/api/cost/wallet')return json(await balance());
if(url.pathname==='/api/credits/manual') {if(req.method==='POST'){await db.query('insert into manual_credit_payments(id,account_id,credits,build_session,build_revision) values($1,$2,$3,$4,$5)',[input.id,buyer,input.credits,input.buildContext?.session??null,input.buildContext?.revision??null]);return json({id:input.id,status:'pending'})}return json({purchases:(await db.query('select * from manual_credit_payments order by created_at desc')).rows,wallet:await balance()});}
if(url.pathname==='/fixture/admin')return json((await db.query("select * from manual_credit_payments where status='pending'")).rows);
if(url.pathname.startsWith('/api/credits/manual/')) {if(input.approve&&!input.receiptVerified)return json({error:'Receipt must be verified'},400);const result=await db.query('select review_manual_credit_payment($1,$2,$3,$4) as status',[url.pathname.split('/').at(-1),staff,input.approve,input.reference??null]);return json(result.rows[0]);}
if(url.pathname.startsWith('/api/'))return json({error:'Build execution is not enabled in this local QA fixture'},409);
res.setHeader('Content-Type','text/html');res.end('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{font-family:system-ui;margin:0;background:#f7f8f4}main{max-width:800px;margin:40px auto;padding:24px}p{line-height:1.5}button,a{cursor:pointer}button{padding:10px}button:disabled{opacity:.45;cursor:not-allowed}.studio-button{display:inline-block;padding:12px;background:#294d36;color:white;border-radius:8px;margin:12px 0}label{display:block;margin:18px 0}#qa{padding:10px;background:#fff3b5;text-align:center}</style></head><body><div id="qa">LOCAL QA ONLY · simulated identities · no real payment</div><div id="root"></div><script src="/app.js"></script></body></html>');
}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}}).listen(3126,'127.0.0.1',()=>console.log(`Local QR journey QA: http://127.0.0.1:3126/apps/build?session=${buyer}&revision=2`));
