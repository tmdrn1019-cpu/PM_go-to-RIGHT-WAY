import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, appendFileSync } from 'node:fs';
import { evaluateServiceFeed } from './service-feed.mjs';
import { LOS_REFERENCE } from './engine.mjs';

const digest = (value) => createHash('sha256').update(value).digest();
class InputError extends Error {}
class LogError extends Error {}

// ADMIN_TOKENS="이름:토큰,이름:토큰"; the legacy single ADMIN_TOKEN is the account "admin". Any malformed entry disables the API.
export function parseAccounts(tokens, token) {
  const entries = [...(tokens ? String(tokens).split(',').map((entry) => entry.trim()).filter(Boolean) : []), ...(token ? [`admin:${token}`] : [])];
  const accounts = entries.map((entry) => { const at = entry.indexOf(':'); return { name: entry.slice(0, at), token: entry.slice(at + 1) }; });
  const names = new Set(accounts.map((a) => a.name));
  const valid = accounts.length > 0 && names.size === accounts.length && accounts.every((a) => /^[\w가-힣.-]{1,40}$/.test(a.name) && a.token.length >= 32 && !a.token.includes(','));
  return valid ? accounts.map((a) => ({ name: a.name, digest: digest(a.token) })) : [];
}

// Operator-only writes to SERVICE_DATA_FILE. All handlers are synchronous, so read-modify-write cannot interleave within one process.
export function createAdminRouter({ feedPath, tokens, token, now }) {
  const router = express.Router();
  const accounts = parseAccounts(tokens, token);
  const enabled = accounts.length > 0 && typeof feedPath === 'string' && feedPath.length > 0;
  const logPath = `${feedPath}.log`;
  router.use((req, res, next) => {
    if (!enabled) return res.status(503).json({ error: '운영 등록이 설정되지 않았습니다. 서버에 ADMIN_TOKENS(이름:32자 이상 토큰)와 SERVICE_DATA_FILE을 설정하세요.' });
    const given = digest(/^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '');
    // Compare against every account so timing does not reveal which name matched.
    const match = accounts.reduce((found, account) => (timingSafeEqual(given, account.digest) ? account : found), null);
    if (!match) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
    req.admin = match.name; next();
  });
  router.use(express.json({ limit: '256kb' }));

  const read = () => {
    let text;
    try { text = readFileSync(feedPath, 'utf8'); } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, sourceName: '운영자 현장 등록', publishedAt: now(), profile: null, zones: [] };
      throw error;
    }
    try { return JSON.parse(text.replace(/^﻿/, '')); } catch { throw new InputError('기존 운영 파일을 읽을 수 없습니다. 파일을 확인하기 전에는 덮어쓰지 않습니다.'); }
  };
  const write = (req, entry, mutate) => {
    const feed = read(); mutate(feed); feed.publishedAt = now();
    try { evaluateServiceFeed(feed, now()); } catch (error) { throw new InputError(error.message); }
    const body = JSON.stringify(feed, null, 2);
    if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new InputError('운영 파일이 2MiB를 넘습니다.');
    const temporary = `${feedPath}.${process.pid}.tmp`;
    try { writeFileSync(temporary, body); renameSync(temporary, feedPath); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    try { appendFileSync(logPath, `${JSON.stringify({ at: feed.publishedAt, admin: req.admin, ...entry })}\n`); } catch { throw new LogError(); }
    return feed;
  };
  const handle = (action) => (req, res) => {
    try { res.json({ ...action(req), admin: req.admin }); } catch (error) {
      if (error instanceof InputError) return res.status(400).json({ error: error.message });
      if (error instanceof LogError) return res.status(500).json({ error: '변경은 저장됐지만 변경 기록을 남기지 못했습니다. 기록 파일을 확인하세요.' });
      res.status(500).json({ error: '운영 파일을 저장하지 못했습니다.' });
    }
  };

  router.get('/feed', handle(() => read()));
  router.get('/log', handle(() => {
    let text = '';
    try { text = readFileSync(logPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // shortcut: reads the whole log; rotate or index it if it grows past a few MB.
    return { entries: text.trim().split('\n').filter(Boolean).slice(-100).reverse().map((line) => { try { return JSON.parse(line); } catch { return { action: 'unreadable' }; } }) };
  }));
  router.put('/zones/:id', handle((req) => {
    const zone = req.body;
    if (!zone || typeof zone !== 'object' || zone.id !== req.params.id) throw new InputError('주소의 존 ID와 본문 ID가 같아야 합니다.');
    return write(req, { action: 'save-zone', zoneId: zone.id, zoneName: zone.name }, (feed) => { if (!Array.isArray(feed.zones)) throw new InputError('운영 파일 형식을 확인하세요.'); feed.zones = [...feed.zones.filter((z) => z?.id !== zone.id), zone]; });
  }));
  router.delete('/zones/:id', handle((req) => write(req, { action: 'delete-zone', zoneId: req.params.id }, (feed) => {
    const before = feed.zones?.length;
    feed.zones = (feed.zones ?? []).filter((z) => z?.id !== req.params.id);
    if (feed.zones.length === before) throw new InputError('등록되지 않은 존입니다.');
  })));
  router.put('/profile', handle((req) => {
    if (typeof req.body?.approvedForService !== 'boolean') throw new InputError('승인 여부를 선택하세요.');
    return write(req, { action: req.body.approvedForService ? 'approve-profile' : 'revoke-profile' }, (feed) => { feed.profile = { ...LOS_REFERENCE, approvedForService: req.body.approvedForService }; });
  }));
  return router;
}
