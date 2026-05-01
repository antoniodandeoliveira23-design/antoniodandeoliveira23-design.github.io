-- ═══════════════════════════════════════════════════════════════════
-- AGORA — Migration 006: Supabase Realtime
-- Habilita publicação Realtime nas tabelas de chat
-- Aplicar APÓS 001_schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- REPLICA IDENTITY FULL é necessário para que o Realtime envie
-- o payload completo (old + new) nos eventos UPDATE e DELETE.
-- Para INSERT (único evento que usamos no chat), o padrão já funciona,
-- mas FULL garante compatibilidade futura.

ALTER TABLE mensagens  REPLICA IDENTITY FULL;
ALTER TABLE conversas  REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────────
-- Adiciona as tabelas à publicação padrão do Supabase Realtime
-- (supabase_realtime é criada automaticamente pelo Supabase)
-- ─────────────────────────────────────────────────────────────────

-- Remove primeiro para evitar erro se já existir
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS mensagens;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS conversas;

-- Adiciona
ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE conversas;

-- ─────────────────────────────────────────────────────────────────
-- NOTA: Habilitar Realtime no Dashboard também
--
-- Supabase Dashboard → Database → Replication
--   ✓ mensagens
--   ✓ conversas
--
-- Sem isso, o channel().subscribe() não recebe eventos mesmo com
-- a publicação configurada no SQL.
-- ─────────────────────────────────────────────────────────────────
