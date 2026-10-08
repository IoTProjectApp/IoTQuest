import { esc } from './html.js';
import { conversationQuestions, selectedRequest } from './conversations.js';
// Markup for a resident chat: messages, suggested questions, a free-text question and the
// resident's other requests. Event wiring stays with the caller.
export function conversationHTML(chat, playerName = 'You') {
  const request = selectedRequest(chat);
  return (
    '<section class="character-chat">' +
    '<p class="chat-topic">' +
    esc(
      (chat.section ? chat.section + ' · ' : '') +
        (request ? 'Discussing: ' + request.mission.title : 'Talk with your neighbour'),
    ) +
    '</p>' +
    '<div class="chat-messages" id="chatMessages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">' +
    chat.messages
      .map((m) => {
        // "from-" prefix: bare .resident/.technician are the absolutely positioned map sprites.
        const name = m.speaker === 'resident' ? chat.resident : playerName;
        return (
          '<div class="chat-message from-' +
          m.speaker +
          '"><span class="chat-avatar" aria-hidden="true">' +
          esc(name.trim().charAt(0).toUpperCase()) +
          '</span><div class="chat-bubble"><strong>' +
          esc(name) +
          '</strong><p>' +
          esc(m.text) +
          '</p></div></div>'
        );
      })
      .join('') +
    '</div>' +
    '<div class="chat-questions" aria-label="Suggested questions">' +
    conversationQuestions
      .map(
        (q) =>
          '<button class="text-btn" data-chat-question="' + esc(q) + '">' + esc(q) + '</button>',
      )
      .join('') +
    '</div>' +
    '<form id="chatForm" class="chat-form"><label class="sr-only" for="chatInput">Ask ' +
    esc(chat.resident) +
    ' about their request</label><input id="chatInput" type="text" maxlength="240" autocomplete="off" placeholder="Ask about the request, components or animation…"/><button class="primary" type="submit">Send</button></form>' +
    '<details class="chat-requests"><summary>Other requests from ' +
    esc(chat.resident) +
    '</summary>' +
    chat.requests
      .map(
        (r) =>
          '<button class="quest-option ' +
          (r.index === chat.selectedIndex ? 'selected' : '') +
          '" data-chat-request="' +
          r.index +
          '"><span>⚑</span><div><strong>' +
          esc(r.mission.title) +
          '</strong><small>' +
          esc(r.mission.area) +
          ' · ' +
          (r.complete ? 'Passed' : r.mission.xp + ' XP') +
          '</small></div></button>',
      )
      .join('') +
    '</details>' +
    (request
      ? '<button class="primary chat-start" id="startChatQuest">' +
        (request.complete ? 'Review this request' : 'Start this request') +
        '</button>'
      : '') +
    '</section>'
  );
}
