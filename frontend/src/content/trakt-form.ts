import { within } from './form-fields'

export const TRAKT_PATH = '/trakt'
export const TRAKT_CONNECT = '/trakt/conectar'
export const TRAKT_DISCONNECT = '/trakt/desconectar'

const ERRORS = ['login', 'trakt', 'consentimento'] as const
export type TraktError = (typeof ERRORS)[number]
export const isTraktError = within(ERRORS)
