#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# AGORA — Teste local das Edge Functions
#
# Pré-requisitos:
#   1. supabase start  (ou supabase functions serve --env-file .env)
#   2. Configurar .env com RESEND_API_KEY, ALERT_SECRET, etc.
#
# Uso:
#   chmod +x supabase/functions/test-local.sh
#   ./supabase/functions/test-local.sh
#
# Variáveis de ambiente:
#   ALERT_SECRET  → segredo interno (padrão: TROQUE_AQUI)
#   EMAIL_TESTE   → email que receberá os testes (padrão: seu@email.com)
# ─────────────────────────────────────────────────────────────────

BASE_URL="http://localhost:54321/functions/v1"
ALERT_SECRET="${ALERT_SECRET:-TROQUE_AQUI}"
EMAIL_TESTE="${EMAIL_TESTE:-seu@email.com}"

PASS=0
FAIL=0

echo_sep() { echo; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; }
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

call() {
  # call <description> <expected_http_code> <extra curl args...>
  local desc="$1" expected="$2"
  shift 2
  local RESP HTTP_CODE BODY
  RESP=$(curl -s -w "\n%{http_code}" "$@")
  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | head -1)
  echo "  HTTP: $HTTP_CODE | Body: ${BODY:0:120}"
  [ "$HTTP_CODE" = "$expected" ] && ok "$desc" || fail "$desc (esperado $expected, obteve $HTTP_CODE)"
  echo "$BODY"
}


# ═══════════════════════════════════════════════════════════════════
# email-transacional
# ═══════════════════════════════════════════════════════════════════

echo_sep
echo "📧  EMAIL-TRANSACIONAL"

echo_sep
echo "1. boas_vindas"
call "boas_vindas" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"boas_vindas\",\"para\":\"$EMAIL_TESTE\",\"nome\":\"Tester AGORA\"}"

echo_sep
echo "2. nova_mensagem"
call "nova_mensagem" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"tipo\": \"nova_mensagem\",
    \"para\": \"$EMAIL_TESTE\",
    \"nome\": \"Destinatário Teste\",
    \"dados\": {
      \"remetente_nome\": \"João PJ\",
      \"preview\": \"Olá, gostaria de saber mais sobre o evento!\",
      \"conversa_id\": \"conv-uuid-teste\"
    }
  }"

echo_sep
echo "3. evento_pendente"
call "evento_pendente" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"tipo\": \"evento_pendente\",
    \"para\": \"$EMAIL_TESTE\",
    \"nome\": \"João PJ\",
    \"dados\": {
      \"evento_nome\": \"Festa da Empresa LTDA\",
      \"local\": \"Centro de Convenções de Vilhena\",
      \"data_inicio\": \"$(date -u +%Y-%m-%dT20:00:00Z)\"
    }
  }"

echo_sep
echo "4. evento_aprovado"
call "evento_aprovado" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"tipo\": \"evento_aprovado\",
    \"para\": \"$EMAIL_TESTE\",
    \"nome\": \"João PJ\",
    \"dados\": {
      \"evento_nome\": \"Festa da Empresa LTDA\",
      \"local\": \"Centro de Convenções\",
      \"data_inicio\": \"$(date -u +%Y-%m-%dT20:00:00Z)\"
    }
  }"

echo_sep
echo "5. evento_rejeitado"
call "evento_rejeitado" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"tipo\": \"evento_rejeitado\",
    \"para\": \"$EMAIL_TESTE\",
    \"nome\": \"João PJ\",
    \"dados\": {
      \"evento_nome\": \"Evento Problemático\",
      \"motivo\": \"O conteúdo não está de acordo com as diretrizes da plataforma.\"
    }
  }"

echo_sep
echo "6. pagamento_confirmado"
call "pagamento_confirmado" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"tipo\": \"pagamento_confirmado\",
    \"para\": \"$EMAIL_TESTE\",
    \"nome\": \"João PJ\",
    \"dados\": {
      \"plano_nome\": \"Mensal Pro\",
      \"valor\": \"79,90\",
      \"validade\": \"27 de maio de 2026\",
      \"metodo\": \"PIX\",
      \"id_externo\": \"pay_test_123456\"
    }
  }"

echo_sep
echo "7. alerta_denuncia"
call "alerta_denuncia" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"tipo\": \"alerta_denuncia\",
    \"para\": \"$EMAIL_TESTE\",
    \"nome\": \"Administrador\",
    \"dados\": {
      \"tipo\": \"evento\",
      \"motivo\": \"Informações falsas no endereço\",
      \"alvo_id\": \"evento-uuid-teste\"
    }
  }"

echo_sep
echo "8. Rate limit (segunda chamada idêntica à boas_vindas)"
call "rate_limit detectado" "200" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"boas_vindas\",\"para\":\"$EMAIL_TESTE\",\"nome\":\"Tester\"}"

echo_sep
echo "9. Autenticação inválida → 401"
call "auth_invalida rejeitada" "401" \
  -X POST "$BASE_URL/email-transacional" \
  -H "Authorization: Bearer TOKEN_INVALIDO" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"boas_vindas\",\"para\":\"teste@email.com\",\"nome\":\"Tester\"}"


# ═══════════════════════════════════════════════════════════════════
# expirar-eventos
# ═══════════════════════════════════════════════════════════════════

echo_sep
echo "⏰  EXPIRAR-EVENTOS"

echo_sep
echo "10. expirar-eventos (chamada manual)"
call "expirar_eventos OK" "200" \
  -X POST "$BASE_URL/expirar-eventos" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"

echo_sep
echo "11. expirar-eventos sem auth → 401"
call "expirar_eventos sem auth" "401" \
  -X POST "$BASE_URL/expirar-eventos" \
  -H "Content-Type: application/json" \
  -d "{}"


# ═══════════════════════════════════════════════════════════════════
# db-webhook
# ═══════════════════════════════════════════════════════════════════

echo_sep
echo "🔔  DB-WEBHOOK"

echo_sep
echo "12. db-webhook — anomalia_log INSERT"
call "db_webhook anomalia OK" "200" \
  -X POST "$BASE_URL/db-webhook" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"INSERT\",
    \"table\": \"anomalia_log\",
    \"schema\": \"public\",
    \"record\": {
      \"id\": \"anom-test-1\",
      \"tipo\": \"login_falha_repetida\",
      \"user_id\": \"user-uuid-teste\",
      \"descricao\": \"5 tentativas de login falhas em 10 minutos\",
      \"detalhes\": { \"tentativas\": 5, \"ip\": \"127.0.0.1\" },
      \"resolvido\": false,
      \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }"

echo_sep
echo "13. db-webhook — audit_log INSERT (crítico)"
call "db_webhook audit_critico OK" "200" \
  -X POST "$BASE_URL/db-webhook" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"INSERT\",
    \"table\": \"audit_log\",
    \"schema\": \"public\",
    \"record\": {
      \"id\": \"audit-test-1\",
      \"acao\": \"login_falha\",
      \"categoria\": \"auth\",
      \"severidade\": \"critico\",
      \"resultado\": \"falha\",
      \"user_id\": \"user-uuid-teste\",
      \"detalhes\": { \"ip\": \"127.0.0.1\", \"tentativas\": 10 },
      \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }"

echo_sep
echo "14. db-webhook — tabela desconhecida (deve ignorar graciosamente)"
call "db_webhook tabela_ignorada OK" "200" \
  -X POST "$BASE_URL/db-webhook" \
  -H "Authorization: Bearer $ALERT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"INSERT\",
    \"table\": \"outra_tabela\",
    \"schema\": \"public\",
    \"record\": { \"id\": \"xyz\" }
  }"

echo_sep
echo "15. db-webhook sem auth → 401"
call "db_webhook sem auth" "401" \
  -X POST "$BASE_URL/db-webhook" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"INSERT\",\"table\":\"anomalia_log\",\"schema\":\"public\",\"record\":{}}"


# ═══════════════════════════════════════════════════════════════════
# asaas-webhook
# ═══════════════════════════════════════════════════════════════════

echo_sep
echo "💳  ASAAS-WEBHOOK"

echo_sep
echo "16. asaas-webhook — PAYMENT_RECEIVED"
ASAAS_TOKEN="${ASAAS_ACCESS_TOKEN:-TOKEN_TESTE}"
call "asaas_payment_received" "200" \
  -X POST "$BASE_URL/asaas-webhook" \
  -H "asaas-access-token: $ASAAS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"event\": \"PAYMENT_RECEIVED\",
    \"payment\": {
      \"id\": \"pay_test_webhook_$(date +%s)\",
      \"value\": 79.90,
      \"billingType\": \"PIX\",
      \"dueDate\": \"$(date -u +%Y-%m-%d)\"
    }
  }"

echo_sep
echo "17. asaas-webhook sem token → 401"
call "asaas sem token" "401" \
  -X POST "$BASE_URL/asaas-webhook" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"PAYMENT_RECEIVED\",\"payment\":{\"id\":\"x\",\"value\":10}}"


# ═══════════════════════════════════════════════════════════════════
# Resumo
# ═══════════════════════════════════════════════════════════════════

echo_sep
echo
echo "📊  RESULTADO DOS TESTES"
echo "   ✅ Passaram: $PASS"
echo "   ❌ Falharam: $FAIL"
echo "   Total:       $((PASS+FAIL))"
echo
if [ "$FAIL" -eq 0 ]; then
  echo "🎉  Todos os testes passaram!"
else
  echo "⚠️   $FAIL teste(s) falharam. Verifique os logs acima."
fi
echo
echo "📬  Verifique sua caixa de entrada: $EMAIL_TESTE"
echo_sep
