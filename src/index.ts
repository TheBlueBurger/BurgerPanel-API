import ws from "ws";
import { once, EventEmitter } from "events";

export default class BurgerPanelAPI {
    apiURL: string;
    token: string;
    constructor(apiURL: string, token: string) {
        this.apiURL = apiURL;
        if(!this.apiURL.endsWith("/")) this.apiURL += "/";
        this.token = token;
    }
    async makeRequest(name: string, data: any) {
        let headers = new Headers();
        headers.set("Content-Type", "application/json");
        headers.set("Authorization", this.token);
        let res = await fetch(this.apiURL + "api/request/" + name, {
            method: "POST",
            headers,
            body: JSON.stringify(data)
        });
        if(!res.ok) throw new Error(await res.text());
        return await res.json();
    }
    async getAllServers() {
        return await this.makeRequest("getAllServers", {});
    }
    async stopServer(id: string) {
        return await this.makeRequest("stopServer", {id});
    }
    async startServer(id: string) {
        return await this.makeRequest("startServer", {id});
    }
    async getLogs(id: string) {
        return await this.makeRequest("serverLogs", {
            list: true,
            id
        })
    }
    async getLog(id: string, logName: string) {
        return await this.makeRequest("serverLogs", {
            log: logName,
            id
        })
    }
    async writeToConsole(id: string, command: string) {
        return await this.makeRequest("writeToConsole", {
            id,
            command
        })
    }
    async initWebsocketClient() {
        let client = new WebSocketClient(this.apiURL);
        await client.login(this.token);
        return client;
    }
}

class WebSocketClient extends EventEmitter {
    client: ws.WebSocket;
    currentRequestID: number = 0;
    constructor(apiURL: string) {
        super();
        this.client = new ws(apiURL.replace("http", "ws"));
        this.client.on("message", msg => {
            let data = JSON.parse(msg.toString());
            if(data.type) {
                this.emit(data.type, data);
                if(data.emits) data.emits.forEach((emit: string) => this.emit(emit, data));
                return;
            }
            this.emit(data.r, data);
        })
    }
    async sendRequest(packetName: string, data: any) {
        let rid = this.currentRequestID++;
        this.client.send(JSON.stringify({
            n: packetName,
            r: rid,
            d: data
        }));
        let resp = await once(this, rid.toString());
        let respData = resp[0];
        if(respData.e) throw new Error(respData.e);
        return respData.d;
    }
    async login(token: string) {
        if(this.client.readyState != ws.OPEN) await once(this.client, "open");
        await this.sendRequest("auth", {token});
    }
    async attachToServer(id: string) {
        await this.sendRequest("attachToServer", {
            _id: id
        });
        let thisThis = this;
        let detached = false;
        return {
            async detach() {
                detached = true;
                await thisThis.sendRequest("detachFromServer", {id});
                thisThis.removeAllListeners("serverOutput-" + id);
            },
            onMsg(cb: (msg: string) => void) {
                if(detached) throw new Error("Detached!");
                thisThis.on("serverOutput-" + id, (d) => {
                    cb(d.data);
                })
            }
        }
    }
}
export {BurgerPanelAPI}