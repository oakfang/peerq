const crypto = require("crypto");
const EventEmitter = require("events");
const msgpack = require("msgpack-lite");
const most = require("most");
const uuid = require("uuid");
const Coven = require("coven");
const wrtc = require("wrtc");
const ws = require("ws");

const ALGO = "aes256";

function encryptObject(object, password) {
  const encodedObject = msgpack.encode(object);
  if (!password) return encodedObject;
  const cipher = crypto.createCipher(ALGO, password);
  let buff = cipher.update(encodedObject);
  buff = Buffer.concat([buff, cipher.final()]);
  return buff;
}

function decryptObject(buffer, password) {
  if (password) {
    const decipher = crypto.createDecipher(ALGO, password);
    let buff = decipher.update(buffer);
    buffer = Buffer.concat([buff, decipher.final()]);
  }
  return msgpack.decode(buffer);
}

class PeerQueue extends EventEmitter {
  constructor(config) {
    super();
    const { host, port, secure, password, room } = this._getOptions(config);
    this._coven = new Coven({
      wrtc,
      ws,
      room,
      signaling: this._getCovenURL(host, port, secure)
    });
    this._origin = this._coven.id;
    this._password = password;
    delete this.emit;
    this._connected = this._setupQueue();
  }

  _getOptions({ host, room, password, port = null, secure = false } = {}) {
    return { host, port, password, secure, room };
  }

  _getCovenURL(host, port, secure) {
    let protocol = "ws";
    if (secure) {
      protocol += "s";
    }
    if (port) {
      host = `${host}:${port}`;
    }
    const url = `${protocol}://${host}`;
    return url;
  }

  get size() {
    return this._coven.size;
  }

  _setupQueue() {
    return new Promise(resolve =>
      this._coven
        .on("peer", peer => {
          peer.on("data", buff => {
            try {
              const msg = decryptObject(buff, this._password);
              EventEmitter.prototype.emit.call(this, "message", msg);
            } catch (e) {}
          });
        })
        .once("connected", resolve)
    );
  }

  async waitForPeers(peersNumber) {
    while (this.size < peersNumber) {
      await new Promise(resolve => this._coven.once("peer", resolve));
    }
    return;
  }

  async _wire(buffer) {
    await this._connected;
    this._coven.broadcast(buffer);
  }

  _send(message) {
    const buff = encryptObject(message, this._password);
    return this._wire(buff);
  }

  getMessageStream({ excludeSelf = false } = {}) {
    const message$ = most.fromEvent("message", this);
    if (excludeSelf) {
      return message$.filter(({ $origin }) => $origin !== this._origin);
    }
    return message$;
  }

  _constructMessage(topic, payload) {
    if (payload === undefined) {
      payload = topic;
      topic = null;
    }
    const message = {
      $origin: this._origin,
      $id: uuid(),
      dt: Date.now(),
      topic,
      payload
    };
    return message;
  }

  async publish(topic, payload) {
    const message = this._constructMessage(topic, payload);
    await this._send(message);
    return message;
  }

  async respond(requestMessage, payload) {
    const { topic, $id: $to } = requestMessage;
    const message = this._constructMessage(topic, payload);
    message.$to = $to;
    await this._send(message);
    return message;
  }

  async request(topic, payload) {
    const msg = await this.publish(topic, payload);
    return new Promise(resolve => {
      const message$ = this.getMessageStream();
      message$
        .filter(({ $to }) => $to === msg.$id)
        .take(1)
        .map(({ payload }) => payload)
        .observe(resolve);
    });
  }
}

module.exports = PeerQueue;
