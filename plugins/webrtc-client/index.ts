import io from "socket.io-client";
declare const MediaRecorder: any;

export default class WebRTCClient {
  private localStream: MediaStream | null;
  private remoteStreams: { [index: string]: MediaStream } = {};
  private recorder: any;
  private mediaChunks: BlobPart[] = [];

  private peerConnections: RTCPeerConnection[] = [];
  private dataChannels: RTCDataChannel[] = [];

  private port = 3001;
  private socket!: SocketIOClient.Socket;

  private peerJoinCallback!: (stream: MediaStream) => void;
  private peerLeaveCallback!: (streamId: string) => void;
  private receivedDataCallback!: (data: any) => void;

  async setLocalStream() {
    const constraints = {
      video: true,
      audio: true,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.recorder = new MediaRecorder(this.localStream);
    return this.localStream;
  }

  startRecording() {
    this.recorder.start(1000);
    this.recorder.ondataavailable = (evt) => {
      this.mediaChunks.push(evt.data);
      console.log("PUSHED");
      console.log(this.mediaChunks);
    };
  }

  stopRecording() {
    this.recorder.stop();
    return this.playRecorded();
  }

  private playRecorded() {
    const videoBlob = new Blob(this.mediaChunks, { type: "video/webm" });
    const blobUrl = URL.createObjectURL(videoBlob);
    return blobUrl;
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

  async getSdpTest() {
    const pc_config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    };
    const peer = new RTCPeerConnection(pc_config);

    peer.ontrack = event => {
      console.log("ontrack");
      const stream = event.streams[0];
      stream.onremovetrack = () => {
        this.localStream!.getTracks().forEach(track => {
          peer.removeTrack(peer.addTrack(track, this.localStream!));
        });
      };
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream!);
      });
    }

    const sdp = await peer.createOffer();
    peer.setLocalDescription(sdp);
    console.log(sdp.sdp);
  }

  onPeerJoin(f: (stream: MediaStream) => void) {
    this.peerJoinCallback = f;
  }

  onPeerLeave(f: (streamId: string) => void) {
    this.peerLeaveCallback = f;
  }

  onReceivedData(f: (data: any) => void) {
    this.receivedDataCallback = f;
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
    
    peer.onicecandidate = evt => {
      if (evt.candidate) {
        this.sendIceCandidate(id, evt.candidate);
      }
    };

    return peer;
  }

  private makeOffer(id: any) {
    const peerConnection = this.prepareNewConnection(id);
    this.peerConnections[id] = peerConnection;

    const dataChannel = peerConnection.createDataChannel("hoge");
    dataChannel.onopen = (ev) => {
      this.recorder.start(1000);
      this.recorder.ondataavailable = async ({data: blob}) => {
        console.log(blob);
        const reader = new FileReader();
        reader.readAsArrayBuffer(blob);
        reader.onload = () => {
          const buf = reader.result as ArrayBuffer;
          dataChannel.send(buf);
        };
      };
    };
    dataChannel.onmessage = ({data: buffer}) => {
      console.log(buffer);
      const blob = new Blob([buffer], {type: "video/webm"});
      const blobUrl = URL.createObjectURL(blob);
      this.receivedDataCallback(blobUrl);
    };
    dataChannel.onerror = (ev) => console.log(ev);
    dataChannel.onclose = (ev) => console.log(ev);

    peerConnection.createOffer().then(sessionDescription => {
      return peerConnection.setLocalDescription(sessionDescription);
    }).then(() => {
      this.sendSdp(id, peerConnection.localDescription!);
    });
  }

  private setOffer(id: any, sessionDescription: RTCSessionDescriptionInit) {
    const peerConnection = this.prepareNewConnection(id);
    this.peerConnections[id] = peerConnection;

    peerConnection.ondatachannel = (ev) => {
      const dataChannel = ev.channel;
      dataChannel.onopen = (ev) => {
        this.recorder.start(1000);
        this.recorder.ondataavailable = async ({data: blob}) => {
          console.log(blob);
          const reader = new FileReader();
          reader.readAsArrayBuffer(blob);
          reader.onload = () => {
            const buf = reader.result as ArrayBuffer;
            dataChannel.send(buf);
          };
        };
      };
      dataChannel.onmessage = ({data: buffer}) => {
        console.log(buffer);
        const blob = new Blob([buffer], {type: "video/webm"});
        const blobUrl = URL.createObjectURL(blob);
        this.receivedDataCallback(blobUrl);
      };
      dataChannel.onerror = (ev) => console.log(ev);
      dataChannel.onclose = (ev) => console.log(ev);
    };

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

  private sleep(msec) {
    return new Promise(function(resolve) {
  
       setTimeout(function() {resolve()}, msec);
  
    })
  }
}