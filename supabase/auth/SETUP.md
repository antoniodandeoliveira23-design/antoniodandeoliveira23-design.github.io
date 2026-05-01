# Supabase Auth — Configuração dos Templates de Email

## Como aplicar os templates

Acesse: **Supabase Dashboard → Authentication → Email Templates**

Para cada template abaixo, cole o conteúdo HTML do arquivo correspondente no campo "Body":

| Template Supabase         | Arquivo                    | Subject sugerido                          |
|---------------------------|----------------------------|-------------------------------------------|
| Confirm signup            | `confirm.html`             | `Confirme seu email — AGORA`              |
| Reset Password            | `reset-password.html`      | `Redefinir senha — AGORA`                 |
| Magic Link                | `magic-link.html`          | `Seu link de acesso — AGORA`              |
| Invite user               | `invite.html`              | `Você foi convidado para o AGORA 🎉`      |

---

## Variáveis disponíveis nos templates

| Variável               | Descrição                                              |
|------------------------|--------------------------------------------------------|
| `{{ .ConfirmationURL }}`| URL de confirmação/ação gerada pelo Supabase          |
| `{{ .Email }}`         | Email do destinatário                                  |
| `{{ .SiteURL }}`       | URL do site (configurada em Auth → URL Configuration) |
| `{{ .CurrentYear }}`   | Ano atual (para o copyright no rodapé)                |

> **Nota:** `{{ .CurrentYear }}` não é uma variável nativa do Supabase. Substitua pelo ano fixo `2025` ou remova o rodapé de copyright nos templates se preferir.

---

## Configurações obrigatórias no Dashboard

### 1. Auth → URL Configuration

```
Site URL:         https://agora-vilhena.vercel.app
Redirect URLs:    https://agora-vilhena.vercel.app/**
                  exp://localhost:8081/**
                  agora://**
```

### 2. Auth → SMTP (para usar Resend como provedor)

O arquivo `supabase/config.toml` já configura o SMTP do Resend para desenvolvimento local.
Para produção, configure em: **Authentication → SMTP Settings**

```
Host:      smtp.resend.com
Port:      465
User:      resend
Password:  <RESEND_API_KEY>
Sender:    nao-responda@agora.app
```

> Certifique-se de que o domínio `agora.app` está verificado no Resend.
> Se usar domínio próprio, atualize `FROM_EMAIL` no `.env` e na Edge Function.

### 3. Auth → Providers → Email

- ✅ Enable Email provider
- ✅ Confirm email (requer confirmação antes do login)
- ✅ Enable Magic Links (login sem senha)
- Minimum password length: **8**

### 4. Auth → Providers → Google (opcional)

```
Client ID:     <GOOGLE_CLIENT_ID>
Client Secret: <GOOGLE_CLIENT_SECRET>
```

Redirect URI para adicionar no Google Cloud Console:
```
https://xxxxxxxxxxxxxxxxxxxx.supabase.co/auth/v1/callback
```

---

## DB Webhooks — configuração para `db-webhook`

Acesse: **Database → Webhooks → Create a new webhook**

### Webhook 1: anomalia_log

```
Name:    anomalia-critica
Table:   anomalia_log
Events:  INSERT
URL:     https://<project-ref>.supabase.co/functions/v1/db-webhook
Headers:
  x-webhook-source: supabase
  Authorization: Bearer <ALERT_SECRET>
```

### Webhook 2: audit_log

```
Name:    audit-critico
Table:   audit_log
Events:  INSERT
URL:     https://<project-ref>.supabase.co/functions/v1/db-webhook
Headers:
  x-webhook-source: supabase
  Authorization: Bearer <ALERT_SECRET>
```

---

## pg_cron — `expirar-eventos` agendado

Habilite a extensão pg_cron: **Database → Extensions → pg_cron**

Depois execute no **SQL Editor**:

```sql
-- Agendar expiração diária às 03:00 (horário do servidor)
SELECT cron.schedule(
  'expirar-eventos-diario',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.edge_functions_url') || '/expirar-eventos',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.alert_secret'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Configurar as settings (substitua os valores reais)
ALTER DATABASE postgres SET app.edge_functions_url = 'https://<project-ref>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.alert_secret = '<ALERT_SECRET>';
```

Para verificar os jobs agendados:
```sql
SELECT * FROM cron.job;
```

---

## Edge Functions — variáveis de ambiente

Acesse: **Settings → Edge Functions → Add new secret**

Adicione cada variável abaixo:

| Secret                   | Valor                                         |
|--------------------------|-----------------------------------------------|
| `ALERT_SECRET`           | String aleatória segura (mesmo valor do .env) |
| `RESEND_API_KEY`         | `re_xxxx...` (do painel Resend)               |
| `FROM_EMAIL`             | `AGORA <nao-responda@agora.app>`              |
| `ADMIN_EMAIL`            | Email do administrador                        |
| `APP_URL`                | `https://agora-vilhena.vercel.app`            |
| `ASAAS_ACCESS_TOKEN`     | Token do Asaas (produção ou sandbox)          |
| `DISCORD_WEBHOOK_URL`    | URL do webhook Discord (opcional)             |

> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` são
> injetados automaticamente em todas as Edge Functions — não precisa adicionar.

---

## Realtime — habilitar tabelas

Execute no SQL Editor (se ainda não executou a migration `006_realtime.sql`):

```sql
ALTER TABLE mensagens REPLICA IDENTITY FULL;
ALTER TABLE conversas  REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE conversas;
```

Verifique em: **Database → Replication → supabase_realtime**

---

## Storage — criar bucket de imagens

Execute no SQL Editor:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imagens',
  'imagens',
  true,
  10485760,  -- 10 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: autenticados podem fazer upload na pasta do próprio ID
CREATE POLICY "upload_proprio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imagens' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: leitura pública de todas as imagens
CREATE POLICY "leitura_publica" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'imagens');

-- Policy: dono pode deletar a própria imagem
CREATE POLICY "deletar_proprio" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'imagens' AND (storage.foldername(name))[1] = auth.uid()::text);
```
