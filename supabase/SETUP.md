# AGORA — Configuração do Supabase

Guia completo para configurar o Supabase em produção.

---

## 1. Criar projeto

1. Acesse [app.supabase.com](https://app.supabase.com)
2. **New project** → Nome: `agora-vilhena` | Região: `South America (São Paulo)`
3. Copie o **Project URL** e a **anon key** → cole no `.env`

---

## 2. Aplicar migrações (ordem obrigatória)

No **SQL Editor** do Supabase Dashboard, execute na ordem:

```
001_schema.sql                  ← Tabelas + tipos + triggers básicos
002_rls_policies.sql            ← Row Level Security
003_storage_buckets.sql         ← Buckets avatares/eventos/produtos
004_functions.sql               ← handle_new_user + RPCs
20260424_audit_access_anomalia.sql  ← Auditoria + anomalias + triggers de segurança
005_seed.sql                    ← Planos de monetização
```

### Via CLI (recomendado):
```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

---

## 3. Configurar autenticação

### Email
- Dashboard → **Authentication → Settings**
- **Site URL**: `https://agora-vilhena.vercel.app`
- **Redirect URLs**: adicione as URLs do `.env.example`
- Desative "Confirm email" durante dev (ative em produção)

### Templates de email (SMTP via Resend)
- Dashboard → **Authentication → Email Templates**
- Cole o conteúdo de `supabase/templates/confirm-signup.html` no template **Confirm signup**
- Cole `supabase/templates/reset-password.html` no template **Reset Password**

### SMTP (Resend)
- Dashboard → **Settings → Auth** → SMTP Settings:
  - Host: `smtp.resend.com` | Port: `465` | User: `resend`
  - Password: `RESEND_API_KEY`

### Google OAuth
1. [console.cloud.google.com](https://console.cloud.google.com) → New project
2. APIs → OAuth consent screen → Authorized domains: `supabase.co`
3. Credentials → OAuth 2.0 → Redirect URI: `https://xxxx.supabase.co/auth/v1/callback`
4. Dashboard → **Authentication → Providers → Google** → cole Client ID + Secret

---

## 4. Criar usuário admin

Após as migrações, crie o primeiro admin:

1. Dashboard → **Authentication → Users** → **Add user**
   - Email: `admin@agora.app` | Senha forte | ✓ Auto Confirm
2. Copie o UUID gerado
3. **SQL Editor**:
```sql
UPDATE profiles SET tipo_conta = 'admin' WHERE id = 'COLE_O_UUID_AQUI';
```

---

## 5. Deploy das Edge Functions

```bash
# Configurar variáveis de ambiente
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set ALERT_SECRET=uuid-secreto
supabase secrets set FROM_EMAIL="AGORA <nao-responda@agora.app>"
supabase secrets set ASAAS_ACCESS_TOKEN=$aact_xxx
supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx

# Deploy das functions
supabase functions deploy email-transacional
supabase functions deploy asaas-webhook
supabase functions deploy alertas-criticos
```

---

## 6. Configurar Webhooks (alertas em tempo real)

Dashboard → **Database → Webhooks** → New webhook:

### Webhook: alertas-criticos (audit_log)
- **Name**: alerta_audit
- **Table**: `audit_log`
- **Events**: Insert
- **URL**: `https://SEU_PROJECT.supabase.co/functions/v1/alertas-criticos`
- **Headers**: `Authorization: Bearer SEU_ALERT_SECRET`

### Webhook: alertas-criticos (anomalia_log)
- **Name**: alerta_anomalia
- **Table**: `anomalia_log`
- **Events**: Insert
- **URL**: `https://SEU_PROJECT.supabase.co/functions/v1/alertas-criticos`
- **Headers**: `Authorization: Bearer SEU_ALERT_SECRET`

---

## 7. Configurar pg_cron (expirar eventos)

Dashboard → **SQL Editor**:

```sql
-- Instala extensão pg_cron (disponível no Supabase)
select cron.schedule(
  'expirar-eventos-diario',
  '0 3 * * *',   -- todo dia às 03:00 UTC (meia-noite Brasília)
  $$ SELECT expirar_eventos_passados(); $$
);
```

---

## 8. Verificar configuração

```bash
# Testa conexão
supabase status

# Verifica tabelas
supabase db diff

# Testa Edge Function localmente
supabase functions serve email-transacional --env-file .env
curl -X POST http://localhost:54321/functions/v1/email-transacional \
  -H "Authorization: Bearer SEU_ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"boas_vindas","para":"teste@exemplo.com","nome":"Teste"}'
```

---

## Variáveis de ambiente no Vercel

Dashboard Vercel → Settings → Environment Variables:

| Nome | Valor |
|------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key do Supabase |

Estas são as únicas variáveis expostas ao cliente. Todas as outras ficam apenas nas Edge Functions via `supabase secrets`.

---

## Estrutura final

```
supabase/
├── config.toml                          ← CLI config
├── SETUP.md                             ← Este guia
├── migrations/
│   ├── 001_schema.sql                   ← Tabelas principais
│   ├── 002_rls_policies.sql             ← Políticas RLS
│   ├── 003_storage_buckets.sql          ← Storage
│   ├── 004_functions.sql                ← Functions + RPCs
│   ├── 005_seed.sql                     ← Planos de monetização
│   └── 20260424_audit_access_anomalia.sql ← Auditoria
└── functions/
    ├── email-transacional/index.ts      ← Email via Resend
    ├── asaas-webhook/index.ts           ← Pagamentos Asaas
    └── alertas-criticos/index.ts        ← Alertas Discord
```
