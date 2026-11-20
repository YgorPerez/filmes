# PROTÓTIPO descartável: fluxo de feedback pós-sessão

Ticket: "Fluxo de feedback pós-sessão". Escolhido: Fluxo A.

## Fluxo A: texto livre, depois confirmação (escolhido)

> **Dono:** vimos o Paddington 2. Ana amou, Leo achou ok, eu dou 4
>
> **Claude:** Vou registrar a Sessão de 2026-11-20 assim:
> - Filme escolhido: **Paddington 2** (estava em 1º no top 5)
> - Você: nota 4 *(nota)*
> - Ana: gostou *(relato seu)*
> - Leo: neutro *(relato seu)*
>
> Confirma? Se a Ana ou o Leo deram nota, me diga o número.

## Fluxo B: perguntas com opções (descartado)

1. Qual filme vocês viram? (top 5 + outro)
2. Sua nota? (0,5 a 5)
3. Ana? gostou / neutro / não gostou / ela deu nota
4. Leo? idem

## Registro: `sessoes/2026-11-20-ana-leo.md`

```markdown
---
data: 2026-11-20
presentes: [dono, ana, leo]
contexto:
  pedido: "somos eu, Ana e Leo, 2h, algo leve"
  duracao_max: 120
  clima: [leve]
  restricoes: []
regra: media-sem-miseria-com-justica
escolhido: tt5952332        # Paddington 2
escolhido_na_recomendacao: 1
feedback:
  registrado_em: 2026-11-21
  reacoes:
    - {pessoa: dono, nota: 4.0,  tipo: nota}
    - {pessoa: ana,  reacao: gostou, tipo: relato}
    - {pessoa: leo,  reacao: neutro, tipo: relato}
---

## Recomendação

1. Paddington 2 (tt5952332)
   - Evidência: Ana deu 5 a Paddington em 2024-03-02 · Fonte: export do Letterboxd da Ana · Força: forte · Tipo: nota
```

Crédito do Leo depois desta Sessão: média dos Presentes (0,78 + 1,0 + 0,5) / 3 = 0,76, menos 0,5 = 0,26.
