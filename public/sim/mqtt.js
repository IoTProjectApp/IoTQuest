// Local, simulated MQTT QoS 0 broker. No network credentials or real sockets.
export class SimulatedBroker {
  constructor() {
    this.available = true;
    this.clients = new Map();
    this.messages = [];
    this.now = 0;
  }
  connect(id) {
    if (!this.clients.has(id) && this.clients.size >= 16)
      throw Error('Simulated MQTT supports at most 16 clients.');
    let c = this.clients.get(id) || {
      connected: false,
      topics: new Set(),
      values: new Map(),
      lastDelivery: 0,
    };
    c.connected = this.available;
    this.clients.set(id, c);
    return c.connected;
  }
  connected(id) {
    return !!(this.available && this.clients.get(id)?.connected);
  }
  subscribe(id, topic) {
    if (!this.connected(id)) return false;
    const topics = this.clients.get(id).topics;
    if (String(topic).length > 128 || (!topics.has(String(topic)) && topics.size >= 64))
      throw Error('MQTT topic limit: 64 subscriptions and 128 characters per topic.');
    topics.add(String(topic));
    return true;
  }
  publish(id, topic, payload) {
    if (String(topic).length > 128) throw Error('MQTT topic limit: 128 characters.');
    if (typeof payload === 'number' && !Number.isFinite(payload))
      throw Error('MQTT numbers must be finite.');
    if (typeof payload === 'string' && payload.length > 10000)
      throw Error('MQTT payload limit: 10,000 characters.');
    if (typeof payload === 'object')
      throw Error('MQTT payloads support scalar numbers, booleans or strings only.');
    const message = {
      at: this.now,
      client: id,
      topic: String(topic),
      payload,
      status: 'dropped: connection loss',
      delivered: 0,
    };
    if (this.connected(id)) {
      for (const c of this.clients.values())
        if (c.connected && c.topics.has(String(topic))) {
          c.values.set(String(topic), payload);
          c.lastDelivery = this.now;
          message.delivered++;
        }
      message.status = message.delivered ? 'delivered' : 'published: no subscribers';
    }
    this.messages.push(message);
    this.messages = this.messages.slice(-100);
    return message.status === 'delivered';
  }
  read(id, topic) {
    return this.clients.get(id)?.values.get(String(topic)) ?? 0;
  }
  setAvailable(value) {
    this.available = !!value;
    if (!this.available) for (const c of this.clients.values()) c.connected = false;
  }
}
