// What a guest sends through the Link da Sessão that becomes taste only with
// the Dono's yes, the Perguntas par a par's answers (#181) and a guest's Vi e
// gostei / Vi e não gostei (#378), waits in the Session until she records or
// discards it, stamped `recorded_on` or `discarded_on`.

/** Still waiting for the Dono: neither recorded nor discarded. */
export const awaitsOwner = (item: {
  readonly recorded_on?: unknown
  readonly discarded_on?: unknown
}): boolean => item.recorded_on === undefined && item.discarded_on === undefined
