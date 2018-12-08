import io from "socket.io-client";

export default class WebRTCClient {
  private localStream!: MediaStream | null;
  private remoteStreams: { [index: string]: MediaStream } = {};

  private peerConnections: RTCPeerConnection[] = [];

  private port = 3001;
  private socket!: SocketIOClient.Socket;

  private peerJoinCallback!: (stream: MediaStream) => void;
  private peerLeaveCallback!: (streamId: string) => void;

  async setLocalStream() {
    const constraints = {
      video: true,
      audio: true,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.localStream;
  }

  getLocalStream() {
    return this.localStream;
  }

  
  stopVideo() {
    this.stopLocalStream(this.localStream!);
    this.localStream = null;
  }

  
  connect(room: string) {
    this.socket = io.connect("http://localhost:" + this.port + "/");
    this.socket.on("connect", () => {
      this.socket.emit("enter", room);
      this.socket.on("message", (message: any) => {
        const fromId = message.from;
        switch (message.type) {
          case "offer":
            const offer = new RTCSessionDescription(message);
            this.setOffer(fromId, offer);
            break;
          case "answer":
            const answer = new RTCSessionDescription(message);
            this.setAnswer(fromId, answer);
            break;
          case "candidate":
            const candidate = new RTCIceCandidate(message.ice);
            this.addIceCandidate(fromId, candidate);
            break;
          case "call me":
            this.makeOffer(fromId);
            break;
          case "bye":
            this.stopConnection(fromId);
            break;
        }
      });

      this.socket.on("user disconnected", (evt: any) => { 
        const id = evt.id;
        this.stopConnection(id);
      });

      this.callMe();
    });
  }

  hangUp() {
    this.emitRoom({ type: "bye" });
    this.stopAllConnection();
  }

  onPeerJoin(f: (stream: MediaStream) => void) {
    this.peerJoinCallback = f;
  }

  onPeerLeave(f: (streamId: string) => void) {
    this.peerLeaveCallback = f;
  }
  
  private emitRoom(msg: any) {
    this.socket.emit("message", msg);
  }

  private emitTo(id: any, msg: any) {
    msg.sendto = id;
    this.socket.emit("message", msg);
  }

  private stopConnection(id: any) {
    const peer = this.peerConnections[id];
    peer.close();
    delete this.peerConnections[id];
    delete this.remoteStreams[id];
    this.peerLeaveCallback(this.remoteStreams[id].id);
  }

  private stopAllConnection() {
    for (const id in this.peerConnections) {
      if (this.peerConnections.hasOwnProperty(id)) {
        this.stopConnection(id);
      }
    }
  }

  private stopLocalStream(stream: MediaStream) {
    const tracks = stream.getTracks();
    for (const track of tracks) {
      track.stop();
    }
  }

  private sendSdp(id: any, sessionDescription: RTCSessionDescriptionInit) {
    const message = { type: sessionDescription.type, sdp: sessionDescription.sdp };
    this.emitTo(id, message);
  }

  private sendIceCandidate(id: any, candidate: RTCIceCandidate) {
    const obj = { type: "candidate", ice: candidate };
    this.emitTo(id, obj);
  }
  
  private prepareNewConnection(id: any) {
    const pc_config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    };
    const peer = new RTCPeerConnection(pc_config);
    
    peer.ontrack = event => {
      if (event.track.kind === 'video') {
        const stream = event.streams[0];
        this.remoteStreams[id] = stream;
        this.peerJoinCallback(stream);

        stream.onremovetrack = () => {
          this.localStream!.getTracks().forEach(track => {
            peer.removeTrack(peer.addTrack(track, this.localStream!));
          });
        };
      }
    };
    
    peer.onicecandidate = evt => {
      if (evt.candidate) {
        this.sendIceCandidate(id, evt.candidate);
      }
    };
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream!);
      });
    }

    return peer;
  }

  private makeOffer(id: any) {
    const peerConnection = this.prepareNewConnection(id);
    this.peerConnections[id] = peerConnection;

    peerConnection.createOffer().then(sessionDescription => {
      return peerConnection.setLocalDescription(sessionDescription);
    }).then(() => {
      this.sendSdp(id, peerConnection.localDescription!);
    });
  }

  private setOffer(id: any, sessionDescription: RTCSessionDescriptionInit) {
    const peerConnection = this.prepareNewConnection(id);
    this.peerConnections[id] = peerConnection;

    peerConnection.setRemoteDescription(sessionDescription).then(() => {
      this.makeAnswer(id);
    });
  }

  private makeAnswer(id: any) {
    const peerConnection = this.peerConnections[id];
    peerConnection.createAnswer().then(sessionDescription => {
      return peerConnection.setLocalDescription(sessionDescription);
    }).then(() => {
      this.sendSdp(id, peerConnection.localDescription!);
    });
  }

  private setAnswer(id: any, sessionDescription: RTCSessionDescriptionInit) {
    const peerConnection = this.peerConnections[id];
    peerConnection.setRemoteDescription(sessionDescription);
  }
  
  private addIceCandidate(id: any, candidate: RTCIceCandidate) {
    const peerConnection = this.peerConnections[id];
    peerConnection.addIceCandidate(candidate);
  }
  
  private callMe() {
    this.emitRoom({ type: "call me" });
  }
}