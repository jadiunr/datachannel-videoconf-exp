<template lang="pug">
section
  p socket.io signaling for multi-party (trickle ICE)
  p {{$route.params.room}}
  button(type="button" @click="startVideo") Start Video
  button(type="button" @click="stopVideo") Stop Video
  button(type="button" @click="connect") Connect
  button(type="button" @click="hangUp") Hang Up
  button(type="button" @click="startRecording") Start Recording
  button(type="button" @click="stopRecording") Stop Recording
  div
    video(ref="localVideo" autoplay)
    video(ref="recordedVideo" autoplay)
  div
    stream-video(v-for="stream in streams" :stream="stream" :key="stream.id")
  div
    video(ref="dataChannelVideo" autoplay)
</template>

<script lang="ts">
import {
  Component,
  Vue
} from "nuxt-property-decorator"
import StreamVideo from "~/components/StreamVideo.vue";
import WebRTCClient from "~/plugins/webrtc-client"

@Component({
  components: { StreamVideo }
})
export default class extends Vue {
  private rtc: WebRTCClient = new WebRTCClient
  private localStream: MediaStream | null
  private localVideo: HTMLVideoElement
  streams: { [index: string]: MediaStream } = {}

  async startVideo() {
    this.localStream = await this.rtc.setLocalStream();
    this.localVideo = this.$refs.localVideo as HTMLVideoElement;
    this.localVideo.srcObject = this.localStream;
    console.log(this.$route.params.room);
  }

  stopVideo() {
    this.rtc.stopVideo();
    this.localVideo.srcObject = null;
    this.localStream = null;
  }

  connect() {
    this.rtc.connect(this.$route.params.room);
    this.rtc.onPeerJoin((stream) => {
      this.$set(this.streams, stream.id, stream);
    });
    this.rtc.onPeerLeave(streamId => {
      this.$delete(this.streams, streamId);
    });
    this.rtc.onReceivedData((data) => {
      (this.$refs.dataChannelVideo as HTMLVideoElement).src = data;
    });
  }

  hangUp() {

  }

  startRecording() {
    this.rtc.startRecording();
  }

  async stopRecording() {
    (this.$refs.recordedVideo as HTMLVideoElement).src = await this.rtc.stopRecording();
  }
}
</script>