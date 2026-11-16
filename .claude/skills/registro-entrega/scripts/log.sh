#!/usr/bin/env bash
# Timeline do desafio (AI_LOG.md) com horário real do sistema.
#
# Uso:
#   log.sh init                         cria os 3 arquivos a partir dos templates (não sobrescreve)
#   log.sh [-t HH:MM] <tipo> "<texto>"  adiciona uma linha à timeline
#   log.sh resumo                       primeiro/último horário e nº de registros por dia
#
# REGISTRO_DIR muda o diretório de destino (padrão: raiz do repositório git).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${REGISTRO_DIR:-$(git -C "$SKILL_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG="$ROOT/AI_LOG.md"
TIPOS="pedido proposta decisao divergencia descarte trade-off ambiguidade correcao-ia validacao prompt marco"

init() {
  for f in AI_LOG.md DECISIONS.md AI_USAGE.md; do
    if [[ -e "$ROOT/$f" ]]; then
      echo "mantido: $f"
    else
      cp "$SKILL_DIR/assets/$f" "$ROOT/$f" && echo "criado:  $f"
    fi
  done
}

resumo() {
  [[ -f "$LOG" ]] || { echo "sem $LOG" >&2; exit 1; }
  awk '
    /^## [0-9]{4}-[0-9]{2}-[0-9]{2}/ { if (d) print d": "ini" → "fim" ("n" registros)"; d=$2; ini=""; n=0; next }
    /^- `[0-9]{2}:[0-9]{2}`/ { h=substr($2,2,5); if (!ini) ini=h; fim=h; n++ }
    END { if (d) print d": "ini" → "fim" ("n" registros)" }
  ' "$LOG"
}

registrar() {
  local hora="" tipo texto hoje
  if [[ "${1:-}" == "-t" ]]; then
    hora="${2:?informe HH:MM após -t}"; shift 2
    [[ "$hora" =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { echo "hora inválida: $hora" >&2; exit 1; }
  fi
  tipo="${1:?informe o tipo}"; texto="${2:?informe o texto}"
  [[ " $TIPOS " == *" $tipo "* ]] || { echo "tipo inválido: $tipo (use: $TIPOS)" >&2; exit 1; }
  [[ -f "$LOG" ]] || cp "$SKILL_DIR/assets/AI_LOG.md" "$LOG"

  hoje="$(date +%F)"
  hora="${hora:-$(date +%H:%M)}"
  # Abre o cabeçalho do dia se o último dia registrado não for hoje.
  if [[ "$(grep -E '^## [0-9]{4}-' "$LOG" | tail -1)" != "## $hoje" ]]; then
    printf '\n## %s\n\n' "$hoje" >> "$LOG"
  fi
  printf -- '- `%s` **%s** — %s\n' "$hora" "$tipo" "$texto" >> "$LOG"
  echo "registrado: $hora $tipo"
}

case "${1:-}" in
  init) init ;;
  resumo) resumo ;;
  ""|-h|--help) sed -n '2,9p' "$0" ;;
  *) registrar "$@" ;;
esac
