// The view's entry: the `App` of ext-apps over `postMessage` to the host.
import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps'
import './view.css'
import { mountView } from './billboard-view'

const app = new App({ name: 'filmes-cartaz', version: '1.0.0' }, {})
void mountView(app, document.getElementById('root') as HTMLElement, () =>
  app.connect(new PostMessageTransport(window.parent, window.parent)),
)
