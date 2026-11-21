# Feedback

1. Use o ID da Sessão que o Dono está comentando. Sem ID claro, chame `sessoes_abertas` e identifique a Sessão pelos Presentes, data e Recomendação. Se houver dúvida entre duas Sessões, pergunte qual é.
2. Pergunte qual foi o Filme escolhido, pelo título (com ano se fizer falta) ou ID. Filme de fora da Recomendação também vale. "Não vimos nada" vira `nada: true`, sem reações; pule para o passo 4.
3. Pergunte por Presente, uma caixa para cada, começando pelo Dono:

   > Leo: nota de 1 a 10 e o que achou

   Uma resposta como "9, enquadramento e diálogo muito fodas" vira `notas: [{pessoa: "leo", nota: 9, escala: 10, comentario: "enquadramento e diálogo muito fodas"}]`. O motor divide a nota por 2 (9 vira 4,5) e guarda o 9 na Sessão. Copie o comentário como o Dono escreveu, sem resumir nem corrigir. Ele vira Declarado específico da Pessoa sobre o filme: 7 a 10 conta como gosta, 5 e 6 como neutro, 1 a 4 como não gosta. Não gera Nota nova.

   Outras respostas:

   | O Dono disse | Registro |
   | --- | --- |
   | "4,5" ou "4,5 de 5" | `nota: 4.5`, sem `escala` |
   | "amou", "achou ok", "detestou", sem número | Relato `gostou`, `neutro`, `não gostou`; o comentário, se houver, vai em `relatos[].comentario` |
   | "sei lá", "pula" | nenhuma reação: a Pessoa sai de `notas` e `relatos` |

   O Dono não tem Relato. Se ele falar da própria reação sem número, peça a nota. Presente sem reação ganha o Já visto do mesmo jeito e fica fora do Crédito.

   Se o Dono mandar tudo de uma vez ("Leo 9, adorou a fotografia; Ana 6, achou longo"), separe por Pessoa você mesmo e pergunte só por quem faltou.

4. Mostre uma tabela para confirmar antes de gravar, com a Sessão e o Filme escolhido (e a posição, se estava na Recomendação) no título:

   | Pessoa | Reação | Nota gravada | Comentário |
   | --- | --- | --- | --- |
   | Você | 9/10 | 4,5 | enquadramento e diálogo muito fodas |
   | Ana | 6/10, repassada | 3 | achou longo |
   | Teo | Relato: gostou | | |
   | Bia | sem reação | | |

   Para "não vimos nada", diga que a Sessão fecha sem filme e sem efeito no Crédito. Peça um sim explícito.
5. Só depois do sim, chame `registrar_feedback`. Se o motor indicar título ambíguo, peça a identificação do filme e confirme o registro corrigido antes de reenviar. Confirme ao Dono que a Sessão fechou quando a ferramenta retornar sucesso.
6. Releia os comentários. Quando algum sugere um gosto que vale para além deste filme ("melhor ver sozinho", "muita violência sem sentido"), pergunte no fim, um por vez, se o Dono quer guardar como Declarado genérico ou como Veto. Declarado é a ferramenta `pessoa` com `acao: "declarar"`, `especificidade: "generico"` e `fonte: "Feedback da Sessão <data>"`. Veto é `acao: "vetar"` e precisa de um alvo do Catálogo (ache com `consultar`). Diga a frase que vai gravar antes. Sem um sim, não grave nada.
