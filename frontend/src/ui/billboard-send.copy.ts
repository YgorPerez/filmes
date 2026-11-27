/** The Cartaz's status after recording Enviar through an MCP Apps host,
 * under "Enviado ✓" (#277). */
export const SEND_STATUS = {
  regenerating: 'O Claude está refazendo a lista.',
  toChat: 'O Claude recebeu seu texto.',
  notNotified:
    'Anotado, mas o aviso não chegou ao Claude. Se precisar refazer a lista, peça no chat.',
} as const
