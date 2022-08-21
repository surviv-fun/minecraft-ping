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

'use strict'; // https://www.w3schools.com/js/js_strict.asp

const net = require('node:net');
const dns = require('node:dns');
const { PacketDecoder, createHandshakePacket, createPingPacket } = require('./packet');

const openConnection = (address) => {
    const { hostname, port } = address;

    return new Promise((resolve, reject) => {
        let connection = net.createConnection(port, hostname, () => {
            // Decode incoming packets
            let packetDecoder = new PacketDecoder();
            connection.pipe(packetDecoder);

            // Write handshake packet
            connection.write(createHandshakePacket(hostname, port));

            packetDecoder.once('error', (error) => {
                connection.destroy();
                clearTimeout(timeout);
                reject(error);
            });

            packetDecoder.once('packet', (data) => {
                // Write ping packet
                connection.write(createPingPacket(Date.now()));

                packetDecoder.once('packet', (ping) => {
                    connection.end();
                    clearTimeout(timeout);
                    data.ping = ping;
                    resolve(data);
                });
            });
        });

        // Destroy on error
        connection.once('error', (error) => {
            connection.destroy();
            clearTimeout(timeout);
            reject(error);
        });

        // Destroy on timeout
        connection.once('timeout', () => {
            connection.destroy();
            clearTimeout(timeout);
            reject(new Error('Timed out'));
        });

        // Packet timeout (10 seconds)
        let timeout = setTimeout(() => {
            connection.end();
            reject(new Error('Timed out (10 seconds passed)'));
        }, 10000);
    });
};

const checkSrvRecord = (hostname) => {
    return new Promise((resolve, reject) => {
        if (net.isIP(hostname) !== 0) {
            reject(new Error('Hostname is an IP address'));
        } else {
            dns.resolveSrv('_minecraft._tcp.' + hostname, (error, result) => {
                if (error) {
                    reject(error);
                } else if (result.length === 0) {
                    reject(new Error('Empty result'));
                } else {
                    resolve({
                        hostname: result[0].name,
                        port: result[0].port
                    });
                }
            });
        }
    });
};

const ping = (module.exports.ping = (hostname, port, callback) => {
    checkSrvRecord(hostname)
        .then(openConnection, (_) => openConnection({ hostname, port }))
        .then((data) => callback(null, data))
        .catch(callback);
});

const pingUri = (module.exports.pingUri = async (uri) => {
    const { protocol, hostname, port } = new URL(uri);
    if (!hostname || !protocol || protocol !== 'minecraft:') {
        throw new TypeError('not a correct minecraft URI');
    }
    return pingPromise(hostname, port ? parseInt(port, 10) : undefined);
});

const pingPromise = (module.exports.pingPromise = async (hostname, port) => {
    return new Promise((resolve, reject) => {
        ping(hostname, port, (error, result) => {
            error ? reject(error) : resolve(result);
        });
    });
});
