#!/usr/bin/env node
// TEST TOOL ONLY — a local stand-in for api.anthropic.com so the Claude features can be tested without
// spending API credit. Speaks the real Messages API streaming (SSE) format and logs every request.
//   node tools/mock-claude-api.mjs [port]       then point the app at it (HS.settings.apiBase)
// Keys: sk-ant-test-good → works · sk-ant-test-nocredit → 400 "credit balance too low" · anything else → 401
import http from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';

const PORT = +(process.argv[2] || 8787);
const LOG = new URL('./mock-claude-api.log', import.meta.url);
writeFileSync(LOG, '');
const log = (o) => { const line = JSON.stringify(o); console.log(line); appendFileSync(LOG, line + '\n'); };

const SPEC = {
  title: 'The accounting equation', concept_type: 'relationship',
  summary: 'Every balance sheet balances because everything a company owns is financed either by what it owes or by what its owners have invested and earned.',
  parts: [
    { id: 'assets', label: 'Assets', detail: 'Resources the company controls that bring future economic benefit, such as cash, receivables and equipment.', shape: 'sphere', size: 'large', group: 'a' },
    { id: 'liab', label: 'Liabilities', detail: 'Present obligations to transfer resources to others, such as payables and loans.', shape: 'cube', size: 'medium', group: 'a' },
    { id: 'equity', label: "Stockholders' equity", detail: 'The owners\' residual interest in the assets after deducting liabilities.', shape: 'cylinder', size: 'medium', group: 'a' },
    { id: 'rev', label: 'Revenues', detail: 'Inflows from delivering goods or services; they increase equity through retained earnings.', shape: 'cone', size: 'small', group: 'a' },
    { id: 'exp', label: 'Expenses', detail: 'Outflows or using up of assets to earn revenue; they decrease equity.', shape: 'octahedron', size: 'small', group: 'a' },
  ],
  links: [
    { from: 'liab', to: 'assets', label: 'finances' }, { from: 'equity', to: 'assets', label: 'finances' },
    { from: 'rev', to: 'equity', label: 'increases' }, { from: 'exp', to: 'equity', label: 'decreases' },
  ],
  steps: [
    { part: 'assets', narration: 'Start with assets, everything the company owns or controls that will bring future benefit.' },
    { part: 'liab', narration: 'Some of those assets are financed by creditors. That claim is recorded as liabilities.' },
    { part: 'equity', narration: 'The rest is financed by the owners. Assets minus liabilities leaves stockholders equity.' },
    { part: 'rev', narration: 'Earning revenue raises equity through retained earnings.' },
    { part: 'exp', narration: 'Expenses do the opposite and reduce equity. Either way, assets always equal liabilities plus equity.' },
  ],
  check: [
    { question: 'Which equation must a balance sheet always satisfy?', options: ['Assets = Liabilities − Equity', 'Assets = Liabilities + Equity', 'Equity = Assets + Liabilities', 'Liabilities = Assets + Equity'], answer_index: 1, explanation: 'Every asset is financed either by creditors or by owners.' },
    { question: 'How does recording an expense affect the equation?', options: ['Increases assets', 'Increases equity', 'Decreases equity', 'Increases liabilities only'], answer_index: 2, explanation: 'Expenses reduce retained earnings, which is part of equity.' },
  ],
};

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const err = (res, status, type, message) => { res.writeHead(status, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type, message } })); };
const keyOf = (req) => req.headers['x-api-key'] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const key = keyOf(req);
  if (req.method === 'GET' && req.url.startsWith('/v1/models/')) {
    const id = decodeURIComponent(req.url.split('/').pop());
    log({ at: 'models.retrieve', id, key: key.slice(0, 12) + '…' });
    if (!/^sk-ant-test-(good|nocredit)$/.test(key)) return err(res, 401, 'authentication_error', 'invalid x-api-key');
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'model', id, display_name: { 'claude-opus-5': 'Claude Opus 5', 'claude-sonnet-5': 'Claude Sonnet 5', 'claude-haiku-4-5': 'Claude Haiku 4.5' }[id] || id, created_at: '2026-01-01T00:00:00Z' }));
  }
  if (req.method === 'POST' && req.url.startsWith('/v1/messages')) {
    let body = ''; for await (const c of req) body += c;
    const b = JSON.parse(body || '{}');
    const content = Array.isArray(b.messages?.[0]?.content) ? b.messages[0].content : [];
    log({
      at: 'messages', model: b.model, stream: b.stream, max_tokens: b.max_tokens, beta: req.headers['anthropic-beta'] || null, fallbacks: b.fallbacks ?? null,
      thinking: b.thinking || null, effort: b.output_config?.effort || null, format: b.output_config?.format?.type || null,
      schema_required: b.output_config?.format?.schema?.required || null, system_chars: typeof b.system === 'string' ? b.system.length : 0,
      images: content.filter((x) => x.type === 'image').map((x) => `${x.source.media_type} ${Math.round(x.source.data.length * 0.75 / 1024)} KB`),
      text_chars: content.filter((x) => x.type === 'text').reduce((a, x) => a + x.text.length, 0), text_head: content.filter((x) => x.type === 'text').map((x) => x.text.slice(0, 160))[0] || null,
      key: key.slice(0, 12) + '…', browser_header: req.headers['anthropic-dangerous-direct-browser-access'] || null, sdk: req.headers['x-stainless-package-version'] || null,
    });
    if (!/^sk-ant-test-(good|nocredit)$/.test(key)) return err(res, 401, 'authentication_error', 'invalid x-api-key');
    if (key === 'sk-ant-test-nocredit') return err(res, 400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.');
    res.writeHead(200, { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    send('message_start', { message: { id: 'msg_mock', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 14200, output_tokens: 1 } } });
    // adaptive thinking with display "omitted": an empty thinking block carrying only a signature
    send('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
    await sleep(900);
    send('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'mock-signature' } });
    send('content_block_stop', { index: 0 });
    const out = b.output_config?.format ? JSON.stringify(SPEC) : 'Mock answer: assets = liabilities + equity (p. 3).';
    send('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < out.length; i += 120) { send('content_block_delta', { index: 1, delta: { type: 'text_delta', text: out.slice(i, i + 120) } }); await sleep(40); }
    send('content_block_stop', { index: 1 });
    send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3900 } });
    send('message_stop', {});
    return res.end();
  }
  err(res, 404, 'not_found_error', 'Not found');
}).listen(PORT, () => console.log(`mock Claude API on http://127.0.0.1:${PORT}  (log: ${LOG.pathname})`));
