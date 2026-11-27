/** The Cartaz's status after recording Enviar through an MCP Apps host,
 * under "Enviado ✓" (#277). The regenerate's one stays true once the new
 * list came, in a message below this card. */
export const SEND_STATUS = {
  regenerating: 'A lista nova vem no chat, abaixo deste Cartaz.',
  toChat: 'O Claude recebeu seu texto.',
  notNotified:
    'Anotado, mas o aviso não chegou ao Claude. Se precisar refazer a lista, peça no chat.',
} as const
