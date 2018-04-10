# peerq
A p2p queue using a coven broker

## Install
`yarn add peerq`

## Usage
```ts
const PeerQueue = require('peerq');

const peerq = new PeerQueue({
    host: 'localhost', // Your coven-broker host
    port: 4000, // Your coven-broker port
    secure: false, // is your broker using wss?
    room: 'dev', // Use this coven room for the queue
    password: '123456', // encrypt all queue messages with this password (messages that can't be decrypted are dropped)
});

type UUID = string;
type CovenID = UUID;
type PeerqClientID = UUID;
type Timestamp = number;
type PeerqMessagePayload = any;
 
type PeerqMessage = {
    $origin: CovenID;
    $id: PeerqClientID;
    dt: Timestamp;
    topic: string;
    payload: PeerqMessagePayload;
};

// peerq.publish([topic: string], payload: PeerqMessagePayload) -> Promise<PeerqMessage>
peerq.publish({ user: 'foo' }).then(() => {
    // message was published to queue...
});

// peerq.waitForPeers(peerNumber: number) -> Promise<void>
peerq.waitForPeers(1).then(() => {
    // there's at least one other peer using the queue
    // this DOES NOT guarantee that peer can read/write your encrypted messages

    console.log(peerq.size); // peerq.size -> number, number of active peers
});

// peerq.request([topic: string], payload: PeerqMessagePayload) -> Promise<PeerqMessagePayload>
peerq.request({ user: 'foo' }).then(response => {
    // a client responded (see below) to your request.
});

type MessageStreamOptions = {
    // exclude your own messages. default: false
    excludeSelf: boolean;
};

// peerq.getMessageStream(options?: MessageStreamOptions) -> Observable<PeerqMessage>
const message$ = peerq.getMessageStream()
                      .filter(({ payload }) => payload.user && payload.user === 'foo')
                      .observe(async msg => {
                          // peerq.respond(msg: PeerqMessage, response: PeerqMessagePayload) -> Promise<PeerqMessage>
                          await peerq.respond(msg, 'meow');
                          // response sent!
                      });
```