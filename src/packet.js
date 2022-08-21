/**
 * Copyright (c) LuciferMorningstarDev <contact@lucifer-morningstar.dev>
 * Copyright (c) surviv.fun <contact@surviv.fun>
 * Copyright (C) surviv.fun team and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { Writable } = require('node:stream');
const varint = require('varint');
const Int64 = require('node-int64');

const PROTOCOL_VERSION = 736; // Minecraft 1.16.1

module.exports.createHandshakePacket = (address, port) => {
    let portBuffer = Buffer.allocUnsafe(2);
    portBuffer.writeUInt16BE(port, 0);

    // Return hansdhake packet with request packet
    return Buffer.concat([createPacket(0, Buffer.concat([Buffer.from(varint.encode(PROTOCOL_VERSION)), Buffer.from(varint.encode(address.length)), Buffer.from(address, 'utf8'), portBuffer, Buffer.from(varint.encode(1))])), createPacket(0, Buffer.alloc(0))]);
};

module.exports.createPingPacket = (timestamp) => {
    return createPacket(1, new Int64(timestamp).toBuffer());
};

function createPacket(packetId, data) {
    return Buffer.concat([Buffer.from(varint.encode(varint.encodingLength(packetId) + data.length)), Buffer.from(varint.encode(packetId)), data]);
}

module.exports.PacketDecoder = class PacketDecoder extends Writable {
    constructor(options) {
        super(options);
        this.buffer = Buffer.alloc(0);
    }

    _write(chunk, encoding, callback) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        decodePacket(this.buffer)
            .catch((_) => callback())
            .then((packet) => {
                if (!packet) return;
                if (packet.id === 0) {
                    return decodeHandshakeResponse(packet);
                } else if (packet.id === 1) {
                    return decodePong(packet);
                }
            })
            .then((packet) => {
                if (!packet) return;

                // Remove packet from internal buffer
                this.buffer = this.buffer.slice(packet.bytes);

                this.emit('packet', packet.result);
                callback();
            })
            .catch(callback);
    }
};

function decodePacket(buffer) {
    return new Promise((resolve, reject) => {
        // Decode packet length
        let packetLength = varint.decode(buffer, 0);
        if (packetLength === undefined) {
            return reject(new Error('Could not decode packetLength'));
        }

        // Check if packet is long enough
        if (buffer.length < varint.encodingLength(packetLength) + packetLength) {
            return reject(new Error('Packet is not complete'));
        }

        // Decode packet id
        let packetId = varint.decode(buffer, varint.encodingLength(packetLength));
        if (packetId === undefined) {
            return reject(new Error('Could not decode packetId'));
        }

        // Slice data
        let data = buffer.slice(varint.encodingLength(packetLength) + varint.encodingLength(packetId));

        // Resolve
        resolve({
            id: packetId,
            bytes: varint.encodingLength(packetLength) + packetLength,
            data
        });
    });
}

function decodeHandshakeResponse(packet) {
    return new Promise((resolve, reject) => {
        // Read json response field
        let responseLength = varint.decode(packet.data, 0);
        let response = packet.data.slice(varint.encodingLength(responseLength), varint.encodingLength(responseLength) + responseLength);

        packet.result = JSON.parse(response);
        resolve(packet);
    });
}

function decodePong(packet) {
    return new Promise((resolve, reject) => {
        // Decode timestamp
        let timestamp = new Int64(packet.data);

        packet.result = Date.now() - timestamp;
        resolve(packet);
    });
}
