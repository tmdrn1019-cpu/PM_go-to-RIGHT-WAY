import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { evaluateServiceFeed } from './service-feed.mjs';
import { LOS_REFERENCE } from './engine.mjs';

const digest = (value) => createHash('sha256').update(value).digest();
class InputError extends Error {}

// Operator-only writes to SERVICE_DATA_FILE. All handlers are synchronous, so read-modify-write cannot interleave within one process.
export function createAdminRouter({ feedPath, token, now }) {
  const router = express.Router();
  const enabled = typeof token === 'string' && token.length >= 32 && typeof feedPath === 'string' && feedPath.length > 0;
  router.use((req, res, next) => {
    if (!enabled) return res.status(503).json({ error: '운영 등록이 설정되지 않았습니다. 서버에 ADMIN_TOKEN(32자 이상)과 SERVICE_DATA_FILE을 설정하세요.' });
    const given = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';
    if (!timingSafeEqual(digest(given), digest(token))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
    next();
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
  const write = (mutate) => {
    const feed = read(); mutate(feed); feed.publishedAt = now();
    try { evaluateServiceFeed(feed, now()); } catch (error) { throw new InputError(error.message); }
    const body = JSON.stringify(feed, null, 2);
    if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new InputError('운영 파일이 2MiB를 넘습니다.');
    const temporary = `${feedPath}.${process.pid}.tmp`;
    try { writeFileSync(temporary, body); renameSync(temporary, feedPath); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    return feed;
  };
  const handle = (action) => (req, res) => {
    try { res.json(action(req)); } catch (error) {
      if (error instanceof InputError) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: '운영 파일을 저장하지 못했습니다.' });
    }
  };

  router.get('/feed', handle(() => read()));
  router.put('/zones/:id', handle((req) => {
    const zone = req.body;
    if (!zone || typeof zone !== 'object' || zone.id !== req.params.id) throw new InputError('주소의 존 ID와 본문 ID가 같아야 합니다.');
    return write((feed) => { if (!Array.isArray(feed.zones)) throw new InputError('운영 파일 형식을 확인하세요.'); feed.zones = [...feed.zones.filter((z) => z?.id !== zone.id), zone]; });
  }));
  router.delete('/zones/:id', handle((req) => write((feed) => {
    const before = feed.zones?.length;
    feed.zones = (feed.zones ?? []).filter((z) => z?.id !== req.params.id);
    if (feed.zones.length === before) throw new InputError('등록되지 않은 존입니다.');
  })));
  router.put('/profile', handle((req) => {
    if (typeof req.body?.approvedForService !== 'boolean') throw new InputError('승인 여부를 선택하세요.');
    return write((feed) => { feed.profile = { ...LOS_REFERENCE, approvedForService: req.body.approvedForService }; });
  }));
  return router;
}
