const Browser = require('zombie');
const Snappy = require('snappy');
const WebSocket = require('ws');
const browser = new Browser();
const sha1 = require('sha1');
require('colour');

const serverIP = 'ws://eu.borb.io:4501/?t=1';

class Bot {
    constructor(id, server, pVersion, initBase, initVersion) {
        this.init1 = ((initBase ^ initVersion) ^ pVersion) << (Math.imul(initBase, initVersion ^ initBase));
        this.protocolVersion = pVersion;
        this.botNick = 'OP-Bots.com';
        this.cellsIDs = new Array();
        this.node = new Object();
        this.allNodes = [];
        this.WebK = 0;
        this.id = id;
        this.connect(server);
    }

    connect(server) {
        this.ws = new WebSocket(server);
        this.ws.binaryType = 'nodebuffer';
        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onerror = this.onError.bind(this);
        this.ws.onclose = this.onClose.bind(this);
        this.ws.onopen = this.onOpen.bind(this);
    }

    send(msg, encryption) {
        if (this.ws && this.ws.readyState == WebSocket.OPEN) {
            if (encryption) {
                let compressedData = Snappy.compressSync(msg);
                let tmp = new Uint8Array([117]);
                let buf = this.appendBuffer(tmp.buffer, compressedData.buffer);
                this.ws.send(this.dring(new Uint8Array(buf)));
                this.WebK = this.rotate(this.WebK);
                return;
            }
            this.ws.send(msg);
        }
    }

    onOpen() {
        console.log(`bot_${this.id}: Connected to server`.green);

        let buf = new Buffer.alloc(5);

        buf.writeUInt8(254, 0);
        buf.writeUInt32LE(this.protocolVersion, 1);

        this.send(buf);

        buf = new Buffer.alloc(5);

        buf.writeUInt8(255, 0);
        buf.writeUInt32LE(this.init1, 1);
        this.send(buf);
    }

    onClose() {
        console.log(`bot_${this.id}: Connection closed`.red);
    }

    onError() {
        console.log(`bot_${this.id}: Connection error`.red);
    }

    async onMessage(msg) {
        msg = new Buffer.from(msg.data);
        let offset = 0;

        switch (msg.readUInt8(offset++)) {
            case 16: // nodes
                let off = 1;
                let eatRecordLength = msg.readUInt16LE(off);
                off += 2;

                for (let i = 0; i < eatRecordLength; i++) off += 8;

                while (true) {
                    this.node.id = msg.readUInt32LE(off);
                    off += 4;

                    if (this.node.id == 0) break;

                    this.node.x = msg.readInt32LE(off);
                    off += 4;

                    this.node.y = msg.readInt32LE(off);
                    off += 4;

                    this.node.size = msg.readUInt16LE(off);
                    off += 2;

                    this.node.flags = msg.readUInt8(off++);

                    if (this.node.flags & 2) off += 3;
                    if (this.node.flags & 4) while (msg.readUInt8(off++) !== 0) { }
                    if (this.node.flags & 8) while (msg.readUInt8(off++) !== 0) { }
                }

                let removeRecordLength = msg.readUInt16LE(off);
                off += 2;

                for (let i = 0; i < removeRecordLength; i++) {
                    let removedEntityID = msg.readUInt32LE(off);
                    off += 4;
                    if (this.cellsIDs.includes(removedEntityID)) this.cellsIDs = this.cellsIDs.filter(x => x != removedEntityID);
                }

                if (this.isAlive && this.cellsIDs.length == 0) {
                    console.log(`bot_${this.id}: Respawning`.cyan);
                    this.isAlive = false;
                    this.spawn();
                }

                break;

            case 32:
                console.log(`bot_${this.id}: Spawned`.green);
                this.cellsIDs.push(msg.readUInt32LE(offset));
                this.isAlive = true;
                break;

            case 112: // protection 1
                this.clientKey = this.hash(msg, offset);
                var buf = new Buffer.alloc(this.clientKey.length + 2);

                buf.writeUInt8(113, 0);
                buf.write(this.clientKey, 1);

                this.send(buf);
                break;

            case 252: // protection 2
                this.userData = browser.evaluate(this.decodeString(msg, offset).toString());
                this.userData = JSON.stringify(this.userData);
                buf = new Buffer.alloc(this.userData.length + 2);

                buf.writeUInt8(252, 0);
                buf.write(this.userData, 1);

                this.send(buf);
                break;

            case 114: // encryption
                this.WebK = msg.readInt32LE(offset);
                break;

            case 200: // ready
                this.spawn();
                break;
        }
    }

    spawn() {
        let buf = new Buffer.alloc(this.botNick.length + 12);

        buf.writeUInt8(73, 0);
        buf.write('<Overlay1>' + this.botNick, 1);

        this.send(buf, true);
    }

    split() {
        this.send(new Uint8Array([41]), true);
    }

    eject() {
        this.send(new Uint8Array([21]), true);
    }

    decodeString(msg, offset) {
        let x = '', d;
        while ((d = msg.readUInt8(offset)) != 0) {
            offset += 1
            x += String.fromCharCode(d);
        }
        return x;
    }

    appendBuffer(buf, data) {
        let tmp = new Uint8Array(buf.byteLength + data.byteLength);
        tmp.set(new Uint8Array(buf), 0);
        tmp.set(new Uint8Array(data), buf.byteLength);
        return tmp.buffer;
    }

    moveTo(x, y) {
        let buf = new Buffer.alloc(13);

        buf.writeUInt8(98, 0);
        buf.writeUInt32LE(x, 1);
        buf.writeUInt32LE(y, 5);
        buf.writeUInt32BE(0, 9);

        this.send(buf);
    }

    dring(msg) {
        msg = new Uint8Array(msg.buffer);

        let ArrayB = new Uint8Array(msg.length);

        let keyBytes = [

            (this.WebK & 255),
            (this.WebK >>> 8) & 255,
            (this.WebK >>> 16) & 255,
            (this.WebK >>> 24) & 255

        ];

        let keyBytes2 = [

            (keyBytes[0] << 2) & 255,
            (keyBytes[1] << 2) & 255,
            (keyBytes[2] << 2) & 255,

        ];

        for (let i = 0; i < msg.length; i++) {

            ArrayB[i] = (msg[i] ^ keyBytes[i % 4]) ^ keyBytes2[i % 3];

        };

        return ArrayB.buffer;
    }

    rotate(key) {
        key = Math.imul(key, 1540483477) >> 0;
        key = (Math.imul(key >>> 24 ^ key, 1540483477) >> 0) ^ 114296087;
        key = Math.imul(key >>> 13 ^ key, 1540483477) >> 0;
        key = key >>> 15 ^ key;
        key = key ^ 2952996808;
        key = 2566594879 ^ key;
        key = key >>> 2;
        return key;
    }

    hash(msg, offset) {
        let x = '', d;
        while ((d = msg.readUInt8(offset++)) != 0) x += String.fromCharCode(d);

        return decodeURIComponent(escape(sha1(x)));
    }
}

new Bot(1, serverIP, 6, 656877351, 21002);
