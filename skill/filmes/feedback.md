# Feedback

1. Use o ID da Sessão que o Dono está comentando. Sem ID claro, chame `sessoes_abertas` e identifique a Sessão pelos Presentes, data e Recomendação. Se houver dúvida entre duas Sessões, pergunte qual é.
2. Aceite texto livre. Identifique o Filme escolhido pelo título (com ano se fizer falta) ou ID. Filme de fora da Recomendação também vale. Converta as reações assim:

   | O Dono disse | Registro |
   | --- | --- |
   | "Eu dou 4" | `notas: [{pessoa: "dono", nota: 4}]` |
   | "Ana deu 4,5" | Nota da Ana repassada pelo Dono |
   | "Ana amou", "Leo achou ok", "Bia detestou" | Relatos `gostou`, `neutro`, `não gostou`, respectivamente |
   | "Não vimos nada" | `nada: true`, sem Filme escolhido nem reações |

   Notas vão de 0,5 a 5. Se o Dono descrever a própria reação sem número,
   pergunte a Nota. Se faltar uma reação, pergunte só por quem faltou.
   Se o Dono preferir deixar alguém sem reação, omita a Pessoa de `notas`
   e `relatos`. O motor registra o Já visto mesmo assim, e a ausência de
   reação fica fora do Crédito.

3. Mostre a Sessão, o Filme escolhido (com a posição se estava na Recomendação) e as reações separadas por Pessoa. Identifique cada uma como Nota, Nota repassada, Relato ou sem reação. Para "não vimos nada", diga que a Sessão fecha sem filme e sem efeito no Crédito. Peça confirmação explícita.
4. Só depois do sim, chame `registrar_feedback`. Se o motor indicar título ambíguo, peça a identificação do filme e confirme o registro corrigido antes de reenviar. Confirme ao Dono que a Sessão fechou quando a ferramenta retornar sucesso.
