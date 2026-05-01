-- ═══════════════════════════════════════════════════════════════════
-- AGORA — Migration 005: Dados Iniciais (Seed)
-- Aplicar APÓS 001_schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- PLANOS DE MONETIZAÇÃO (R3)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO planos (id, nome, tipo, preco, max_eventos, destaque_incluso, descricao, ativo)
VALUES
  (
    'avulso',
    'Avulso',
    'avulso',
    9.90,
    1,
    false,
    '1 evento pontual, sem destaque. Ideal para quem quer divulgar um evento específico.',
    true
  ),
  (
    'mensal_basico',
    'Mensal Básico',
    'mensal',
    29.90,
    5,
    false,
    'Até 5 eventos por mês. Perfeito para pequenos negócios.',
    true
  ),
  (
    'mensal_pro',
    'Mensal Pro',
    'mensal',
    79.90,
    20,
    true,
    'Até 20 eventos + destaque no mapa e na listagem. Para empresas em crescimento.',
    true
  ),
  (
    'trimestral',
    'Trimestral',
    'trimestral',
    199.90,
    60,
    true,
    'Até 60 eventos em 3 meses + destaque permanente. Economia de 16% vs mensal.',
    true
  ),
  (
    'anual',
    'Anual',
    'anual',
    599.90,
    999,
    true,
    'Eventos ilimitados + destaque o ano todo. Para quem leva o negócio a sério.',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  nome             = EXCLUDED.nome,
  preco            = EXCLUDED.preco,
  max_eventos      = EXCLUDED.max_eventos,
  destaque_incluso = EXCLUDED.destaque_incluso,
  descricao        = EXCLUDED.descricao,
  ativo            = EXCLUDED.ativo;

-- ─────────────────────────────────────────────────────────────────
-- NOTA: Usuário admin inicial
-- Crie manualmente via Supabase Dashboard → Authentication → Users
-- Email: admin@agora.app  |  Senha: [definir no deploy]
-- Após criado, execute no SQL Editor:
--
--   UPDATE profiles SET tipo_conta = 'admin' WHERE id = '<UUID_DO_ADMIN>';
--
-- ─────────────────────────────────────────────────────────────────
