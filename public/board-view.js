import { esc } from './html.js';
// Markup for the "Real board" section of the Live circuit tab.
export function boardPanelHTML({ supported, connected, lastLine, sendOutputs, board }) {
  return (
    '<section class="board-panel" aria-labelledby="boardHeading"><h4 id="boardHeading">Real board</h4>' +
    (!supported
      ? '<p>Connecting a real ' +
        esc(board) +
        ' needs Web Serial, which works in Chrome or Edge on a computer. Everything else works without it.</p>'
      : '<p>Flash the board program to a real ' +
        esc(board) +
        ' wired like your circuit, then connect it with a USB cable. Its real sensor readings replace the simulated ones' +
        (sendOutputs ? ', and your program’s outputs drive the real pins.' : '.') +
        '</p><div class="board-actions"><button class="outline" id="boardProgram">Download board program</button>' +
        (connected
          ? '<button class="outline" id="boardDisconnect">Disconnect</button>'
          : '<button class="primary" id="boardConnect">Connect a real board</button>') +
        '<label><input type="checkbox" id="boardOutputs"' +
        (sendOutputs ? ' checked' : '') +
        '> Send outputs to the board</label></div>' +
        '<p class="board-status" id="boardStatus" role="status">' +
        (connected
          ? '● Connected' +
            (lastLine ? ' · <code>' + esc(lastLine) + '</code>' : ' · waiting for readings…')
          : '○ Not connected') +
        '</p>') +
    '</section>'
  );
}
