"use strict";

const tls = require("tls");
const WebSocket = require("ws");
const extractJson = require("extract-json-from-string");

const CONNECTION_OPTIONS = {
    host: "canary.discord.com",
    port: 443,
};

const API_TOKEN = "MTI0OTA2ODc3ODAxNzUyMTc2Nw.GhNSEy.15OmPZzf4iYqVU0RvNfLESOXMoIgVOy3Vtb3dY";  

let vanity;
let tlsSocket;
let websocket;
let guilds = {};

function elapsedMilliseconds(start) {
    const end = process.hrtime(start);
    return end[0] * 1000 + end[1] / 1e6;
}

function sendRequest(socket, request) {
    socket.write(request);
}

function handleData(data) {
    const ext = extractJson(data.toString());
    const find = ext.find((e) => e.code) || ext.find((e) => e.message);

    if (find) {
        console.log(find);
        const requestBody = {
            content: `@everyone UP ${vanity} \n\`\`\`json\n${JSON.stringify(find)}\`\`\``,
        };
        sendRequest(tlsSocket, createRequest("POST", `/api/v9/channels/1265353165360992279/messages`, requestBody));
    }
}

function createRequest(method, path, body) {
    const requestBody = body ? JSON.stringify(body) : "";
    const contentLength = Buffer.byteLength(requestBody);

    return [
        `${method} ${path} HTTP/1.1`,
        "Host: canary.discord.com",
        `Authorization: ${API_TOKEN}`,
        "Content-Type: application/json",
        `Content-Length: ${contentLength}`,
        "Connection: keep-alive",
        "",
        requestBody,
    ].join("\r\n");
}

function updateGuildVanityUrl(code) {
    const patchRequest = createRequest("PATCH", `/api/v9/guilds/1261212466482778112/vanity-url`, { code });
    sendRequest(tlsSocket, patchRequest);
}

function handleGuildUpdate(data) {
    const find = guilds[data.guild_id];
    if (find && find !== data.vanity_url_code) {
        const start = process.hrtime();
        updateGuildVanityUrl(find);
        const elapsed = elapsedMilliseconds(start);
        vanity = `${find} update \`${elapsed.toFixed(3)}ms\``;
    }
}

function handleWebSocketMessage(message) {
    const { d, op, t } = JSON.parse(message.data);
    if (t === "GUILD_UPDATE") {
        handleGuildUpdate(d);
    } else if (t === "READY") {
        d.guilds.forEach(({ id, vanity_url_code, name }) => {
            if (vanity_url_code) {
                guilds[id] = vanity_url_code;
            } else {
                console.log(name);
            }
        });
        console.log(guilds);
    }

    if (op === 10) {
        const identifyPayload = {
            op: 2,
            d: {
                token: "MTI0OTA2ODc3ODAxNzUyMTc2Nw.GhNSEy.15OmPZzf4iYqVU0RvNfLESOXMoIgVOy3Vtb3dY",
                intents: 1,
                properties: {
                    os: "macos",
                    browser: "firefox",
                    device: "mybot",
                },
            },
        };
        websocket.send(JSON.stringify(identifyPayload));
    } else if (op === 7) {
        process.exit();
    }
}

tlsSocket = tls.connect(CONNECTION_OPTIONS, () => {
    websocket = new WebSocket("wss://gateway-us-east1-b.discord.gg");

    websocket.onclose = (event) => {
        console.log(`ws connection closed ${event.reason} ${event.code}`);
        process.exit();
    };

    websocket.onmessage = handleWebSocketMessage;

    tlsSocket.on("data", async (data) => {
        handleData(data);
    });

    tlsSocket.on("error", (error) => {
        console.log(`tls error`, error);
        process.exit();
    });

    tlsSocket.on("end", () => {
        console.log("tls connection closed");
        process.exit();
    });

    tlsSocket.on("secureConnect", () => {
        setInterval(() => {
            sendRequest(tlsSocket, createRequest("GET", "/", null));
        }, 600);

        setInterval(() => {
            if (websocket.readyState === WebSocket.OPEN) {
                websocket.ping();
            }
        }, 30000);
    });
});
